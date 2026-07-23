import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { getGroupClassOptions } from "@/lib/groupClassOptions";

export default async function ClassChangePage({
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
            <h1>Troca de turma</h1>
            <p className="muted">Regista a troca de turma e notifica os professores envolvidos por email.</p>
          </div>
        </div>

        {params.success ? <p className="success">Troca de turma registada e email processado.</p> : null}
        {params.error ? <p className="error">{params.message || "Nao foi possivel registar a troca de turma."}</p> : null}
        {params.maintenance ? <p className="error">A plataforma esta em manutencao. Apenas administradores podem registar alteracoes.</p> : null}

        <form className="class-student-form" action="/api/class-student-changes" method="post">
          <div className="field">
            <label htmlFor="originClassKey">Turma de origem</label>
            <select id="originClassKey" name="originClassKey" required>
              <option value="">Selecionar turma de origem</option>
              {classOptions.map((option) => (
                <option key={option.classKey} value={option.classKey}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="destinationClassKey">Turma de destino</label>
            <select id="destinationClassKey" name="destinationClassKey" required>
              <option value="">Selecionar turma de destino</option>
              {classOptions.map((option) => (
                <option key={option.classKey} value={option.classKey}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

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

          <button className="button" type="submit" disabled={classOptions.length === 0}>
            Registar troca
          </button>
        </form>

        {classOptions.length === 0 ? <p className="muted">Ainda nao existem aulas de grupo com professor associado.</p> : null}
      </section>
    </AppShell>
  );
}
