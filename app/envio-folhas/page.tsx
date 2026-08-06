import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { currentBillingMonthValue } from "@/lib/billingCycles";
import { prisma } from "@/lib/prisma";

export default async function TimesheetDocumentsEmailPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; month?: string; success?: string; teacherId?: string }>;
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
  const selectedTeacher = teachers.find((teacher) => teacher.id === selectedTeacherId);

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel timesheet-send-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Administração</p>
            <h1>Envio folha de horas</h1>
            <p className="muted">Envia por email a folha de horas, a folha de treinos ou ambas em PDF anexado.</p>
          </div>
          <span className="status active">PDF</span>
        </div>

        {params.success ? <p className="success">Email enviado ao professor com os PDFs em anexo.</p> : null}
        {params.error ? <p className="error">Não foi possível enviar o email. Confirma o email do professor, as configurações de email e o Resend.</p> : null}

        <form className="timesheet-send-form" action="/api/timesheet-documents-email" method="post">
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
            <select id="documentType" name="documentType" defaultValue="both">
              <option value="both">Folha de horas e folha de treinos</option>
              <option value="group">Só folha de horas</option>
              <option value="personal">Só folha de treinos</option>
            </select>
          </div>
          <button className="button" type="submit" disabled={teachers.length === 0}>
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
      </section>
    </AppShell>
  );
}
