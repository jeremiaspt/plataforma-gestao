export const poolWeekdays = [
  { key: 1, label: "Segunda", shortLabel: "Seg" },
  { key: 2, label: "Terça", shortLabel: "Ter" },
  { key: 3, label: "Quarta", shortLabel: "Qua" },
  { key: 4, label: "Quinta", shortLabel: "Qui" },
  { key: 5, label: "Sexta", shortLabel: "Sex" },
  { key: 6, label: "Sábado", shortLabel: "Sáb" },
  { key: 0, label: "Domingo", shortLabel: "Dom" }
];

export type PoolMapConfig = {
  basePath: string;
  eyebrow: string;
  key: string;
  laneFieldLabel: string;
  lanes: Array<{ number: number; label: string }>;
  scheduleMode?: "standard" | "teacherOnly";
  title: string;
};

export const poolMaps = {
  piscina25m: {
    basePath: "/piscina-25m",
    eyebrow: "Piscina 25m",
    key: "piscina_25m",
    laneFieldLabel: "Pista",
    lanes: [1, 2, 3, 4, 5, 6].map((lane) => ({ number: lane, label: `Pista ${lane}` })),
    title: "Mapa de disponibilidade"
  },
  tanqueAprendizagem: {
    basePath: "/tanque-aprendizagem",
    eyebrow: "Tanque de aprendizagem",
    key: "tanque_aprendizagem",
    laneFieldLabel: "Espaço",
    lanes: [
      { number: 1, label: "E1" },
      { number: 2, label: "E2" },
      { number: 3, label: "E3" },
      { number: 4, label: "E4" },
      { number: 5, label: "E5 rampa" }
    ],
    title: "Mapa de disponibilidade"
  },
  apoioCais: {
    basePath: "/apoio-ao-cais",
    eyebrow: "Apoio ao Cais",
    key: "apoio_cais",
    laneFieldLabel: "Espaço",
    lanes: [{ number: 1, label: "Apoio" }],
    scheduleMode: "teacherOnly",
    title: "Mapa de disponibilidade"
  }
} satisfies Record<string, PoolMapConfig>;

export const poolLanes = poolMaps.piscina25m.lanes.map((lane) => lane.number);

export function getPoolMapByKey(poolKey: string) {
  return Object.values(poolMaps).find((poolMap) => poolMap.key === poolKey) || poolMaps.piscina25m;
}

export const poolBlockTypes = [
  { key: "aula", label: "Aula" },
  { key: "treino", label: "Treino" },
  { key: "aluguer", label: "Aluguer" },
  { key: "manutencao", label: "Manutenção" },
  { key: "evento", label: "Evento" },
  { key: "outro", label: "Outro" }
];

export const poolRecurrenceOptions = [
  { key: "recurring", label: "Recorrente" },
  { key: "period", label: "Período" }
];

export function dayBounds(weekday: number) {
  if (weekday === 0 || weekday === 6) {
    return { start: 8 * 60 + 45, end: 13 * 60 + 30 };
  }

  return { start: 7 * 60, end: 21 * 60 };
}

export function buildTimeSlots(weekday: number) {
  const { start, end } = dayBounds(weekday);
  const slots: number[] = [];

  for (let minutes = start; minutes <= end; minutes += 5) {
    slots.push(minutes);
  }

  return slots;
}

export function dateToInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parseDateParam(value?: string) {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

export function parseDateInput(value: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizedDateValue(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function poolBlockAppliesToDate(
  block: { recurrenceType?: string | null; validFrom?: Date | string | null; validTo?: Date | string | null },
  date: Date
) {
  if (block.recurrenceType !== "period") {
    return true;
  }

  const selected = normalizedDateValue(date);
  const validFrom = normalizedDateValue(block.validFrom);
  const validTo = normalizedDateValue(block.validTo);

  if (selected === null || validFrom === null || validTo === null) {
    return false;
  }

  return selected >= validFrom && selected <= validTo;
}

export function poolBlockPeriodsOverlap(
  first: { recurrenceType?: string | null; validFrom?: Date | string | null; validTo?: Date | string | null },
  second: { recurrenceType?: string | null; validFrom?: Date | string | null; validTo?: Date | string | null }
) {
  if (first.recurrenceType !== "period" || second.recurrenceType !== "period") {
    return true;
  }

  const firstFrom = normalizedDateValue(first.validFrom);
  const firstTo = normalizedDateValue(first.validTo);
  const secondFrom = normalizedDateValue(second.validFrom);
  const secondTo = normalizedDateValue(second.validTo);

  if (firstFrom === null || firstTo === null || secondFrom === null || secondTo === null) {
    return true;
  }

  return firstFrom <= secondTo && secondFrom <= firstTo;
}

export function dateToWeekday(date: Date) {
  return date.getDay();
}

export function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function isTodayOrFuture(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selected = new Date(date);
  selected.setHours(0, 0, 0, 0);

  return selected >= today;
}

export function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function parseTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

export function canAccessPoolMap(roleKeys: string[]) {
  return roleKeys.some((role) => ["admin", "professor", "recepcao"].includes(role));
}

export function overlapsExistingBlock({
  startMinutes,
  endMinutes,
  existingStart,
  existingEnd
}: {
  startMinutes: number;
  endMinutes: number;
  existingStart: number;
  existingEnd: number;
}) {
  return startMinutes < existingEnd && endMinutes > existingStart;
}
