import { Prisma } from "@prisma/client";
import { getBillingPeriod } from "@/lib/billingCycles";
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

export async function calculateGroupClassTimesheet({
  holidayOptions,
  month,
  teacherId
}: {
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

  const period = getBillingPeriod(teacher.billingCycle, month);
  const [rules, blocks] = await Promise.all([
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
    })
  ]);

  const rows = rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    hourlyRate: decimalToNumber(rule.hourlyRate),
    calculationMode: rule.calculationMode,
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

    for (const block of blocks.filter((item) => item.weekday === weekday && poolBlockAppliesToDate(item, date))) {
      const key = [block.poolKey, block.startMinutes, block.endMinutes].join("|");
      grouped.set(key, [...(grouped.get(key) || []), block]);
    }

    for (const groupBlocks of grouped.values()) {
      const block = groupBlocks[0];
      const matchingRule = rules.find((rule) => groupBlocks.some((groupBlock) => blockMatchesRule(groupBlock, rule)));
      const hours = (block.endMinutes - block.startMinutes) / 60;

      if (!matchingRule) {
        unmatched.push({ date: dateValue, title: groupBlocks.map((item) => item.title).join(", "), poolKey: block.poolKey, hours });
        continue;
      }

      const row = rowById.get(matchingRule.id);
      if (!row) {
        continue;
      }

      row.dayHours.set(dateValue, (row.dayHours.get(dateValue) || 0) + hours);
      row.dayCounts.set(dateValue, (row.dayCounts.get(dateValue) || 0) + 1);
      row.totalHours += hours;
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
