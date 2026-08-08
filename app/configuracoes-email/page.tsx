import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import {
  dailyEmailLimit,
  emailProviderAvailability,
  getClassStudentEmailSettings,
  getEmailProviderSettings,
  getGroupClassScheduleEmailSettings,
  getPaymentEmailSettings,
  getSubstitutionEmailSettings,
  getTimesheetDocumentsEmailSettings,
  parseEmailList
} from "@/lib/email";
import { prisma } from "@/lib/prisma";

function monthBounds() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { end, start };
}

function countRecipients(log: { ccEmails: string | null; toEmail: string }) {
  const toCount = parseEmailList(log.toEmail).length || (log.toEmail ? 1 : 0);
  return toCount + parseEmailList(log.ccEmails).length;
}

function emailTypeLabel(type: string) {
  const labels: Record<string, string> = {
    class_student_change: "Trocas turma",
    class_student_enrollment: "Novas inscricoes",
    group_class_schedule: "Aulas grupo",
    password_reset: "Password",
    payment: "Pagamentos TP",
    personal_training_payment: "Pagamentos TP",
    group_class_substitution_request: "Pedidos subst.",
    group_class_substitution_response: "Respostas subst.",
    timesheet_documents: "Folhas"
  };

  return labels[type] || type;
}

const emailTypeOrder = [
  "password_reset",
  "group_class_schedule",
  "group_class_substitution_request",
  "group_class_substitution_response",
  "timesheet_documents",
  "personal_training_payment",
  "class_student_change",
  "class_student_enrollment"
];

