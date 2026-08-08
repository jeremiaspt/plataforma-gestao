import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { dateToInputValue, poolWeekdays } from "@/lib/pool";
import { printMapPalette, printMapPaletteItem } from "@/lib/printMapColors";
import { prisma } from "@/lib/prisma";

function currentWeekStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekday = today.getDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  today.setDate(today.getDate() + offset);
  return dateToInputValue(today);
}

export default async function PrintMapPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; success?: string; tab?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roles = user.roles.map((userRole) => userRole.role.key);
  const activeTab = params.tab === "colors" ? "colors" : "print";

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
  const colorRules = await prisma.printMapColorRule.findMany({
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
  });

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

      {params.success ? <p className="success">Configuracao guardada.</p> : null}
      {params.error ? <p className="error">Nao foi possivel guardar a configuracao.</p> : null}

      <div className="tabs">
        <a className={activeTab === "print" ? "tab active" : "tab"} href="/impressao-mapa?tab=print">
          Impressao
        </a>
        <a className={activeTab === "colors" ? "tab active" : "tab"} href="/impressao-mapa?tab=colors">
          Cores dos blocos
        </a>
      </div>

      {activeTab === "print" ? (
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
      ) : null}

      {activeTab === "colors" ? (
        <section className="print-map-panel">
          <form action="/api/print-map-color-rules" className="print-color-card" method="post">
            <input name="action" type="hidden" value="create" />
            <div>
              <h2>Nova regra de cor</h2>
              <p className="muted">Define que aulas recebem uma cor quando o nome comeca por determinados textos.</p>
            </div>
            <label className="field">
              <span>Tipo de aula</span>
              <input name="name" placeholder="Ex.: Niveis 1 a 4" required />
            </label>
            <label className="field">
              <span>Comeca por</span>
              <input name="matchPatterns" placeholder="Ex.: N1/N2/N3/N4" required />
            </label>
            <label className="field">
              <span>Ordem</span>
              <input name="displayOrder" type="number" defaultValue={colorRules.length + 1} />
            </label>
            <div className="field">
              <span>Cor</span>
              <div className="print-color-palette">
                {printMapPalette.map((color, index) => (
                  <label className="print-color-choice" key={color.key} title={color.label}>
                    <input name="colorKey" type="radio" value={color.key} defaultChecked={index === 0} />
                    <span style={{ background: color.fill, borderColor: color.stroke, color: color.text }}>{color.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <button className="button" type="submit">
              Adicionar regra
            </button>
          </form>

          <form action="/api/print-map-color-rules" className="print-color-rules" method="post">
            <input name="action" type="hidden" value="update" />
            <div className="print-color-rules-header">
              <span>Ativa</span>
              <span>Tipo</span>
              <span>Comeca por</span>
              <span>Cor</span>
              <span>Ordem</span>
              <span>Acoes</span>
            </div>
            {colorRules.length === 0 ? <p className="muted">Ainda nao existem regras de cor.</p> : null}
            {colorRules.map((rule) => {
              const color = printMapPaletteItem(rule.colorKey);

              return (
                <div className="print-color-rule-row" key={rule.id}>
                  <input name="ruleId" type="hidden" value={rule.id} />
                  <label className="checkbox compact-checkbox">
                    <input name={`active_${rule.id}`} type="checkbox" defaultChecked={rule.active} />
                  </label>
                  <input name={`name_${rule.id}`} defaultValue={rule.name} />
                  <input name={`matchPatterns_${rule.id}`} defaultValue={rule.matchPatterns} />
                  <select name={`colorKey_${rule.id}`} defaultValue={rule.colorKey}>
                    {printMapPalette.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <input name={`displayOrder_${rule.id}`} type="number" defaultValue={rule.displayOrder} />
                  <div className="print-color-actions">
                    <span className="print-color-swatch" style={{ background: color.fill, borderColor: color.stroke }} />
                    <button className="button small-button" type="submit">
                      Guardar
                    </button>
                    <button className="button danger small-button" type="submit" formAction={`/api/print-map-color-rules/${rule.id}`}>
                      Remover
                    </button>
                  </div>
                </div>
              );
            })}
          </form>
        </section>
      ) : null}
    </AppShell>
  );
}
