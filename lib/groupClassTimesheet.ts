import { Prisma } from "@prisma/client";
import { parseBillingMonth } from "@/lib/billingCycles";
import { getHolidayForDate, HolidayOptions } from "@/lib/holidays";
import { decimalToNumber } from "@/lib/money";
import { dateToInputValue, poolBlockAppliesToDate } from "@/lib/pool";
import { prisma } from "@/lib/prisma";

type RateRule = {
  id: string;
  name: string;
  hourlyRate: Prisma.Decimal | number;
  matchSource: string;
  matchPatterns: string | null;
  calculationMode: string;
  durationFilter: number | null;
  weekendOnly: boolean;
  countByFortyFiveMinutes: boolean;
  displayOrder: number;
};

type Block = {
  id: string;
  poolKey: string;
  weekday: number;
  startMinutes: number;
  endMinutes: number;
  title: string;
  notes: string | null;
  recurrenceType: string;
  validFrom: Date | null;
  validTo: Date | null;
  groupKeySuffix?: string;
};

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function eachDate(start: Date, endExclusive: Date) {
  const dates: Date[] = [];
  for (let date = new Date(start); date < endExclusive; date = addDays(date, 1)) {
    dates.push(new Date(date));
  }
  return dates;
}

function getCalendarMonthPeriod(monthValue?: string) {
  const { year, monthIndex } = parseBillingMonth(monthValue);

  return {
    start: new Date(year, monthIndex, 1),
    endExclusive: new Date(year, monthIndex + 1, 1)
  };
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function rulePatterns(rule: RateRule) {
  return (rule.matchPatterns || "")
    .split(/[\/,;\n\r]+/)
    .map((pattern) => normalize(pattern))
    .filter(Boolean);
}

function blockMatchesRule(block: Block, rule: RateRule) {
  if (rule.durationFilter && block.endMinutes - block.startMinutes !== rule.durationFilter) {
    return false;
  }

  if (rule.matchSource === "apoio_cais") {
    return block.poolKey === "apoio_cais";
  }

  const patterns = rulePatterns(rule);
  if (patterns.length === 0) {
    return false;
  }

  const title = normalize(block.title);
  return patterns.some((pattern) => title.startsWith(pattern));
}

function mergeSameClassBlocks(blocks: Block[]) {
  const merged = new Map<string, Block>();

  for (const block of blocks) {
    const key = [block.poolKey, block.startMinutes, block.title, block.notes || ""].join("|");
    const current = merged.get(key);

    if (!current) {
      merged.set(key, { ...block });
      continue;
    }

    current.endMinutes = Math.max(current.endMinutes, block.endMinutes);
  }

  return Array.from(merged.values());
}

function overlapMinutes(startMinutes: number, endMinutes: number, intervals: Array<{ startMinutes: number; endMinutes: number }>) {
  const normalizedIntervals = intervals
    .map((interval) => ({
      startMinutes: Math.max(startMinutes, interval.startMinutes),
      endMinutes: Math.min(endMinutes, interval.endMinutes)
    }))
    .filter((interval) => interval.endMinutes > interval.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  let total = 0;
  let currentStart: number | null = null;
  let currentEnd: number | null = null;

  for (const interval of normalizedIntervals) {
    if (currentStart === null || currentEnd === null) {
      currentStart = interval.startMinutes;
      currentEnd = interval.endMinutes;
      continue;
    }

    if (interval.startMinutes <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.endMinutes);
      continue;
    }

    total += currentEnd - currentStart;
    currentStart = interval.startMinutes;
    currentEnd = interval.endMinutes;
  }

  if (currentStart !== null && currentEnd !== null) {
    total += currentEnd - currentStart;
  }

  return total;
}

export async function calculateGroupClassTimesheet({
  excludeDockSupportOverlapWithClasses = false,
  holidayOptions,
  month,
  teacherId
}: {
  excludeDockSupportOverlapWithClasses?: boolean;
  holidayOptions: HolidayOptions;
  month?: string;
  teacherId: string;
}) {
  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { id: true, name: true, billingCycle: true }
  });

  if (!teacher) {
    return null;
  }

  const period = getCalendarMonthPeriod(month);
  const [rules, blocks, outgoingSubstitutions, incomingSubstitutions] = await Promise.all([
    prisma.groupClassHourlyRate.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    }),
    prisma.poolScheduleBlock.findMany({
      where: {
        active: true,
        teacherId,
        type: "aula"
      },
      orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }, { poolKey: "asc" }, { laneNumber: "asc" }]
    }),
    prisma.groupClassSubstitutionItem.findMany({
      where: {
        status: "approved",
        request: {
          absentTeacherId: teacherId,
          status: "approved",
          substitutionDate: { gte: period.start, lt: period.endExclusive }
        }
      },
      include: { request: { select: { substitutionDate: true } } }
    }),
    prisma.groupClassSubstitutionItem.findMany({
      where: {
        status: "approved",
        substituteTeacherId: teacherId,
        request: {
          status: "approved",
          substitutionDate: { gte: period.start, lt: period.endExclusive }
        }
      },
      include: { request: { select: { substitutionDate: true } } },
      orderBy: [{ startMinutes: "asc" }, { poolKey: "asc" }, { laneNumber: "asc" }]
    })
  ]);
  const outgoingSubstitutionsByDate = new Map<string, Set<string>>();
  const incomingSubstitutionsByDate = new Map<string, Block[]>();

  for (const item of outgoingSubstitutions) {
    const dateValue = dateToInputValue(item.request.substitutionDate);
    const blockIds = outgoingSubstitutionsByDate.get(dateValue) || new Set<string>();
    blockIds.add(item.poolScheduleBlockId);
    outgoingSubstitutionsByDate.set(dateValue, blockIds);
  }

  for (const item of incomingSubstitutions) {
    const dateValue = dateToInputValue(item.request.substitutionDate);
    const dayBlocks = incomingSubstitutionsByDate.get(dateValue) || [];

    dayBlocks.push({
      id: item.id,
      poolKey: item.poolKey,
      weekday: item.request.substitutionDate.getDay(),
      startMinutes: item.startMinutes,
      endMinutes: item.endMinutes,
      title: item.accumulation ? `ACUM. ${item.title}` : item.title,
      notes: item.notes,
      recurrenceType: "substitution",
      validFrom: item.request.substitutionDate,
      validTo: item.request.substitutionDate,
      groupKeySuffix: item.accumulation ? "accumulation" : undefined
    });
    incomingSubstitutionsByDate.set(dateValue, dayBlocks);
  }

  const rows = rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    hourlyRate: decimalToNumber(rule.hourlyRate),
    calculationMode: rule.calculationMode,
    countByFortyFiveMinutes: rule.countByFortyFiveMinutes,
    dayCounts: new Map<string, number>(),
    dayHours: new Map<string, number>(),
    totalHours: 0,
    totalValue: 0
  }));
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const unmatched: Array<{ date: string; title: string; poolKey: string; hours: number }> = [];

  for (const date of eachDate(period.start, period.endExclusive)) {
    if (getHolidayForDate(date, holidayOptions)) {
      continue;
    }

    const dateValue = dateToInputValue(date);
    const weekday = date.getDay();
    const grouped = new Map<string, Block[]>();
    const substitutedBlockIds = outgoingSubstitutionsByDate.get(dateValue) || new Set<string>();
    const ownBlocks = blocks.filter(
      (item) => item.weekday === weekday && !substitutedBlockIds.has(item.id) && poolBlockAppliesToDate(item, date)
    );
    const dayBlocks = mergeSameClassBlocks([...ownBlocks, ...(incomingSubstitutionsByDate.get(dateValue) || [])]);
    const classIntervals = dayBlocks
      .filter((item) => item.poolKey !== "apoio_cais")
      .map((item) => ({ startMinutes: item.startMinutes, endMinutes: item.endMinutes }));

    for (const block of dayBlocks) {
      const key = [block.poolKey, block.startMinutes, block.endMinutes, block.groupKeySuffix || ""].join("|");
      grouped.set(key, [...(grouped.get(key) || []), block]);
    }

    for (const groupBlocks of grouped.values()) {
      const block = groupBlocks[0];
      const isWeekend = weekday === 0 || weekday === 6;
      const dayRules = isWeekend
        ? [...rules.filter((rule) => rule.weekendOnly), ...rules.filter((rule) => !rule.weekendOnly)]
        : rules.filter((rule) => !rule.weekendOnly);
      const matchingRule = dayRules.find((rule) => groupBlocks.some((groupBlock) => blockMatchesRule(groupBlock, rule)));
      const hours = (block.endMinutes - block.startMinutes) / 60;

      if (!matchingRule) {
        unmatched.push({ date: dateValue, title: groupBlocks.map((item) => item.title).join(", "), poolKey: block.poolKey, hours });
        continue;
      }

      const row = rowById.get(matchingRule.id);
      if (!row) {
        continue;
      }

      const countedMinutes =
        excludeDockSupportOverlapWithClasses && block.poolKey === "apoio_cais"
          ? Math.max(0, block.endMinutes - block.startMinutes - overlapMinutes(block.startMinutes, block.endMinutes, classIntervals))
          : block.endMinutes - block.startMinutes;
      const countedHours = countedMinutes / 60;

      if (countedMinutes <= 0) {
        continue;
      }

      row.dayHours.set(dateValue, (row.dayHours.get(dateValue) || 0) + countedHours);
      const countValue = matchingRule.countByFortyFiveMinutes ? countedMinutes / 45 : 1;

      row.dayCounts.set(dateValue, (row.dayCounts.get(dateValue) || 0) + countValue);
      row.totalHours += countedHours;
    }
  }

  for (const row of rows) {
    row.totalValue = row.totalHours * row.hourlyRate;
  }

  return {
    period,
    rows,
    teacher,
    unmatched
  };
}