export default async function EmailSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ success?: string; error?: string; tab?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);
  const activeTab = params.tab === "logs" ? "logs" : params.tab === "stats" ? "stats" : "settings";

  if (!hasRole(user, "admin")) {
    redirect("/dashboard");
  }

  const emailMonthBounds = monthBounds();
  const [
    paymentSettings,
    substitutionSettings,
    classStudentSettings,
    groupClassScheduleSettings,
    timesheetDocumentsSettings,
    providerSettings,
    currentDailyLimit,
    logs,
    monthlyLogs
  ] = await Promise.all([
    getPaymentEmailSettings(),
    getSubstitutionEmailSettings(),
    getClassStudentEmailSettings(),
    getGroupClassScheduleEmailSettings(),
    getTimesheetDocumentsEmailSettings(),
    getEmailProviderSettings(),
    dailyEmailLimit(),
    prisma.emailLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.emailLog.findMany({
      orderBy: { createdAt: "asc" },
      where: {
        createdAt: {
          gte: emailMonthBounds.start,
          lt: emailMonthBounds.end
        },
        status: "sent"
      },
      select: {
        ccEmails: true,
        createdAt: true,
        toEmail: true,
        type: true
      }
    })
  ]);
  const providerAvailability = emailProviderAvailability();
  const selectedProvider = providerSettings.ccEmails === "brevo" || providerSettings.ccEmails === "resend" ? providerSettings.ccEmails : "resend";
  const monthlyTypeSet = new Set(monthlyLogs.map((log) => log.type));
  const monthlyTypes = [
    ...emailTypeOrder.filter((type) => monthlyTypeSet.has(type)),
    ...Array.from(monthlyTypeSet).filter((type) => !emailTypeOrder.includes(type)).sort()
  ];
  const daysInMonth = new Date(emailMonthBounds.start.getFullYear(), emailMonthBounds.start.getMonth() + 1, 0).getDate();
  const dailyStats = Array.from({ length: daysInMonth }, (_, index) => ({
    day: index + 1,
    total: 0,
    types: new Map<string, number>()
  }));

  for (const log of monthlyLogs) {
    const stat = dailyStats[log.createdAt.getDate() - 1];
    const count = countRecipients(log);
    stat.total += count;
    stat.types.set(log.type, (stat.types.get(log.type) || 0) + count);
  }
  const maxDailyTotal = Math.max(1, ...dailyStats.map((stat) => stat.total));

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
          <a className={activeTab === "stats" ? "tab active" : "tab"} href="/configuracoes-email?tab=stats">
            Estatistica mensal
          </a>
        </div>

        {activeTab === "settings" ? (
          <form className="email-settings-form email-settings-card" action="/api/email-settings" method="post">
            <div className="email-settings-section">
              <h2>Fornecedor de envio</h2>
              <p className="muted">Quando Resend e Brevo estao configurados, a plataforma usa Resend por defeito. Podes alterar aqui.</p>
              <div className="email-provider-options">
                <label className="checkbox">
                  <input type="radio" name="emailProvider" value="resend" defaultChecked={selectedProvider === "resend"} disabled={!providerAvailability.resend} />
                  Resend {providerAvailability.resend ? "(configurado)" : "(por configurar)"}
                </label>
                <label className="checkbox">
                  <input type="radio" name="emailProvider" value="brevo" defaultChecked={selectedProvider === "brevo"} disabled={!providerAvailability.brevo} />
                  Brevo {providerAvailability.brevo ? "(configurado)" : "(por configurar)"}
                </label>
              </div>
              <p className="muted">Limite usado no contador: {currentDailyLimit} emails/dia.</p>
            </div>

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

            <div className="email-settings-section">
              <h2>Trocas e inscricoes</h2>
              <label className="checkbox">
                <input type="checkbox" name="classStudentEnabled" defaultChecked={classStudentSettings.enabled} />
                Enviar emails de trocas de turma e novas inscricoes
              </label>
              <div className="field">
                <label htmlFor="classStudentCcEmails">CC diretor/coordenadores</label>
                <textarea
                  id="classStudentCcEmails"
                  name="classStudentCcEmails"
                  defaultValue={classStudentSettings.ccEmails || ""}
                  placeholder="email1@exemplo.pt, email2@exemplo.pt"
                  rows={3}
                />
              </div>
            </div>

            <div className="email-settings-section">
              <h2>Mapa de aulas de grupo</h2>
              <label className="checkbox">
                <input type="checkbox" name="groupClassScheduleEnabled" defaultChecked={groupClassScheduleSettings.enabled} />
                Permitir envio do mapa semanal de aulas ao professor
              </label>
              <div className="field">
                <label htmlFor="groupClassScheduleCcEmails">CC diretor/coordenadores</label>
                <textarea
                  id="groupClassScheduleCcEmails"
                  name="groupClassScheduleCcEmails"
                  defaultValue={groupClassScheduleSettings.ccEmails || ""}
                  placeholder="email1@exemplo.pt, email2@exemplo.pt"
                  rows={3}
                />
              </div>
            </div>
            <div className="email-settings-section">
              <h2>Envio de folhas</h2>
              <label className="checkbox">
                <input type="checkbox" name="timesheetDocumentsEnabled" defaultChecked={timesheetDocumentsSettings.enabled} />
                Permitir envio da folha de horas e folha de treinos em PDF
              </label>
              <div className="field">
                <label htmlFor="timesheetDocumentsCcEmails">CC diretor/coordenadores</label>
                <textarea
                  id="timesheetDocumentsCcEmails"
                  name="timesheetDocumentsCcEmails"
                  defaultValue={timesheetDocumentsSettings.ccEmails || ""}
                  placeholder="email1@exemplo.pt, email2@exemplo.pt"
                  rows={3}
                />
              </div>
            </div>
            <p className="muted">No Render devem estar definidas as variáveis EMAIL_PROVIDER, BREVO_API_KEY e EMAIL_FROM.</p>
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

        {activeTab === "stats" ? (
          <div className="email-stats-card">
            <div className="email-stats-topbar">
              <div>
                <h2>Emails enviados este mes</h2>
                <p className="muted">Contagem diaria por tipo de email. Um email com CC conta por cada destinatario.</p>
              </div>
              <span className="status active">Limite diario: {currentDailyLimit}</span>
            </div>
            <div className="email-stats-legend">
              {monthlyTypes.length === 0 ? <span className="muted">Sem emails enviados este mes.</span> : null}
              {monthlyTypes.map((type, index) => (
                <span className="email-stats-legend-item" key={type}>
                  <span className={`email-stat-color email-stat-color-${index % 8}`} />
                  {emailTypeLabel(type)}
                </span>
              ))}
            </div>
            <div className="email-month-chart">
              {dailyStats.map((stat) => (
                <div className="email-day-bar" key={stat.day} title={`${stat.day}: ${stat.total} email(s)`}>
                  <div className="email-day-bar-track">
                    <div className="email-day-bar-stack" style={{ height: `${Math.max(3, (stat.total / maxDailyTotal) * 100)}%` }}>
                      {monthlyTypes.map((type, index) => {
                        const value = stat.types.get(type) || 0;
                        if (!value) return null;
                        return (
                          <span
                            className={`email-day-bar-part email-stat-bg-${index % 8}`}
                            key={type}
                            style={{ height: `${(value / Math.max(1, stat.total)) * 100}%` }}
                            title={`${emailTypeLabel(type)}: ${value}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <span>{stat.day}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
