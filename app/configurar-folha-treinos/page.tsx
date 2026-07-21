import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { formatCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function PersonalTrainingTimesheetRulesPage({
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

  const [rules, paymentTypes] = await Promise.all([
    prisma.personalTrainingTimesheetRule.findMany({
      include: { items: { select: { paymentTypeId: true } } },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    }),
    prisma.personalTrainingPaymentType.findMany({
      orderBy: [{ active: "desc" }, { description: "asc" }]
    })
  ]);

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel training-timesheet-rules-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Treinos personalizados</p>
            <h1>Configuração folha treinos</h1>
            <p className="muted">Define as Caract., a ordem e quais os tipos de treinos personalizados que entram em cada linha.</p>
          </div>
          <span className="status active">{rules.length} regras</span>
        </div>

        {params.success ? <p className="success">Configuração guardada.</p> : null}
        {params.error ? <p className="error">Não foi possível guardar. Confirma o nome, ordem e pelo menos um tipo de treino.</p> : null}

        <form className="training-timesheet-rule-form" action="/api/personal-training/timesheet-rules" method="post">
          <div className="field">
            <label htmlFor="name">Caract.</label>
            <input id="name" name="name" placeholder="Ex.: TP Individual 30M" required />
          </div>
          <div className="field compact-number-field">
            <label htmlFor="displayOrder">Ordem</label>
            <input id="displayOrder" name="displayOrder" type="number" step="1" defaultValue={rules.length + 1} required />
          </div>
          <div className="training-type-picker">
            <strong>Tipos de treino</strong>
            <div className="training-type-checkboxes">
              {paymentTypes.map((paymentType) => (
                <label className="checkbox compact-checkbox" key={paymentType.id}>
                  <input type="checkbox" name="paymentTypeId" value={paymentType.id} />
                  <span>
                    {paymentType.description}
                    <small>
                      {paymentType.credits} créditos · {formatCurrency(paymentType.teacherPrice)} professor
                      {!paymentType.active ? " · inativo" : ""}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <button className="button" type="submit">
            Criar Caract.
          </button>
        </form>

        <div className="training-timesheet-rule-list">
          {rules.length === 0 ? <p className="muted">Ainda não existem regras para a folha de treinos.</p> : null}
          {rules.map((rule) => {
            const selectedIds = new Set(rule.items.map((item) => item.paymentTypeId));

            return (
              <form className="training-timesheet-rule-row" action={`/api/personal-training/timesheet-rules/${rule.id}`} method="post" key={rule.id}>
                <div className="field">
                  <label>Caract.</label>
                  <input name="name" defaultValue={rule.name} required />
                </div>
                <div className="field compact-number-field">
                  <label>Ordem</label>
                  <input name="displayOrder" type="number" step="1" defaultValue={rule.displayOrder} required />
                </div>
                <label className="checkbox compact-checkbox">
                  <input type="checkbox" name="active" defaultChecked={rule.active} />
                  Ativa
                </label>
                <div className="training-type-picker">
                  <strong>Tipos associados</strong>
                  <div className="training-type-checkboxes">
                    {paymentTypes.map((paymentType) => (
                      <label className="checkbox compact-checkbox" key={paymentType.id}>
                        <input type="checkbox" name="paymentTypeId" value={paymentType.id} defaultChecked={selectedIds.has(paymentType.id)} />
                        <span>
                          {paymentType.description}
                          <small>
                            {paymentType.credits} créditos · {formatCurrency(paymentType.teacherPrice)} professor
                            {!paymentType.active ? " · inativo" : ""}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="action-row compact-actions">
                  <button className="button secondary" name="action" value="save" type="submit">
                    Guardar
                  </button>
                  <button className="button danger" name="action" value="delete" type="submit">
                    Remover
                  </button>
                </div>
              </form>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
