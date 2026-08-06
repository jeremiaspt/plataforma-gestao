import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { currentBillingMonthValue, formatBillingPeriod, getBillingCycleLabel } from "@/lib/billingCycles";
import { calculateGroupClassTimesheet } from "@/lib/groupClassTimesheet";
import { getSystemSettings } from "@/lib/maintenance";
import { formatCurrency } from "@/lib/money";
import { calculatePersonalTrainingTimesheet, eachPeriodDate } from "@/lib/personalTrainingTimesheet";
import { dateToInputValue, formatMinutes, getPoolMapByKey } from "@/lib/pool";
import { prisma } from "@/lib/prisma";

type DocumentType = "both" | "group" | "personal";
type GroupTimesheet = NonNullable<Awaited<ReturnType<typeof calculateGroupClassTimesheet>>>;
type PersonalTimesheet = NonNullable<Awaited<ReturnType<typeof calculatePersonalTrainingTimesheet>>>;

function validDocumentType(value?: string): DocumentType {
  return value === "group" || value === "personal" || value === "both" ? value : "both";
}

function weekdayShortLabel(date: Date) {
  return ["D", "2a", "3a", "4a", "5a", "6a", "S"][date.getDay()];
}

function formatCellValue(value: number) {
  if (!value) return "";
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2).replace(".", ",");
}

function formatDateValue(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-PT");
}

function classLabel(block: { laneNumber: number; poolKey: string }) {
  const poolMap = getPoolMapByKey(block.poolKey);
  const lane = poolMap.lanes.find((item) => item.number === block.laneNumber);
  return `${poolMap.eyebrow} - ${lane?.label || `${poolMap.laneFieldLabel} ${block.laneNumber}`}`;
}

function detailBase(item: { accumulation?: boolean; date: string; endMinutes: number; laneNumber: number; poolKey: string; startMinutes: number; title: string }) {
  return `${formatDateValue(item.date)} - ${formatMinutes(item.startMinutes)}-${formatMinutes(item.endMinutes)} - ${item.title}${
    item.accumulation ? " (ACUM.)" : ""
  } - ${classLabel(item)}`;
}

function TimesheetHead({ periodDates }: { periodDates: Date[] }) {
  return (
    <>
      {periodDates.map((date) => {
        const dateValue = dateToInputValue(date);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;

        return (
          <th className={isWeekend ? "timesheet-weekend-cell" : undefined} key={dateValue}>
            <span>{date.getDate()}</span>
            <small>{weekdayShortLabel(date)}</small>
          </th>
        );
      })}
    </>
  );
}

