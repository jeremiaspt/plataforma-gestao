import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { currentBillingMonthValue, formatBillingPeriod, getBillingCycleLabel } from "@/lib/billingCycles";
import { calculateGroupClassTimesheet } from "@/lib/groupClassTimesheet";
import { hasRole, requireUser } from "@/lib/auth";
import { getHolidayForDate } from "@/lib/holidays";
import { getSystemSettings } from "@/lib/maintenance";
import { formatCurrency } from "@/lib/money";
import { dateToInputValue } from "@/lib/pool";
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
  return ["D", "2ª", "3ª", "4ª", "5ª", "6ª", "S"][date.getDay()];
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
  const tabHref = (tab: "mine" | "professor") => `/folha-horas-aulas?tab=${tab}&month=${selectedMonth}`;

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel timesheet-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Aulas de grupo</p>
            <h1>Folha de horas</h1>
            <p className="muted">
              {timesheet.teacher.name} · {formatBillingPeriod(timesheet.period.start, timesheet.period.endExclusive)} ·{" "}
              {getBillingCycleLabel(timesheet.teacher.billingCycle)}
            </p>
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
            <label htmlFor="month">Mês</label>
            <input id="month" name="month" type="month" defaultValue={selectedMonth} />
          </div>
          <button className="button secondary" type="submit">
            Ver folha
          </button>
        </form>

        <div className="timesheet-table-wrap">
          <table className="timesheet-table">
            <thead>
              <tr>
                <th>Caract.</th>
                <th>Valor/hora</th>
                {periodDates.map((date) => {
                  const dateValue = dateToInputValue(date);
                  const holiday = holidayByDate.get(dateValue);

                  return (
                    <th className={holiday ? "timesheet-holiday-cell" : undefined} key={dateValue} title={holiday?.name}>
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
                    const value = row.calculationMode === "minutes" ? formatDayHours(hours) : count || "";
                    return (
                      <td className={holidayByDate.has(dateValue) ? "timesheet-holiday-cell" : undefined} key={dateValue}>
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

        {timesheet.unmatched.length > 0 ? (
          <div className="timesheet-unmatched">
            <h2>Aulas sem regra</h2>
            <p className="muted">Estas aulas foram encontradas, mas ainda não entram em nenhuma característica de valor hora.</p>
            {timesheet.unmatched.slice(0, 20).map((item, index) => (
              <p key={`${item.date}-${index}`}>
                {item.date} · {item.title} · {item.poolKey} · {item.hours.toFixed(2)}h
              </p>
            ))}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
