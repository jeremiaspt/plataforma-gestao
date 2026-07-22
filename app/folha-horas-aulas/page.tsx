import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { currentBillingMonthValue, formatBillingPeriod } from "@/lib/billingCycles";
import { calculateGroupClassTimesheet } from "@/lib/groupClassTimesheet";
import { hasRole, requireUser } from "@/lib/auth";
import { getHolidayForDate } from "@/lib/holidays";
import { getSystemSettings } from "@/lib/maintenance";
import { formatCurrency } from "@/lib/money";
import { dateToInputValue, formatMinutes, getPoolMapByKey } from "@/lib/pool";
import { prisma } from "@/lib/prisma";

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

function weekdayShortLabel(date: Date) {
  return ["D", "2a", "3a", "4a", "5a", "6a", "S"][date.getDay()];
}

function formatDayHours(value: number) {
  if (!value) {
    return "";
  }

  if (Number.isInteger(value)) {
    return value.toString();
  }

  return value.toFixed(2).replace(".", ",");
}

function formatDateValue(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-PT");
}

function classLabel(block: { poolKey: string; laneNumber: number }) {
  const poolMap = getPoolMapByKey(block.poolKey);
  const lane = poolMap.lanes.find((item) => item.number === block.laneNumber);
  return `${poolMap.eyebrow} - ${lane?.label || `${poolMap.laneFieldLabel} ${block.laneNumber}`}`;
}

function dockSupportTimeLabel(block: { endMinutes: number; poolKey: string; startMinutes: number }) {
  if (block.poolKey !== "apoio_cais") {
    return "";
  }

  const minutes = block.endMinutes - block.startMinutes;
  const hours = minutes / 60;
  return ` - ${minutes}min = ${hours.toFixed(2).replace(".", ",")}`;
}

function groupAbsenceDetails(
  items: Array<{
    accumulation: boolean;
    date: string;
    endMinutes: number;
    laneNumber: number;
    poolKey: string;
    startMinutes: number;
    substituteTeacherName: string;
    title: string;
  }>
) {
  const groups = new Map<string, { date: string; substituteTeacherName: string; classes: typeof items }>();

  for (const item of items) {
    const key = `${item.date}:${item.substituteTeacherName}`;
    const group = groups.get(key) || { date: item.date, substituteTeacherName: item.substituteTeacherName, classes: [] };
    group.classes.push(item);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      classes: group.classes.sort((left, right) => left.startMinutes - right.startMinutes || left.title.localeCompare(right.title, "pt"))
    }))
    .sort((left, right) => left.date.localeCompare(right.date) || left.substituteTeacherName.localeCompare(right.substituteTeacherName, "pt"));
}

