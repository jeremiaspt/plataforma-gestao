import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { decimalToNumber, formatCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function GroupClassHourlyRatesPage({
  searchParams
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);

  if (!hasRole(user, "admin")) {
    redirect("/dashboard");
  }

  const rates = await prisma.groupClassHourlyRate.findMany({
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
  });

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel hourly-rates-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Aulas de grupo</p>
            <h1>Valor hora aulas</h1>
            <p className="muted">Define as características que aparecem na folha de horas e as regras que identificam cada aula.</p>
          </div>
          <span className="status active">{rates.length} regras</span>
        </div>

        {params.success ? <p className="success">Configuração guardada.</p> : null}
        {params.error ? <p className="error">Não foi possível guardar a configuração.</p> : null}

        <form className="hourly-rate-form" action="/api/group-class-hourly-rates" method="post">
          <div className="field">
            <label htmlFor="name">Característica</label>
            <input id="name" name="name" placeholder="Ex.: Níveis AMA2a4" required />
          </div>
          <div className="field compact-number-field">
            <label htmlFor="hourlyRate">Valor/hora</label>
            <input id="hourlyRate" name="hourlyRate" type="number" step="0.01" min="0" required />
          </div>
          <div className="field compact-number-field">
            <label htmlFor="displayOrder">Ordem</label>
            <input id="displayOrder" name="displayOrder" type="number" step="1" defaultValue={rates.length + 1} required />
          </div>
          <div className="field">
            <label htmlFor="matchSource">Origem</label>
            <select id="matchSource" name="matchSource" defaultValue="title">
              <option value="title">Nome da aula</option>
              <option value="apoio_cais">Mapa Apoio ao Cais</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="calculationMode">Contabilização</label>
            <select id="calculationMode" name="calculationMode" defaultValue="class_duration">
              <option value="class_duration">Por aula/duração</option>
              <option value="minutes">Por minutos</option>
            </select>
          </div>
          <div className="field compact-number-field">
            <label htmlFor="durationFilter">Duração</label>
            <select id="durationFilter" name="durationFilter" defaultValue="">
              <option value="">Todas</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
            </select>
          </div>
          <div className="field patterns-field">
            <label htmlFor="matchPatterns">Aulas tipo</label>
            <textarea id="matchPatterns" name="matchPatterns" rows={2} placeholder="Ex.: N1/N2/N3/N4/AMA2/AMA3/AMA4" />
          </div>
          <button className="button" type="submit">
            Criar regra
          </button>
        </form>

        <div className="hourly-rate-list">
          {rates.length === 0 ? <p className="muted">Ainda não existem regras de valor hora.</p> : null}
          {rates.map((rate) => (
            <form className="hourly-rate-row" action={`/api/group-class-hourly-rates/${rate.id}`} method="post" key={rate.id}>
              <div className="field">
                <label>Característica</label>
                <input name="name" defaultValue={rate.name} required />
              </div>
              <div className="field compact-number-field">
                <label>Valor/hora</label>
                <input name="hourlyRate" type="number" step="0.01" min="0" defaultValue={decimalToNumber(rate.hourlyRate)} required />
                <small>{formatCurrency(rate.hourlyRate)}</small>
              </div>
              <div className="field compact-number-field">
                <label>Ordem</label>
                <input name="displayOrder" type="number" step="1" defaultValue={rate.displayOrder} required />
              </div>
              <div className="field">
                <label>Origem</label>
                <select name="matchSource" defaultValue={rate.matchSource}>
                  <option value="title">Nome da aula</option>
                  <option value="apoio_cais">Mapa Apoio ao Cais</option>
                </select>
              </div>
              <div className="field">
                <label>Contabilização</label>
                <select name="calculationMode" defaultValue={rate.calculationMode}>
                  <option value="class_duration">Por aula/duração</option>
                  <option value="minutes">Por minutos</option>
                </select>
              </div>
              <div className="field compact-number-field">
                <label>Duração</label>
                <select name="durationFilter" defaultValue={rate.durationFilter || ""}>
                  <option value="">Todas</option>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">60 min</option>
                </select>
              </div>
              <div className="field patterns-field">
                <label>Aulas tipo</label>
                <textarea name="matchPatterns" rows={2} defaultValue={rate.matchPatterns || ""} />
              </div>
              <label className="checkbox compact-checkbox">
                <input type="checkbox" name="active" defaultChecked={rate.active} />
                Ativa
              </label>
              <div className="action-row compact-actions">
                <button className="button secondary" name="action" value="save" type="submit">
                  Guardar
                </button>
                <button className="button danger" name="action" value="delete" type="submit">
                  Remover
                </button>
              </div>
            </form>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
