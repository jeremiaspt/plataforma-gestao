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
