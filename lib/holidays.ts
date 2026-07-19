import { dateToInputValue } from "@/lib/pool";

export type HolidayInfo = {
  date: string;
  name: string;
  scope: "national" | "municipal";
};

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
}

export function getPortugueseHolidays(year: number, includeLisbonMunicipalHolidays = false) {
  const easter = easterSunday(year);
  const holidays: HolidayInfo[] = [
    { date: `${year}-01-01`, name: "Ano Novo", scope: "national" },
    { date: dateToInputValue(addDays(easter, -2)), name: "Sexta-feira Santa", scope: "national" },
    { date: dateToInputValue(easter), name: "Páscoa", scope: "national" },
    { date: `${year}-04-25`, name: "Dia da Liberdade", scope: "national" },
    { date: `${year}-05-01`, name: "Dia do Trabalhador", scope: "national" },
    { date: dateToInputValue(addDays(easter, 60)), name: "Corpo de Deus", scope: "national" },
    { date: `${year}-06-10`, name: "Dia de Portugal", scope: "national" },
    { date: `${year}-08-15`, name: "Assunção de Nossa Senhora", scope: "national" },
    { date: `${year}-10-05`, name: "Implantação da República", scope: "national" },
    { date: `${year}-11-01`, name: "Dia de Todos os Santos", scope: "national" },
    { date: `${year}-12-01`, name: "Restauração da Independência", scope: "national" },
    { date: `${year}-12-08`, name: "Imaculada Conceição", scope: "national" },
    { date: `${year}-12-25`, name: "Natal", scope: "national" }
  ];

  if (includeLisbonMunicipalHolidays) {
    holidays.push({ date: `${year}-06-13`, name: "Santo António - Feriado Municipal de Lisboa", scope: "municipal" });
  }

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

export function getHolidayForDate(date: Date, includeLisbonMunicipalHolidays = false) {
  const dateValue = dateToInputValue(date);
  return getPortugueseHolidays(date.getFullYear(), includeLisbonMunicipalHolidays).find((holiday) => holiday.date === dateValue) || null;
}
