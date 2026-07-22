import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { currentBillingMonthValue, formatBillingPeriod, getBillingCycleLabel } from "@/lib/billingCycles";
import { formatCurrency } from "@/lib/money";
import { dateToInputValue } from "@/lib/pool";
import { eachPeriodDate, calculatePersonalTrainingTimesheet } from "@/lib/personalTrainingTimesheet";
import { prisma } from "@/lib/prisma";

function weekdayShortLabel(date: Date) {
  return ["D", "2ª", "3ª", "4ª", "5ª", "6ª", "S"][date.getDay()];
}

function formatCellValue(value: number) {
  if (!value) return "";
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2).replace(".", ",");
}

export default async function PersonalTrainingTimesheetPage({
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
  const timesheet = await calculatePersonalTrainingTimesheet({ month: selectedMonth, teacherId: selectedTeacherId });

  if (!timesheet) {
    redirect("/dashboard");
  }

  const periodDates = eachPeriodDate(timesheet.period.start, timesheet.period.endExclusive);
  const grandTotal = timesheet.rows.reduce((total, row) => total + row.totalValue, 0);
  const tabHref = (tab: "mine" | "professor") => `/folha-treinos?tab=${tab}&month=${selectedMonth}`;

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel timesheet-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Treinos personalizados</p>
            <h1>Folha de treinos</h1>
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

        <form className="timesheet-filter" method="get" action="/folha-treinos">
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
          <table className="timesheet-table personal-training-timesheet-table">
            <thead>
              <tr>
                <th>Caract.</th>
                <th>N.º alunos</th>
                <th>Valor por aluno</th>
                {periodDates.map((date) => {
                  const dateValue = dateToInputValue(date);

                  return (
                    <th key={dateValue}>
                      <span>{date.getDate()}</span>
                      <small>{weekdayShortLabel(date)}</small>
                    </th>
                  );
                })}
                <th>Total aulas</th>
                <th>Parcial</th>
              </tr>
            </thead>
            <tbody>
              {timesheet.rows.map((row) => (
                <tr key={row.id}>
                  <th>{row.name}</th>
                  <td>{row.studentCount}</td>
                  <td>{formatCurrency(row.valuePerStudent)}</td>
                  {periodDates.map((date) => {
                    const dateValue = dateToInputValue(date);
                    const value = row.dayLessons.get(dateValue) || 0;

                    return <td key={dateValue}>{formatCellValue(value)}</td>;
                  })}
                  <td>{formatCellValue(row.totalLessons)}</td>
                  <td>{formatCurrency(row.totalValue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={periodDates.length + 4}>Total</th>
                <th>{formatCurrency(grandTotal)}</th>
              </tr>
            </tfoot>
          </table>
        </div>

        {timesheet.studentDetails.length > 0 ? (
          <div className="timesheet-detail-list">
            <div>
              <h2>Detalhe por utente</h2>
              <p className="muted">Pagamentos considerados neste ciclo, agrupados por utente e duracao.</p>
            </div>
            <div className="timesheet-detail-grid">
              {timesheet.studentDetails.map((item, index) => {
                const students = item.students.map((student) => `${student.memberNumber} - ${student.fullName}`).join(" / ");

                return (
                  <p key={`${students}-${item.trainingLabel}-${index}`}>
                    {students} {item.trainingLabel} ({item.days.join(", ")})
                  </p>
                );
              })}
            </div>
          </div>
        ) : null}

        {timesheet.unmatched.length > 0 ? (
          <div className="timesheet-unmatched">
            <h2>Pagamentos sem Caract.</h2>
            <p className="muted">Estes pagamentos existem, mas ainda não entram em nenhuma regra da folha de treinos.</p>
            {timesheet.unmatched.slice(0, 20).map((item, index) => (
              <p key={`${item.date}-${index}`}>
                {item.date} · {item.student} · {item.paymentType} · {formatCellValue(item.lessons)} aulas · {formatCurrency(item.value)}
              </p>
            ))}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
