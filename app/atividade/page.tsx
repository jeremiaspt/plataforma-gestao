import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoginActivitySearch } from "@/components/LoginActivitySearch";
import { PersonalTrainingImportForm } from "@/components/PersonalTrainingImportForm";
import { hasRole, requireUser } from "@/lib/auth";
import { formatCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";

type ActivityTab = "overview" | "payments" | "bookings" | "credits" | "classes" | "emails" | "logins" | "maintenance";

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function today() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) {
    return fallback;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function decodeImportErrors(value?: string) {
  if (!value) {
    return [];
  }

  try {
    const source = value.trim().startsWith("[") ? value : Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(source);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return value ? [value] : [];
  }
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    created: "Pagamento lançado",
    criacao: "Marcação criada",
    cancelamento: "Marcação anulada",
    alteracao_cancelou_anterior: "Alteração: marcação anterior anulada",
    alteracao_criou_nova: "Alteração: nova marcação criada",
    cancelled: "Pagamento anulado"
  };

  return labels[action] || action;
}

export default async function ActivityPage({
  searchParams
}: {
  searchParams: Promise<{
    tab?: string;
    from?: string;
    to?: string;
    resetSuccess?: string;
    resetError?: string;
    restoreSuccess?: string;
    restoreError?: string;
    paymentDeleteSuccess?: string;
    paymentDeleteError?: string;
    importSuccess?: string;
    importError?: string;
    importErrors?: string;
    resetUnauthorized?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);
  const superadminEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
  const isSuperadmin = Boolean(superadminEmail && user.email.toLowerCase() === superadminEmail);

  if (!hasRole(user, "admin")) {
    redirect("/dashboard");
  }

  const activeTab: ActivityTab =
    params.tab === "payments" ||
    params.tab === "bookings" ||
    params.tab === "credits" ||
    params.tab === "classes" ||
    params.tab === "emails" ||
    params.tab === "logins" ||
    params.tab === "maintenance"
      ? params.tab
      : "overview";
  const fromDate = parseDate(params.from, startOfCurrentMonth());
  const toDate = parseDate(params.to, today());
  const endExclusive = addDays(toDate, 1);
  const fromValue = dateInputValue(fromDate);
  const toValue = dateInputValue(toDate);
  const importErrors = decodeImportErrors(params.importErrors);
  const monthValue = currentMonthValue();

  const tabHref = (tab: ActivityTab) => {
    const query = new URLSearchParams();
    query.set("tab", tab);
    query.set("from", fromValue);
    query.set("to", toValue);
    return `/atividade?${query.toString()}`;
  };

  const [rawPaymentLogs, bookingLogs, creditAdjustments, emailLogs, loginLogs, payments] = await Promise.all([
    prisma.personalTrainingPaymentLog.findMany({
      where: {
        createdAt: { gte: fromDate, lt: endExclusive }
      },
      orderBy: { createdAt: "desc" },
      take: 120
    }),
    prisma.personalTrainingBookingLog.findMany({
      where: {
        createdAt: { gte: fromDate, lt: endExclusive }
      },
      orderBy: { createdAt: "desc" },
      take: 120
    }),
    prisma.personalTrainingCreditAdjustment.findMany({
      where: {
        createdAt: { gte: fromDate, lt: endExclusive }
      },
      orderBy: { createdAt: "desc" },
      take: 120
    }),
    prisma.emailLog.findMany({
      where: {
        createdAt: { gte: fromDate, lt: endExclusive }
      },
      orderBy: { createdAt: "desc" },
      take: 120
    }),
    prisma.userLoginLog.findMany({
      where: {
        createdAt: { gte: fromDate, lt: endExclusive }
      },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 300
    }),
    prisma.personalTrainingPayment.findMany({
      where: {
        createdAt: { gte: fromDate, lt: endExclusive }
      },
      include: {
        teacher: { select: { name: true } },
        student: true,
        paymentType: true,
        createdBy: { select: { name: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 120
    })
  ]);

  const loggedCreatedPaymentIds = new Set(rawPaymentLogs.filter((log) => log.action === "created").map((log) => log.paymentId));
  const paymentLogs = [
    ...rawPaymentLogs,
    ...payments
      .filter((payment) => !loggedCreatedPaymentIds.has(payment.id))
      .map((payment) => ({
        id: `fallback-${payment.id}`,
        paymentId: payment.id,
        teacherId: payment.teacherId,
        studentId: payment.studentId,
        action: "created",
        teacherName: payment.teacher.name,
        studentName: payment.student.fullName,
        studentMemberNumber: payment.student.memberNumber,
        paymentType: payment.paymentType.description,
        quantity: payment.quantity,
        totalCredits: payment.totalCredits,
        totalPrice: payment.totalPrice,
        teacherTotal: payment.teacherTotal,
        createdByName: payment.createdBy?.name || null,
        actionById: payment.createdById,
        actionByName: payment.createdBy?.name || "Utilizador",
        reason: null,
        createdAt: payment.createdAt
      }))
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const createdPayments = paymentLogs.filter((log) => log.action === "created");
  const cancelledPayments = paymentLogs.filter((log) => log.action === "cancelled");
  const failedEmails = emailLogs.filter((log) => log.status === "failed");
  const classActivityLogs = emailLogs.filter((log) => log.type === "class_student_change" || log.type === "class_student_enrollment");
  const generalEmailLogs = emailLogs.filter((log) => log.type !== "class_student_change" && log.type !== "class_student_enrollment");
  const paymentCreditsTotal = paymentLogs.reduce((total, log) => {
    if (log.action === "created") return total + log.totalCredits;
    if (log.action === "cancelled") return total - log.totalCredits;
    return total;
  }, 0);
  const creditDeltaTotal = creditAdjustments.reduce((total, adjustment) => total + adjustment.deltaCredits, 0);
  const [creditTeachers, creditStudents] = await Promise.all([
    creditAdjustments.length
      ? prisma.user.findMany({
          where: { id: { in: Array.from(new Set(creditAdjustments.map((adjustment) => adjustment.teacherId))) } },
          select: { id: true, name: true }
        })
      : Promise.resolve([]),
    creditAdjustments.length
      ? prisma.personalTrainingStudent.findMany({
          where: { id: { in: Array.from(new Set(creditAdjustments.map((adjustment) => adjustment.studentId))) } },
          select: { id: true, fullName: true, memberNumber: true }
        })
      : Promise.resolve([])
  ]);
  const teacherNames = new Map(creditTeachers.map((teacher) => [teacher.id, teacher.name]));
  const studentNames = new Map(creditStudents.map((student) => [student.id, `${student.fullName} - ${student.memberNumber}`]));

  const recentEvents = [
    ...paymentLogs.map((log) => ({
      id: `payment-${log.id}`,
      date: log.createdAt,
      type: "Pagamento",
      title: actionLabel(log.action),
      detail: `${log.studentName} - ${log.paymentType}`,
      actor: log.actionByName
    })),
    ...bookingLogs.map((log) => ({
      id: `booking-${log.id}`,
      date: log.createdAt,
      type: "Marcação",
      title: actionLabel(log.action),
      detail: `${log.teacherName} - ${log.studentNames}`,
      actor: log.createdByName
    })),
    ...creditAdjustments.map((log) => ({
      id: `credit-${log.id}`,
      date: log.createdAt,
      type: "Créditos",
      title: `${log.deltaCredits > 0 ? "+" : ""}${log.deltaCredits} créditos`,
      detail: log.trainingTypeName,
      actor: log.createdByName
    })),
    ...classActivityLogs.map((log) => ({
      id: `class-${log.id}`,
      date: log.createdAt,
      type: "Turmas",
      title: log.type === "class_student_change" ? "Troca de turma" : "Nova inscricao",
      detail: log.subject,
      actor: log.toEmail
    })),
    ...generalEmailLogs.map((log) => ({
      id: `email-${log.id}`,
      date: log.createdAt,
      type: "Email",
      title: log.status === "sent" ? "Email enviado" : "Falha no email",
      detail: log.subject,
      actor: log.toEmail
    })),
    ...loginLogs.map((log) => ({
      id: `login-${log.id}`,
      date: log.createdAt,
      type: "Login",
      title: "Entrada na plataforma",
      detail: `${log.ipAddress || "IP desconhecido"} - ${log.browser || "Browser desconhecido"}`,
      actor: log.user.name
    }))
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 40);
  const loginRowsByAccess = new Map<
    string,
    {
      id: string;
      browser: string;
      city: string;
      country: string;
      createdAt: Date;
      createdAtLabel: string;
      ipAddress: string;
      platform: string;
      userEmail: string;
      userName: string;
    }
  >();

  for (const log of loginLogs) {
    const row = {
      id: log.id,
      browser: log.browser || "Desconhecido",
      city: log.city || "",
      country: log.country || "",
      createdAt: log.createdAt,
      createdAtLabel: log.createdAt.toLocaleString("pt-PT"),
      ipAddress: log.ipAddress || "Desconhecido",
      platform: log.platform || "Desconhecida",
      userEmail: log.user.email,
      userName: log.user.name
    };
    const key = [log.userId, row.ipAddress, row.browser, row.platform, row.city, row.country].join("|");
    const existing = loginRowsByAccess.get(key);

    if (!existing || row.createdAt > existing.createdAt) {
      loginRowsByAccess.set(key, row);
    }
  }

  const loginRows = Array.from(loginRowsByAccess.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(({ createdAt, ...row }) => row);

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel activity-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Administração</p>
            <h1>Atividade da plataforma</h1>
            <p className="muted">Consulta centralizada de pagamentos, marcações, créditos e emails.</p>
          </div>
        </div>

        <form className="activity-filter" method="get" action="/atividade">
          <input type="hidden" name="tab" value={activeTab} />
          <div className="field">
            <label htmlFor="from">De</label>
            <input id="from" name="from" type="date" defaultValue={fromValue} />
          </div>
          <div className="field">
            <label htmlFor="to">Até</label>
            <input id="to" name="to" type="date" defaultValue={toValue} />
          </div>
          <button className="button secondary" type="submit">
            Consultar
          </button>
        </form>

        <div className="stats-grid activity-stats">
          <div className="stat-card">
            <span>Pagamentos lançados</span>
            <strong>{createdPayments.length}</strong>
            <small className="muted">{cancelledPayments.length} anulados</small>
          </div>
          <div className="stat-card">
            <span>Marcações</span>
            <strong>{bookingLogs.length}</strong>
          </div>
          <div className="stat-card">
            <span>Ajustes créditos</span>
            <strong>{creditAdjustments.length}</strong>
            <small className={creditDeltaTotal + paymentCreditsTotal < 0 ? "negative-balance" : "muted"}>
              {creditDeltaTotal + paymentCreditsTotal > 0 ? "+" : ""}
              {creditDeltaTotal + paymentCreditsTotal} créditos total
            </small>
          </div>
          <div className="stat-card">
            <span>Emails falhados</span>
            <strong>{failedEmails.length}</strong>
          </div>
          <div className="stat-card">
            <span>Logins</span>
            <strong>{loginLogs.length}</strong>
          </div>
        </div>

        <div className="tabs">
          <a className={activeTab === "overview" ? "tab active" : "tab"} href={tabHref("overview")}>
            Resumo
          </a>
          <a className={activeTab === "payments" ? "tab active" : "tab"} href={tabHref("payments")}>
            Pagamentos
          </a>
          <a className={activeTab === "bookings" ? "tab active" : "tab"} href={tabHref("bookings")}>
            Marcações
          </a>
          <a className={activeTab === "credits" ? "tab active" : "tab"} href={tabHref("credits")}>
            Créditos
          </a>
          <a className={activeTab === "classes" ? "tab active" : "tab"} href={tabHref("classes")}>
            Turmas
          </a>
          <a className={activeTab === "emails" ? "tab active" : "tab"} href={tabHref("emails")}>
            Emails
          </a>
          <a className={activeTab === "logins" ? "tab active" : "tab"} href={tabHref("logins")}>
            Logins
          </a>
          <a className={activeTab === "maintenance" ? "tab active" : "tab"} href={tabHref("maintenance")}>
            Manutenção
          </a>
        </div>

        {activeTab === "overview" ? (
          <div className="activity-table compact-activity-table">
            <div className="activity-header">
              <span>Data</span>
              <span>Tipo</span>
              <span>Ação</span>
              <span>Detalhe</span>
              <span>Utilizador</span>
            </div>
            {recentEvents.length === 0 ? <p className="muted">Não existem eventos neste período.</p> : null}
            {recentEvents.map((event) => (
              <div className="activity-row" key={event.id}>
                <span>{event.date.toLocaleString("pt-PT")}</span>
                <span className="status">{event.type}</span>
                <span>{event.title}</span>
                <span>{event.detail}</span>
                <span>{event.actor}</span>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "payments" ? (
          <div className="activity-table payment-activity-table">
            <div className="payment-activity-header">
              <span>Data</span>
              <span>Ação</span>
              <span>Professor</span>
              <span>Utente</span>
              <span>Tipo</span>
              <span>Créditos</span>
              <span>Valor</span>
              <span>Utilizador</span>
              <span>Motivo</span>
            </div>
            {paymentLogs.length === 0 ? <p className="muted">Não existem logs de pagamentos neste período.</p> : null}
            {paymentLogs.map((log) => (
              <div className="payment-activity-row" key={log.id}>
                <span>{log.createdAt.toLocaleString("pt-PT")}</span>
                <span>{actionLabel(log.action)}</span>
                <span>{log.teacherName}</span>
                <span>
                  {log.studentName}
                  <small>{log.studentMemberNumber}</small>
                </span>
                <span>{log.paymentType}</span>
                <span>{log.totalCredits}</span>
                <span>{formatCurrency(log.teacherTotal)}</span>
                <span>{log.actionByName}</span>
                <span>{log.reason || "-"}</span>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "bookings" ? (
          <div className="activity-table booking-activity-table">
            <div className="booking-activity-header">
              <span>Data log</span>
              <span>Ação</span>
              <span>Aula</span>
              <span>Professor</span>
              <span>Utentes</span>
              <span>Pista</span>
              <span>Bloco</span>
              <span>Utilizador</span>
            </div>
            {bookingLogs.length === 0 ? <p className="muted">Não existem logs de marcações neste período.</p> : null}
            {bookingLogs.map((log) => (
              <div className="booking-activity-row" key={log.id}>
                <span>{log.createdAt.toLocaleString("pt-PT")}</span>
                <span>{actionLabel(log.action)}</span>
                <span>
                  {log.bookingDate.toLocaleDateString("pt-PT")}
                  <small>
                    {formatMinutes(log.startMinutes)} - {formatMinutes(log.endMinutes)}
                  </small>
                </span>
                <span>{log.teacherName}</span>
                <span>{log.studentNames}</span>
                <span>Pista {log.laneNumber}</span>
                <span>{log.poolBlockTitle}</span>
                <span>{log.createdByName}</span>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "credits" ? (
          <div className="activity-table credit-activity-table">
            <div className="credit-activity-header">
              <span>Data</span>
              <span>Professor</span>
              <span>Utente</span>
              <span>Tipo</span>
              <span>Ajuste</span>
              <span>Utilizador</span>
              <span>Motivo</span>
            </div>
            {paymentLogs.length === 0 && creditAdjustments.length === 0 ? (
              <p className="muted">Não existem movimentos de créditos neste período.</p>
            ) : null}
            {paymentLogs.map((log) => (
              <div className="credit-activity-row" key={`payment-credit-${log.id}`}>
                <span>{log.createdAt.toLocaleString("pt-PT")}</span>
                <span>{log.teacherName}</span>
                <span>
                  {log.studentName}
                  <small>{log.studentMemberNumber}</small>
                </span>
                <span>{log.paymentType}</span>
                <span className={log.action === "cancelled" ? "negative-balance" : ""}>
                  {log.action === "cancelled" ? "-" : "+"}
                  {log.totalCredits}
                </span>
                <span>{log.actionByName}</span>
                <span>{actionLabel(log.action)}</span>
              </div>
            ))}
            {creditAdjustments.map((log) => (
              <div className="credit-activity-row" key={log.id}>
                <span>{log.createdAt.toLocaleString("pt-PT")}</span>
                <span>{teacherNames.get(log.teacherId) || log.teacherId}</span>
                <span>{studentNames.get(log.studentId) || log.studentId}</span>
                <span>{log.trainingTypeName}</span>
                <span className={log.deltaCredits < 0 ? "negative-balance" : ""}>
                  {log.deltaCredits > 0 ? "+" : ""}
                  {log.deltaCredits}
                </span>
                <span>{log.createdByName}</span>
                <span>{log.reason || "-"}</span>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "classes" ? (
          <div className="activity-table email-activity-table">
            <div className="email-activity-header">
              <span>Data</span>
              <span>Estado</span>
              <span>Tipo</span>
              <span>Destinatarios</span>
              <span>Assunto</span>
              <span>Erro</span>
            </div>
            {classActivityLogs.length === 0 ? <p className="muted">Nao existem trocas de turma ou novas inscricoes neste periodo.</p> : null}
            {classActivityLogs.map((log) => (
              <div className="email-activity-row" key={log.id}>
                <span>{log.createdAt.toLocaleString("pt-PT")}</span>
                <span className={log.status === "sent" ? "status active" : log.status === "failed" ? "status inactive" : "status"}>
                  {log.status}
                </span>
                <span>{log.type === "class_student_change" ? "Troca de turma" : "Nova inscricao"}</span>
                <span>{log.toEmail}</span>
                <span>{log.subject}</span>
                <span>{log.error || "-"}</span>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "emails" ? (
          <div className="activity-table email-activity-table">
            <div className="email-activity-header">
              <span>Data</span>
              <span>Estado</span>
              <span>Para</span>
              <span>CC</span>
              <span>Assunto</span>
              <span>Erro</span>
            </div>
            {emailLogs.length === 0 ? <p className="muted">Não existem logs de email neste período.</p> : null}
            {emailLogs.map((log) => (
              <div className="email-activity-row" key={log.id}>
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

        {activeTab === "logins" ? <LoginActivitySearch logs={loginRows} /> : null}

        {activeTab === "maintenance" ? (
          <div className="maintenance-grid">
            {params.resetSuccess ? <p className="success">Dados operacionais limpos com sucesso. Os utilizadores foram preservados.</p> : null}
            {params.resetError ? <p className="error">Não foi possível limpar. Confirma o backup, a seleção e a frase de segurança.</p> : null}
            {params.resetUnauthorized ? <p className="error">A limpeza da base de dados só pode ser feita pelo superadmin definido no ambiente.</p> : null}
            {params.restoreSuccess ? <p className="success">Backup reposto com sucesso.</p> : null}
            {params.restoreError ? <p className="error">Não foi possível repor o backup. Confirma o ficheiro e a frase de segurança.</p> : null}

            {params.paymentDeleteSuccess ? (
              <p className="success">
                {params.paymentDeleteSuccess === "0"
                  ? "Não existiam pagamentos TP no período escolhido."
                  : `${params.paymentDeleteSuccess} pagamento(s) TP apagado(s). Os créditos dos alunos foram preservados.`}
              </p>
            ) : null}
            {params.paymentDeleteError ? <p className="error">Não foi possível apagar pagamentos. Confirma os meses, a proteção de créditos e a frase de segurança.</p> : null}
            {params.importSuccess ? <p className="success">{params.importSuccess} pagamento(s) importado(s) com sucesso.</p> : null}
            {params.importError ? (
              <div className="validation-panel">
                <strong>Importação rejeitada</strong>
                <p className="muted">Nenhum pagamento foi inserido. Corrige os erros no ficheiro e volta a carregar.</p>
                {(importErrors.length > 0 ? importErrors : ["A importação foi rejeitada, mas não foi possível apresentar o detalhe. Tenta novamente após atualizar a página."]).map((error, index) => (
                  <div className="validation-row error" key={`${error}-${index}`}>
                    <span>Erro</span>
                    <div>
                      <strong>Linha do Excel</strong>
                      <p>{error}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="maintenance-card">
              <div>
                <h2>Backup antes da limpeza</h2>
                <p className="muted">
                  Exporta pagamentos, ajustes de créditos, marcações PT, histórico de emails e respetivos logs para um ficheiro JSON.
                </p>
              </div>
              <a className="button secondary" href="/api/admin/training-data-backup">
                Descarregar backup
              </a>
            </div>

            {isSuperadmin ? (
              <form className="maintenance-card danger-zone reset-maintenance-card" action="/api/admin/training-data-reset" method="post">
                <div>
                  <h2>Limpeza total ou seletiva</h2>
                  <p className="muted">
                    Remove dados operacionais sem apagar utilizadores. As configurações, tipos, valores hora e ocupações semanais ficam preservados.
                  </p>
                </div>
                <div className="maintenance-inline-fields reset-mode-fields">
                  <label className="checkbox">
                    <input type="radio" name="resetMode" value="selective" defaultChecked />
                    Limpeza seletiva
                  </label>
                  <label className="checkbox">
                    <input type="radio" name="resetMode" value="total" />
                    Limpeza total operacional
                  </label>
                </div>
                <p className="muted reset-note">
                  Na limpeza seletiva contam apenas os grupos assinalados. Na limpeza total operacional são incluídos todos os grupos abaixo.
                </p>
                <div className="maintenance-target-grid" aria-label="Dados a limpar">
                  <label className="checkbox">
                    <input type="checkbox" name="resetTargets" value="personalTraining" defaultChecked />
                    <span>
                      <strong>Treinos personalizados</strong>
                      <small>Alunos, pagamentos, créditos, marcações e logs PT</small>
                    </span>
                  </label>
                  <label className="checkbox">
                    <input type="checkbox" name="resetTargets" value="birthdayParties" />
                    <span>
                      <strong>Festas de aniversário</strong>
                      <small>Festas, monitores e histórico de pagamento</small>
                    </span>
                  </label>
                  <label className="checkbox">
                    <input type="checkbox" name="resetTargets" value="substitutions" />
                    <span>
                      <strong>Substituições</strong>
                      <small>Pedidos e aulas associadas</small>
                    </span>
                  </label>
                  <label className="checkbox">
                    <input type="checkbox" name="resetTargets" value="availability" />
                    <span>
                      <strong>Disponibilidade novos TP</strong>
                      <small>Janelas indicadas pelos professores</small>
                    </span>
                  </label>
                  <label className="checkbox">
                    <input type="checkbox" name="resetTargets" value="emailLogs" />
                    <span>
                      <strong>Histórico de emails</strong>
                      <small>Registos de emails enviados ou falhados</small>
                    </span>
                  </label>
                  <label className="checkbox">
                    <input type="checkbox" name="resetTargets" value="loginLogs" />
                    <span>
                      <strong>Logs de acesso</strong>
                      <small>Registos de atividade/login dos utilizadores</small>
                    </span>
                  </label>
                </div>
                <label className="checkbox">
                  <input type="checkbox" name="backupConfirmed" required />
                  Confirmo que descarreguei o backup antes de limpar
                </label>
                <div className="field">
                  <label htmlFor="typedConfirmation">Frase de segurança</label>
                  <input id="typedConfirmation" name="typedConfirmation" placeholder="LIMPAR DADOS OPERACIONAIS" required />
                </div>
                <button className="button danger" type="submit">
                  Limpar dados selecionados
                </button>
              </form>
            ) : (
              <div className="maintenance-card locked-maintenance-card">
                <div>
                  <h2>Limpeza da base de dados</h2>
                  <p className="muted">Esta operação está reservada ao superadmin definido no ambiente da plataforma.</p>
                </div>
                <span className="status inactive">Restrito</span>
              </div>
            )}

            <form className="maintenance-card" action="/api/admin/training-data-restore" method="post" encType="multipart/form-data">
              <div>
                <h2>Repor backup</h2>
                <p className="muted">
                  Carrega o ficheiro JSON exportado. A reposição substitui os dados TP operacionais atuais pelos dados do backup.
                </p>
              </div>
              <div className="field">
                <label htmlFor="backupFile">Ficheiro de backup</label>
                <input id="backupFile" name="backupFile" type="file" accept="application/json,.json" required />
              </div>
              <div className="field">
                <label htmlFor="restoreConfirmation">Frase de segurança</label>
                <input id="restoreConfirmation" name="restoreConfirmation" placeholder="REPOR BACKUP TP" required />
              </div>
              <button className="button secondary" type="submit">
                Repor backup
              </button>
            </form>

            <form className="maintenance-card danger-zone" action="/api/admin/personal-training-payments/delete-months" method="post">
              <div>
                <h2>Apagar pagamentos TP por mês</h2>
                <p className="muted">
                  Remove apenas os registos de pagamentos e respetivos logs no intervalo escolhido. Para não alterar os saldos, os créditos dos pagamentos ativos são preservados como ajuste manual.
                </p>
              </div>
              <div className="maintenance-inline-fields">
                <div className="field">
                  <label htmlFor="fromMonth">De mês</label>
                  <input id="fromMonth" name="fromMonth" type="month" defaultValue={monthValue} required />
                </div>
                <div className="field">
                  <label htmlFor="toMonth">Até mês</label>
                  <input id="toMonth" name="toMonth" type="month" defaultValue={monthValue} required />
                </div>
              </div>
              <label className="checkbox">
                <input type="checkbox" name="preserveCredits" required />
                Confirmo que os créditos dos alunos devem ser preservados
              </label>
              <div className="field">
                <label htmlFor="deletePaymentsConfirmation">Frase de segurança</label>
                <input id="deletePaymentsConfirmation" name="typedConfirmation" placeholder="APAGAR PAGAMENTOS TP" required />
              </div>
              <button className="button danger" type="submit">
                Apagar pagamentos TP
              </button>
            </form>

            <PersonalTrainingImportForm />
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
