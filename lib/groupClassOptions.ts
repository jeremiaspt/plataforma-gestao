import { formatMinutes, getPoolMapByKey, poolWeekdays } from "@/lib/pool";
import { prisma } from "@/lib/prisma";

type GroupClassBlock = {
  id: string;
  poolKey: string;
  weekday: number;
  laneNumber: number;
  startMinutes: number;
  endMinutes: number;
  title: string;
  teacher: {
    id: string;
    email: string;
    name: string;
  } | null;
};

export type GroupClassOption = {
  blockIds: string[];
  classKey: string;
  detail: string;
  label: string;
  poolLabel: string;
  teacherEmail: string;
  teacherId: string;
  teacherName: string;
  title: string;
  weeklyCountLabel: string;
};

const weekdayShortLabels = new Map(poolWeekdays.map((weekday) => [weekday.key, weekday.shortLabel]));

function normalizeTitle(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildClassKey(block: GroupClassBlock) {
  return [block.poolKey, block.teacher?.id || "", normalizeTitle(block.title)].join("__");
}

function laneLabel(block: GroupClassBlock) {
  const poolMap = getPoolMapByKey(block.poolKey);
  const lane = poolMap.lanes.find((item) => item.number === block.laneNumber);
  return lane?.label || `${poolMap.laneFieldLabel} ${block.laneNumber}`;
}

function blockDetail(block: GroupClassBlock) {
  const weekday = weekdayShortLabels.get(block.weekday) || String(block.weekday);
  return `${weekday} ${formatMinutes(block.startMinutes)}-${formatMinutes(block.endMinutes)} (${laneLabel(block)})`;
}

export function formatGroupClassOption(option: GroupClassOption) {
  return `${option.title} - ${option.teacherName} - ${option.poolLabel} - ${option.weeklyCountLabel} - ${option.detail}`;
}

export async function getGroupClassOptions(): Promise<GroupClassOption[]> {
  const blocks = await prisma.poolScheduleBlock.findMany({
    where: {
      active: true,
      poolKey: { not: "apoio_cais" },
      type: "aula",
      teacherId: { not: null }
    },
    include: {
      teacher: { select: { id: true, email: true, name: true } }
    },
    orderBy: [{ poolKey: "asc" }, { title: "asc" }, { weekday: "asc" }, { startMinutes: "asc" }, { laneNumber: "asc" }]
  });

  const groups = new Map<string, GroupClassBlock[]>();

  for (const block of blocks) {
    if (!block.teacher) continue;
    const key = buildClassKey(block);
    const group = groups.get(key) || [];
    group.push(block);
    groups.set(key, group);
  }

  return Array.from(groups.entries())
    .map(([classKey, group]) => {
      const first = group[0];
      const poolLabel = getPoolMapByKey(first.poolKey).eyebrow;
      const sortedBlocks = group.sort((a, b) => a.weekday - b.weekday || a.startMinutes - b.startMinutes || a.laneNumber - b.laneNumber);
      const weeklyCount = new Set(sortedBlocks.map((block) => block.weekday)).size;
      const weeklyCountLabel = `${weeklyCount}x/semana`;

      return {
        blockIds: sortedBlocks.map((block) => block.id),
        classKey,
        detail: sortedBlocks.map(blockDetail).join("; "),
        label: formatGroupClassOption({
          blockIds: [],
          classKey,
          detail: sortedBlocks.map(blockDetail).join("; "),
          label: "",
          poolLabel,
          teacherEmail: first.teacher?.email || "",
          teacherId: first.teacher?.id || "",
          teacherName: first.teacher?.name || "",
          title: first.title,
          weeklyCountLabel
        }),
        poolLabel,
        teacherEmail: first.teacher?.email || "",
        teacherId: first.teacher?.id || "",
        teacherName: first.teacher?.name || "",
        title: first.title,
        weeklyCountLabel
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, "pt") || a.teacherName.localeCompare(b.teacherName, "pt"));
}

export function findGroupClassOption(options: GroupClassOption[], classKey: string) {
  return options.find((option) => option.classKey === classKey) || null;
}
