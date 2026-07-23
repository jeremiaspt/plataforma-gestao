import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { getGroupClassOptions } from "@/lib/groupClassOptions";

export default async function ClassEnrollmentPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; maintenance?: string; message?: string; success?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);
  const canCreate = hasRole(user, "admin") || hasRole(user, "recepcao");

  if (!canCreate) {
    redirect("/dashboard");
  }

  const classOptions = await getGroupClassOptions();

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel class-student-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Recepcao</p>
            <h1>Nova inscricao</h1>
            <p className="muted">Regista uma nova inscricao numa turma e notifica o professor por email.</p>
          </div>
        </div>

        {params.success ? <p className="success">Nova inscricao registada e email processado.</p> : null}
        {params.error ? <p className="error">{params.message || "Nao foi possivel registar a nova inscricao."}</p> : null}
        {params.maintenance ? <p className="error">A plataforma esta em manutencao. Apenas administradores podem registar alteracoes.</p> : null}

        <form className="class-student-form" action="/api/class-student-enrollments" method="post">
          <div className="class-student-inline-fields">
            <div className="field">
              <label htmlFor="memberNumber">Numero de utente</label>
              <input id="memberNumber" name="memberNumber" required />
            </div>
            <div className="field">
              <label htmlFor="studentName">Nome do utente</label>
              <input id="studentName" name="studentName" required />
            </div>
          </div>

          <div className="field">
            <label htmlFor="classKey">Turma</label>
            <select id="classKey" name="classKey" required>
              <option value="">Selecionar turma</option>
              {classOptions.map((option) => (
                <option key={option.classKey} value={option.classKey}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button className="button" type="submit" disabled={classOptions.length === 0}>
            Registar inscricao
          </button>
        </form>

        {classOptions.length === 0 ? <p className="muted">Ainda nao existem aulas de grupo com professor associado.</p> : null}
      </section>
    </AppShell>
  );
}
