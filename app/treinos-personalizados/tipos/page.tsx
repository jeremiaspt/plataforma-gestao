import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function PersonalTrainingTypesPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  if (!hasRole(user, "admin")) {
    redirect("/dashboard");
  }

  const paymentTypes = await prisma.personalTrainingPaymentType.findMany({
    orderBy: [{ active: "desc" }, { description: "asc" }]
  });

  return (
    <AppShell userName={user.name}>
      <section className="panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Treinos Personalizados</p>
            <h1>Tipos de pagamento</h1>
            <p className="muted">Define as descrições disponíveis, créditos e valor de cada pagamento.</p>
          </div>
          <form action="/api/personal-training/payment-types/defaults" method="post">
            <button className="button secondary" type="submit">
              Carregar lista inicial
            </button>
          </form>
        </div>

        {params.success ? <p className="success">Alterações guardadas.</p> : null}
        {params.error ? <p className="error">Não foi possível guardar. Confirma a descrição, créditos e valor.</p> : null}

        <form className="payment-type-form stacked" action="/api/personal-training/payment-types" method="post">
          <div className="field">
            <label htmlFor="description">Descrição</label>
            <input id="description" name="description" required />
          </div>
          <div className="field">
            <label htmlFor="credits">Créditos</label>
            <input id="credits" name="credits" type="number" min="1" step="1" required />
          </div>
          <div className="field">
            <label htmlFor="price">Valor (€)</label>
            <input id="price" name="price" type="number" min="0" step="0.01" defaultValue="0.00" placeholder="0.00" required />
          </div>
          <button className="button" type="submit">
            Criar tipo
          </button>
        </form>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Tipos configurados</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Créditos</th>
              <th>Valor</th>
              <th>Estado</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {paymentTypes.map((paymentType) => (
              <tr key={paymentType.id}>
                <td colSpan={5}>
                  <form className="payment-type-row" action={`/api/personal-training/payment-types/${paymentType.id}`} method="post">
                    <input name="description" defaultValue={paymentType.description} required />
                    <input name="credits" type="number" min="1" step="1" defaultValue={paymentType.credits} required />
                    <label className="inline-field">
                      <span>Valor (€)</span>
                      <input name="price" type="number" min="0" step="0.01" defaultValue={paymentType.price.toString()} required />
                    </label>
                    <span className={paymentType.active ? "status active" : "status inactive"}>
                      {paymentType.active ? "Ativo" : "Inativo"}
                    </span>
                    <div className="action-row">
                      <button className="button secondary" name="action" value="update" type="submit">
                        Guardar
                      </button>
                      <button className="button secondary" name="action" value="toggle-active" type="submit">
                        {paymentType.active ? "Desativar" : "Ativar"}
                      </button>
                      <button className="button danger" name="action" value="delete" type="submit">
                        Remover
                      </button>
                    </div>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
