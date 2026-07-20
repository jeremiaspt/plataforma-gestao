import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { getPaymentEmailSettings, getSubstitutionEmailSettings } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export default async function EmailSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ success?: string; error?: string; tab?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);
  const activeTab = params.tab === "logs" ? "logs" : "settings";

  if (!hasRole(user, "admin")) {
    redirect("/dashboard");
  }

  const [paymentSettings, substitutionSettings, logs] = await Promise.all([
    getPaymentEmailSettings(),
    getSubstitutionEmailSettings(),
    prisma.emailLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel email-settings-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Configuração</p>
            <h1>Emails</h1>
            <p className="muted">Define os envios automáticos e consulta os logs de emails enviados pela plataforma.</p>
          </div>
        </div>

        {params.success ? <p className="success">Configuração guardada.</p> : null}
        {params.error ? <p className="error">Não foi possível guardar a configuração.</p> : null}

        <div className="tabs">
          <a className={activeTab === "settings" ? "tab active" : "tab"} href="/configuracoes-email?tab=settings">
            Configurações
          </a>
          <a className={activeTab === "logs" ? "tab active" : "tab"} href="/configuracoes-email?tab=logs">
            Logs
          </a>
        </div>

        {activeTab === "settings" ? (
          <form className="email-settings-form email-settings-card" action="/api/email-settings" method="post">
            <div className="email-settings-section">
              <h2>Pagamentos TP</h2>
              <label className="checkbox">
                <input type="checkbox" name="paymentEnabled" defaultChecked={paymentSettings.enabled} />
                Enviar emails ao professor quando é lançado um pagamento TP
              </label>
              <div className="field">
                <label htmlFor="paymentCcEmails">CC diretor/coordenadores</label>
                <textarea
                  id="paymentCcEmails"
                  name="paymentCcEmails"
                  defaultValue={paymentSettings.ccEmails || ""}
                  placeholder="email1@exemplo.pt, email2@exemplo.pt"
                  rows={3}
                />
              </div>
            </div>

            <div className="email-settings-section">
              <h2>Substituições</h2>
              <label className="checkbox">
                <input type="checkbox" name="substitutionEnabled" defaultChecked={substitutionSettings.enabled} />
                Enviar emails de pedidos e respostas de substituições
              </label>
              <div className="field">
                <label htmlFor="substitutionCcEmails">CC diretor/coordenadores</label>
                <textarea
                  id="substitutionCcEmails"
                  name="substitutionCcEmails"
                  defaultValue={substitutionSettings.ccEmails || ""}
                  placeholder="email1@exemplo.pt, email2@exemplo.pt"
                  rows={3}
                />
              </div>
            </div>

            <p className="muted">No Render devem estar definidas as variáveis RESEND_API_KEY e EMAIL_FROM.</p>
            <button className="button" type="submit">
              Guardar configuração
            </button>
          </form>
        ) : null}

        {activeTab === "logs" ? (
          <div className="email-log-table">
            <div className="email-log-header">
              <span>Data</span>
              <span>Estado</span>
              <span>Para</span>
              <span>CC</span>
              <span>Assunto</span>
              <span>Erro</span>
            </div>
            {logs.length === 0 ? <p className="muted">Ainda não existem logs de email.</p> : null}
            {logs.map((log) => (
              <div className="email-log-row" key={log.id}>
                <span>{log.createdAt.toLocaleString("pt-PT")}</span>
                <span className={log.status === "sent" ? "status active" : log.status === "failed" ? "status inactive" : "status"}>
                  {log.status}
                </span>
                <span>{log.toEmail}</span>
                <span>{log.ccEmails || "-"}</span>
                <span>{log.subject}</span>
                <span>{log.error || "-"}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
