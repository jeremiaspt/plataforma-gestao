export const poolWeekdays = [
  { key: 1, label: "Segunda", shortLabel: "Seg" },
  { key: 2, label: "Terça", shortLabel: "Ter" },
  { key: 3, label: "Quarta", shortLabel: "Qua" },
  { key: 4, label: "Quinta", shortLabel: "Qui" },
  { key: 5, label: "Sexta", shortLabel: "Sex" },
  { key: 6, label: "Sábado", shortLabel: "Sáb" },
  { key: 0, label: "Domingo", shortLabel: "Dom" }
];

export const poolLanes = [1, 2, 3, 4, 5, 6];

export const poolBlockTypes = [
  { key: "aula", label: "Aula" },
  { key: "treino", label: "Treino" },
  { key: "aluguer", label: "Aluguer" },
  { key: "manutencao", label: "Manutenção" },
  { key: "evento", label: "Evento" },
  { key: "outro", label: "Outro" }
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