function GroupHoursPreview({ timesheet }: { timesheet: GroupTimesheet }) {
  const periodDates = eachPeriodDate(timesheet.period.start, timesheet.period.endExclusive);
  const total = timesheet.rows.reduce((sum, row) => sum + row.totalValue, 0);

  return (
    <section className="timesheet-preview-section">
      <div className="topbar compact-topbar">
        <div>
          <h2>Folha de horas</h2>
          <p className="muted">{formatBillingPeriod(timesheet.period.start, timesheet.period.endExclusive)}</p>
        </div>
        <span className="status active">{formatCurrency(total)}</span>
      </div>
      <div className="timesheet-table-wrap">
        <table className="timesheet-table group-hours-timesheet-table">
          <thead>
            <tr>
              <th>Caract.</th>
              <th>Valor/hora</th>
              <TimesheetHead periodDates={periodDates} />
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
                  const value = row.calculationMode === "minutes" ? formatCellValue(hours) : formatCellValue(count);
                  return <td key={dateValue}>{value}</td>;
                })}
                <td>{row.totalHours.toFixed(2).replace(".", ",")}</td>
                <td>{formatCurrency(row.totalValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {timesheet.absenceDetails.length || timesheet.extraDetails.length || timesheet.otherDetails.length ? (
        <div className="timesheet-send-preview-details">
          {timesheet.absenceDetails.length ? <p><strong>Faltas:</strong> {timesheet.absenceDetails.length} registo(s)</p> : null}
          {timesheet.extraDetails.length ? <p><strong>Extras/substituições:</strong> {timesheet.extraDetails.length} registo(s)</p> : null}
          {timesheet.otherDetails.length ? <p><strong>Outros:</strong> {timesheet.otherDetails.length} registo(s)</p> : null}
          {timesheet.absenceDetails.length ? (
            <div>
              <strong>Detalhe faltas</strong>
              {timesheet.absenceDetails.map((item, index) => (
                <p key={`${item.date}-${item.startMinutes}-${item.title}-${index}`}>
                  {detailBase(item)} - Substituto: {item.substituteTeacherName}
                </p>
              ))}
            </div>
          ) : null}
          {timesheet.extraDetails.length ? (
            <div>
              <strong>Detalhe extras/substituicoes</strong>
              {timesheet.extraDetails.map((item, index) => (
                <p key={`${item.date}-${item.startMinutes}-${item.title}-${index}`}>
                  {detailBase(item)} - Por: {item.absentTeacherName}
                </p>
              ))}
            </div>
          ) : null}
          {timesheet.otherDetails.length ? (
            <div>
              <strong>Detalhe outros</strong>
              {timesheet.otherDetails.map((item, index) => (
                <p key={`${item.date}-${item.startMinutes}-${item.title}-${index}`}>
                  {formatDateValue(item.date)} - {formatMinutes(item.startMinutes)}-{formatMinutes(item.endMinutes)} - {item.title} - {item.responsibleName}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function PersonalTrainingPreview({ timesheet }: { timesheet: PersonalTimesheet }) {
  const periodDates = eachPeriodDate(timesheet.period.start, timesheet.period.endExclusive);
  const total = timesheet.rows.reduce((sum, row) => sum + row.totalValue, 0);

  return (
    <section className="timesheet-preview-section">
      <div className="topbar compact-topbar">
        <div>
          <h2>Folha de treinos</h2>
          <p className="muted">
            {formatBillingPeriod(timesheet.period.start, timesheet.period.endExclusive)} - {getBillingCycleLabel(timesheet.teacher.billingCycle)}
          </p>
        </div>
        <span className="status active">{formatCurrency(total)}</span>
      </div>
      <div className="timesheet-table-wrap">
        <table className="timesheet-table personal-training-timesheet-table">
          <thead>
            <tr>
              <th>Caract.</th>
              <th>N.º alunos</th>
              <th>Valor por aluno</th>
              <TimesheetHead periodDates={periodDates} />
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
                  return <td key={dateValue}>{formatCellValue(row.dayLessons.get(dateValue) || 0)}</td>;
                })}
                <td>{formatCellValue(row.totalLessons)}</td>
                <td>{formatCurrency(row.totalValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {timesheet.studentDetails.length ? (
        <div className="timesheet-send-preview-details">
          <strong>Detalhe por utente</strong>
          {timesheet.studentDetails.map((item, index) => {
            const students = item.students.map((student) => `${student.memberNumber} - ${student.fullName}`).join(" / ");
            return <p key={`${students}-${index}`}>{students} {item.trainingLabel} ({item.days.join(", ")})</p>;
          })}
        </div>
      ) : null}
    </section>
  );
}

export default async function TimesheetDocumentsEmailPage({
  searchParams
}: {
  searchParams: Promise<{ documentType?: string; error?: string; month?: string; success?: string; teacherId?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);

  if (!hasRole(user, "admin")) {
    redirect("/dashboard");
  }

  const teachers = await prisma.user.findMany({
    where: { active: true, roles: { some: { role: { key: "professor" } } } },
    orderBy: { name: "asc" },
    select: { email: true, id: true, name: true }
  });
  const selectedTeacherId = params.teacherId || teachers[0]?.id || "";
  const selectedMonth = params.month || currentBillingMonthValue();
  const selectedDocumentType = validDocumentType(params.documentType);
  const selectedTeacher = teachers.find((teacher) => teacher.id === selectedTeacherId);
  const systemSettings = await getSystemSettings();
  const showGroup = selectedDocumentType === "both" || selectedDocumentType === "group";
  const showPersonal = selectedDocumentType === "both" || selectedDocumentType === "personal";
  const [groupTimesheet, personalTimesheet] = await Promise.all([
    showGroup && selectedTeacherId
      ? calculateGroupClassTimesheet({
          excludeDockSupportOverlapWithClasses: systemSettings.excludeDockSupportOverlapWithClasses,
          holidayOptions: {
            includeChristmasEveHoliday: systemSettings.includeChristmasEveHoliday,
            includeLisbonMunicipalHolidays: systemSettings.includeLisbonMunicipalHolidays,
            includeNewYearsEveHoliday: systemSettings.includeNewYearsEveHoliday
          },
          month: selectedMonth,
          teacherId: selectedTeacherId
        })
      : null,
    showPersonal && selectedTeacherId ? calculatePersonalTrainingTimesheet({ month: selectedMonth, teacherId: selectedTeacherId }) : null
  ]);

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel timesheet-send-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Administração</p>
            <h1>Envio folha de horas</h1>
            <p className="muted">Pré-visualiza e envia por email a folha de horas, a folha de treinos ou ambas em PDF anexado.</p>
          </div>
          <span className="status active">PDF</span>
        </div>

        {params.success ? <p className="success">Email enviado ao professor com os PDFs em anexo.</p> : null}
        {params.error ? <p className="error">Não foi possível enviar o email. O erro ficou registado nos logs de email quando possível.</p> : null}

        <form className="timesheet-send-form" action="/envio-folhas" method="get">
          <div className="field">
            <label htmlFor="teacherId">Professor</label>
            <select id="teacherId" name="teacherId" defaultValue={selectedTeacherId} required>
              {teachers.map((teacher) => (
                <option value={teacher.id} key={teacher.id}>
                  {teacher.name} - {teacher.email}
                </option>
              ))}
            </select>
          </div>
          <div className="field compact-number-field">
            <label htmlFor="month">Mês</label>
            <input id="month" name="month" type="month" defaultValue={selectedMonth} required />
          </div>
          <div className="field">
            <label htmlFor="documentType">Documentos</label>
            <select id="documentType" name="documentType" defaultValue={selectedDocumentType}>
              <option value="both">Folha de horas e folha de treinos</option>
              <option value="group">Só folha de horas</option>
              <option value="personal">Só folha de treinos</option>
            </select>
          </div>
          <button className="button secondary" type="submit" disabled={teachers.length === 0}>
            Ver folhas
          </button>
          <button className="button" type="submit" formAction="/api/timesheet-documents-email" formMethod="post" disabled={teachers.length === 0}>
            Enviar email
          </button>
        </form>

        <div className="timesheet-send-note">
          <strong>{selectedTeacher?.name || "Professor"}</strong>
          <span>{selectedTeacher?.email || "Sem professor selecionado"}</span>
          <p className="muted">
            A folha de horas usa o mês civil selecionado. A folha de treinos usa o ciclo de faturação definido no professor para esse mês.
          </p>
        </div>

        <div className="timesheet-send-preview">
          {groupTimesheet ? <GroupHoursPreview timesheet={groupTimesheet} /> : null}
          {personalTimesheet ? <PersonalTrainingPreview timesheet={personalTimesheet} /> : null}
        </div>
      </section>
    </AppShell>
  );
}
