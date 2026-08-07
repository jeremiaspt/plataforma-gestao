import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { dateToInputValue, poolWeekdays } from "@/lib/pool";

function currentWeekStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekday = today.getDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  today.setDate(today.getDate() + offset);
  return dateToInputValue(today);
}

export default async function PrintMapPage() {
  const user = await requireUser();
  const roles = user.roles.map((userRole) => userRole.role.key);

  if (!hasRole(user, "admin")) {
    return (
      <AppShell userName={user.name} roles={roles}>
        <section className="card">
          <h1>Sem permissao</h1>
          <p className="muted">Esta area esta disponivel apenas para administradores.</p>
        </section>
      </AppShell>
    );
  }

  const defaultWeekStart = currentWeekStart();

  return (
    <AppShell userName={user.name} roles={roles}>
      <section className="page-hero">
        <div>
          <p className="eyebrow">Mapas de disponibilidade</p>
          <h1>Impressao de mapa</h1>
          <p className="muted">Gera PDFs com a disponibilidade conjunta da Piscina 25m, Apoio ao Cais e Tanque de aprendizagem.</p>
        </div>
        <span className="status active">Admin</span>
      </section>

      <section className="print-map-panel">
        <form action="/api/pool-schedule/print" className="print-map-card" method="get">
          <input name="mode" type="hidden" value="week" />
          <div>
            <h2>Mapa semanal</h2>
            <p className="muted">Cria um unico PDF com todos os dias da semana.</p>
          </div>
          <label className="field">
            <span>Semana de referencia</span>
            <input name="weekStart" type="date" defaultValue={defaultWeekStart} />
          </label>
          <button className="button" type="submit">
            Download PDF semanal
          </button>
        </form>

        <form action="/api/pool-schedule/print" className="print-map-card" method="get">
          <input name="mode" type="hidden" value="day" />
          <div>
            <h2>Dia de semana</h2>
            <p className="muted">Cria um PDF apenas com o dia selecionado.</p>
          </div>
          <label className="field">
            <span>Semana de referencia</span>
            <input name="weekStart" type="date" defaultValue={defaultWeekStart} />
          </label>
          <label className="field">
            <span>Dia</span>
            <select name="weekday" defaultValue="1">
              {poolWeekdays.map((weekday) => (
                <option key={weekday.key} value={weekday.key}>
                  {weekday.label}
                </option>
              ))}
            </select>
          </label>
          <button className="button" type="submit">
            Download PDF do dia
          </button>
        </form>

        <div className="print-map-note">
          <strong>Formato do PDF</strong>
          <p>
            Segunda a sexta geram duas folhas A4 portrait por dia: 07:00-14:00 e 14:00-21:00. Sabado e domingo geram uma folha
            unica: 08:45-14:00. Ocupacoes por periodo fora da semana escolhida aparecem em formato fantasma.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
