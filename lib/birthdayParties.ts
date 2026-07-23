export const birthdayPartySlots = [
  { key: "15_18", label: "15:00 - 18:00", startMinutes: 15 * 60, endMinutes: 18 * 60 },
  { key: "1630_1930", label: "16:30 - 19:30", startMinutes: 16 * 60 + 30, endMinutes: 19 * 60 + 30 }
];

export const birthdayAgeGroups = [
  { key: "4_7", label: "4 a 7 anos", baseLimit: 20 },
  { key: "8_plus", label: "+8 anos", baseLimit: 30 }
];

export function currentMonthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function parseMonthValue(value?: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value || "");

  if (!match) {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  }

  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 };
}

export function monthPeriod(month?: string) {
  const { year, monthIndex } = parseMonthValue(month);
  return {
    endExclusive: new Date(year, monthIndex + 1, 1),
    start: new Date(year, monthIndex, 1)
  };
}

export function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDateInput(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function weekendDatesForMonth(month?: string) {
  const period = monthPeriod(month);
  const dates: Date[] = [];

  for (let date = new Date(period.start); date < period.endExclusive; date.setDate(date.getDate() + 1)) {
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) {
      dates.push(new Date(date));
    }
  }

  return dates;
}

export function slotByKey(key: string) {
  return birthdayPartySlots.find((slot) => slot.key === key) || null;
}

export function ageGroupByKey(key: string) {
  return birthdayAgeGroups.find((group) => group.key === key) || null;
}

export function requiredBirthdayMonitors(ageGroup: string, childCount: number) {
  const group = ageGroupByKey(ageGroup);
  if (!group) return 2;
  return childCount > group.baseLimit ? 3 : 2;
}

export function paymentStatusLabel(status: string) {
  return status === "paid" ? "Pago" : "Nao Pago";
}