function groupExtraDetails(
  items: Array<{
    absentTeacherName: string;
    accumulation: boolean;
    date: string;
    endMinutes: number;
    laneNumber: number;
    poolKey: string;
    startMinutes: number;
    title: string;
  }>
) {
  const groups = new Map<string, { absentTeacherName: string; date: string; classes: typeof items }>();

  for (const item of items) {
    const key = `${item.date}:${item.absentTeacherName}`;
    const group = groups.get(key) || { absentTeacherName: item.absentTeacherName, date: item.date, classes: [] };
    group.classes.push(item);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      classes: group.classes.sort((left, right) => left.startMinutes - right.startMinutes || left.title.localeCompare(right.title, "pt"))
    }))
    .sort((left, right) => left.date.localeCompare(right.date) || left.absentTeacherName.localeCompare(right.absentTeacherName, "pt"));
}
export default async function GroupClassTimesheetPage({
  searchParams
}: {
  searchParams: Promise<{ teacherId?: string; tab?: string; month?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);
  const isAdmin = hasRole(user, "admin");
  const isProfessor = hasRole(user, "professor");

  if (!isAdmin && !isProfessor) {
    redirect("/dashboard");
  }

  const teachers = isAdmin
    ? await prisma.user.findMany({
        where: { active: true, roles: { some: { role: { key: "professor" } } } },
        orderBy: { name: "asc" },
        select: { id: true, name: true }
      })
    : [];
  const activeTab = isAdmin && params.tab === "professor" ? "professor" : "mine";
  const selectedTeacherId = activeTab === "professor" ? params.teacherId || teachers[0]?.id || user.id : user.id;
  const selectedMonth = params.month || currentBillingMonthValue();
  const systemSettings = await getSystemSettings();
  const timesheet = await calculateGroupClassTimesheet({
    excludeDockSupportOverlapWithClasses: systemSettings.excludeDockSupportOverlapWithClasses,
    holidayOptions: {
      includeChristmasEveHoliday: systemSettings.includeChristmasEveHoliday,
      includeLisbonMunicipalHolidays: systemSettings.includeLisbonMunicipalHolidays,
      includeNewYearsEveHoliday: systemSettings.includeNewYearsEveHoliday
    },
    month: selectedMonth,
    teacherId: selectedTeacherId
  });

  if (!timesheet) {
    redirect("/dashboard");
  }

  const periodDates = eachDate(timesheet.period.start, timesheet.period.endExclusive);
  const holidayOptions = {
    includeChristmasEveHoliday: systemSettings.includeChristmasEveHoliday,
    includeLisbonMunicipalHolidays: systemSettings.includeLisbonMunicipalHolidays,
    includeNewYearsEveHoliday: systemSettings.includeNewYearsEveHoliday
  };
  const holidayByDate = new Map(
    periodDates
      .map((date) => [dateToInputValue(date), getHolidayForDate(date, holidayOptions)] as const)
      .filter(([, holiday]) => holiday)
  );
  const grandTotal = timesheet.rows.reduce((total, row) => total + row.totalValue, 0);
  const groupedAbsences = groupAbsenceDetails(timesheet.absenceDetails);
  const groupedExtras = groupExtraDetails(timesheet.extraDetails);
  const tabHref = (tab: "mine" | "professor") => `/folha-horas-aulas?tab=${tab}&month=${selectedMonth}`;

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel timesheet-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Aulas de grupo</p>
            <h1>Folha de horas</h1>
            <p className="muted">{timesheet.teacher.name} - {formatBillingPeriod(timesheet.period.start, timesheet.period.endExclusive)}</p>
          </div>
          <span className="status active">{formatCurrency(grandTotal)}</span>
        </div>

        <div className="tabs">
          <a className={activeTab === "mine" ? "tab active" : "tab"} href={tabHref("mine")}>
            A minha folha
          </a>
          {isAdmin ? (
            <a className={activeTab === "professor" ? "tab active" : "tab"} href={tabHref("professor")}>
              Consultar professor
            </a>
          ) : null}
        </div>

        <form className="timesheet-filter" method="get" action="/folha-horas-aulas">
          <input type="hidden" name="tab" value={activeTab} />
          {activeTab === "professor" && isAdmin ? (
            <div className="field">
              <label htmlFor="teacherId">Professor</label>
              <select id="teacherId" name="teacherId" defaultValue={selectedTeacherId}>
                {teachers.map((teacher) => (
                  <option value={teacher.id} key={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="month">Mes</label>
            <input id="month" name="month" type="month" defaultValue={selectedMonth} />
          </div>
          <button className="button secondary" type="submit">
            Ver folha
          </button>
        </form>

        <div className="timesheet-table-wrap">
          <table className="timesheet-table group-hours-timesheet-table">
            <thead>
              <tr>
                <th>Caract.</th>
                <th>Valor/hora</th>
                {periodDates.map((date) => {
                  const dateValue = dateToInputValue(date);
                  const holiday = holidayByDate.get(dateValue);
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

                  return (
                    <th
                      className={holiday ? "timesheet-holiday-cell" : isWeekend ? "timesheet-weekend-cell" : undefined}
                      key={dateValue}
                      title={holiday?.name}
                    >
                      <span>{date.getDate()}</span>
                      <small>{weekdayShortLabel(date)}</small>
                    </th>
                  );
                })}
                <th>Total horas</th>
                <th>Parcial</th>
              </tr>
            </thead>
            <tbody>
              {timesheet.rows.map((row) => (
                <tr key={row.id}>
                  <th>{row.name}</th>
                  <td>{row.hourlyRate.toFixed(2)}</td>
                  {periodDates.map((date) => {
                    const dateValue = dateToInputValue(date);
                    const count = row.dayCounts.get(dateValue) || 0;
                    const hours = row.dayHours.get(dateValue) || 0;
                    const value = row.calculationMode === "minutes" ? formatDayHours(hours) : formatDayHours(count);
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    return (
                      <td
                        className={holidayByDate.has(dateValue) ? "timesheet-holiday-cell" : isWeekend ? "timesheet-weekend-cell" : undefined}
                        key={dateValue}
                      >
                        {value}
                      </td>
                    );
                  })}
                  <td>{row.totalHours.toFixed(2).replace(".", ",")}</td>
                  <td>{formatCurrency(row.totalValue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={periodDates.length + 3}>Total</th>
                <th>{formatCurrency(grandTotal)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
        {groupedAbsences.length > 0 || groupedExtras.length > 0 ? (
          <div className="timesheet-detail-sections">
            {groupedAbsences.length > 0 ? (
              <section className="timesheet-detail-list">
                <div>
                  <h2>Faltas</h2>
                  <p className="muted">Aulas retiradas desta folha por substituicao.</p>
                </div>
                <div className="timesheet-detail-grid">
                  {groupedAbsences.map((group) => (
                    <div className="timesheet-detail-card" key={`${group.date}-${group.substituteTeacherName}`}>
                      <strong>{formatDateValue(group.date)} - Substituto: {group.substituteTeacherName}</strong>
                      {group.classes.map((item, index) => (
                        <span key={`${item.title}-${index}`}>
                          {formatMinutes(item.startMinutes)} - {formatMinutes(item.endMinutes)} - {item.title}
                          {item.accumulation ? " (ACUM.)" : ""} - {classLabel(item)}
                          {dockSupportTimeLabel(item)}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {groupedExtras.length > 0 ? (
              <section className="timesheet-detail-list">
                <div>
                  <h2>Extras</h2>
                  <p className="muted">Substituicoes feitas por outros professores neste periodo.</p>
                </div>
                <div className="timesheet-detail-grid">
                  {groupedExtras.map((group) => (
                    <div className="timesheet-detail-card" key={`${group.date}-${group.absentTeacherName}`}>
                      <strong>{formatDateValue(group.date)} - Por: {group.absentTeacherName}</strong>
                      {group.classes.map((item, index) => (
                        <span key={`${item.title}-${index}`}>
                          {formatMinutes(item.startMinutes)} - {formatMinutes(item.endMinutes)} - {item.title}
                          {item.accumulation ? " (ACUM.)" : ""} - {classLabel(item)}
                          {dockSupportTimeLabel(item)}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
        {timesheet.unmatched.length > 0 ? (
          <div className="timesheet-unmatched">
            <h2>Aulas sem regra</h2>
            <p className="muted">Estas aulas foram encontradas, mas ainda não entram em nenhuma característica de valor hora.</p>
            {timesheet.unmatched.slice(0, 20).map((item, index) => (
              <p key={`${item.date}-${index}`}>
                {item.date} - {item.title} - {item.poolKey} - {item.hours.toFixed(2)}h
              </p>
            ))}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
