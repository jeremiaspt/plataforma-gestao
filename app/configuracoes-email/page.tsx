import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { getPaymentEmailSettings } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export default async function EmailSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ success?: string; error?: string; tab?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const activeTab = params.tab === "logs" ? "logs" : "settings";

  if (!hasRole(user, "admin")) {
    redirect("/dashboard");
  }

  const [settings, logs] = await Promise.all([
    getPaymentEmailSettings(),
    prisma.emailLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 80
    })
  ]);

  return (
    <AppShell userName={user.name}>
      <section className="panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Configuracao</p>
            <h1>Emails de pagamentos TP</h1>
            <p className="muted">Os pagamentos lancados pela rececao ou admin enviam email ao professor com os CC definidos aqui.</p>
          </div>
        </div>

        {params.success ? <p className="success">Configuracao guardada.</p> : null}
        {params.error ? <p className="error">Nao foi possivel guardar a configuracao.</p> : null}

        <div className="tabs">
          <a className={activeTab === "settings" ? "tab active" : "tab"} href="/configuracoes-email?tab=settings">
            Configuracoes
          </a>
          <a className={activeTab === "logs" ? "tab active" : "tab"} href="/configuracoes-email?tab=logs">
            Logs
          </a>
        </div>

        {activeTab === "settings" ? (
          <form className="email-settings-form" action="/api/email-settings" method="post">
            <label className="checkbox">
              <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
              Enviar emails ao professor quando e lancado um pagamento TP
            </label>
            <div className="field">
              <label htmlFor="ccEmails">CC diretor/coordenadores</label>
              <textarea
                id="ccEmails"
                name="ccEmails"
                defaultValue={settings.ccEmails || ""}
                placeholder="email1@exemplo.pt, email2@exemplo.pt"
                rows={4}
              />
            </div>
            <p className="muted">No Render devem estar definidas as variaveis RESEND_API_KEY e EMAIL_FROM.</p>
            <button className="button" type="submit">
              Guardar configuracao
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
            {logs.length === 0 ? <p className="muted">Ainda nao existem logs de email.</p> : null}
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
