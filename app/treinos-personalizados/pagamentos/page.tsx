import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PaymentLaunchForm } from "@/components/PaymentLaunchForm";
import { TeacherAutoSubmitFilter } from "@/components/TeacherAutoSubmitFilter";
import { requireUser } from "@/lib/auth";
import { currentBillingMonthValue, formatBillingPeriod, getBillingCycleLabel, getBillingPeriod } from "@/lib/billingCycles";
import { decimalToNumber, formatCurrency } from "@/lib/money";
import { getCreditBalancesForTeacher } from "@/lib/personalTrainingCredits";
import { requiredParticipantsForType } from "@/lib/personalTrainingRules";
import { prisma } from "@/lib/prisma";

function getAdminGlobalPeriod(monthValue: string) {
  const [yearValue, monthValueText] = monthValue.split("-");
  const year = Number(yearValue);
  const monthIndex = Number(monthValueText) - 1;
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && monthIndex === now.getMonth();

  return {
    start: new Date(year, monthIndex, 1),
    endExclusive: isCurrentMonth
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      : new Date(year, monthIndex + 1, 1)
  };
}

export default async function PersonalTrainingPaymentsPage({
  searchParams
}: {
  searchParams: Promise<{
    teacherId?: string;
    error?: string;
    success?: string;
    creditSuccess?: string;
    paymentCancelSuccess?: string;
    tab?: string;
    month?: string;
    globalMonth?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);
  const isAdmin = roleKeys.includes("admin");
  const isReception = roleKeys.includes("recepcao");
  const canCreate = roleKeys.includes("admin") || roleKeys.includes("recepcao");
  const canViewAsTeacher = roleKeys.includes("professor");
  const isReceptionOnly = isReception && !isAdmin && !canViewAsTeacher;

  if (!canCreate && !canViewAsTeacher) {
    redirect("/dashboard");
  }

  const teachers = await prisma.user.findMany({
    where: {
      active: true,
      roles: { some: { role: { key: "professor" } } }
    },
    orderBy: { name: "asc" }
  });

  const selectedTeacherId = canCreate ? params.teacherId || (canViewAsTeacher ? user.id : teachers[0]?.id) || "" : user.id;
  const selectedTeacher = teachers.find((teacher) => teacher.id === selectedTeacherId);
  const selectedBillingCycle = isReceptionOnly ? "calendar_month" : selectedTeacher?.billingCycle || user.billingCycle || "calendar_month";
  const selectedMonth = params.month || currentBillingMonthValue();
  const selectedGlobalMonth = params.globalMonth || currentBillingMonthValue();
  const activeTab =
    isAdmin && params.tab === "global"
      ? "global"
      : params.tab === "credits"
        ? "credits"
        : params.tab === "payments" || isReceptionOnly
          ? "payments"
          : "credits";
  const billingPeriod = getBillingPeriod(selectedBillingCycle, selectedMonth);
  const globalPeriod = getAdminGlobalPeriod(selectedGlobalMonth);
  const managementTitle = isReceptionOnly ? "Pagamentos lançados por mim" : selectedTeacher?.name || user.name;

  const tabHref = (tab: "credits" | "payments" | "global") => {
    const query = new URLSearchParams();
    if (canCreate && selectedTeacherId) {
      query.set("teacherId", selectedTeacherId);
    }
    query.set("tab", tab);
    query.set("month", selectedMonth);
    query.set("globalMonth", selectedGlobalMonth);

    return `/treinos-personalizados/pagamentos?${query.toString()}`;
  };

  const reportHref = (type: "payments" | "bookings") => {
    const query = new URLSearchParams();
    query.set("teacherId", selectedTeacherId);
    query.set("month", selectedMonth);

    return `/api/personal-training/reports/${type}?${query.toString()}`;
  };

  const [paymentTypes, teacherStudents, payments, creditBalances, globalPayments, paymentCancelLogs] = await Promise.all([
    prisma.personalTrainingPaymentType.findMany({
      where: { active: true },
      orderBy: { description: "asc" }
    }),
    selectedTeacherId
      ? prisma.personalTrainingStudent.findMany({
          where: { payments: { some: { teacherId: selectedTeacherId } } },
          orderBy: { fullName: "asc" }
        })
      : Promise.resolve([]),
    prisma.personalTrainingPayment.findMany({
      where: {
        ...(isAdmin
          ? selectedTeacherId
            ? { teacherId: selectedTeacherId }
            : {}
          : isReceptionOnly
            ? { createdById: user.id }
            : { teacherId: user.id }),
        createdAt: {
          gte: billingPeriod.start,
          lt: billingPeriod.endExclusive
        }
      },
      orderBy: { createdAt: "desc" },
      include: {
        teacher: { select: { name: true } },
        student: true,
        paymentType: true,
        createdBy: { select: { name: true } }
      }
    }),
    selectedTeacherId ? getCreditBalancesForTeacher(selectedTeacherId) : Promise.resolve([]),
    isAdmin
      ? prisma.personalTrainingPayment.findMany({
          where: {
            createdAt: {
              gte: globalPeriod.start,
              lt: globalPeriod.endExclusive
            }
          },
          orderBy: [{ teacher: { name: "asc" } }, { createdAt: "desc" }],
          include: {
            teacher: { select: { name: true } },
            student: true,
            paymentType: true,
            createdBy: { select: { name: true } }
          }
        })
      : Promise.resolve([]),
    isAdmin && selectedTeacherId
      ? prisma.personalTrainingPaymentLog.findMany({
          where: {
            teacherId: selectedTeacherId,
            action: "cancelled",
            createdAt: {
              gte: billingPeriod.start,
              lt: billingPeriod.endExclusive
            }
          },
          orderBy: { createdAt: "desc" }
        })
      : Promise.resolve([])
  ]);

  const activePayments = payments.filter((payment) => payment.status !== "cancelled");
  const activeGlobalPayments = globalPayments.filter((payment) => payment.status !== "cancelled");
  const canCancelPayments = isAdmin || isReception;

  const paymentStats = activePayments.reduce(
    (stats, payment) => ({
      count: stats.count + 1,
      quantity: stats.quantity + payment.quantity,
      credits: stats.credits + payment.totalCredits,
      totalClient: stats.totalClient + decimalToNumber(payment.totalPrice),
      totalTeacher: stats.totalTeacher + decimalToNumber(payment.teacherTotal)
    }),
    { count: 0, quantity: 0, credits: 0, totalClient: 0, totalTeacher: 0 }
  );
  const trainingTypeStats = Array.from(
    activePayments.reduce((map, payment) => {
      const typeName = payment.paymentType.description;
      const current = map.get(typeName) || { typeName, quantity: 0, totalClient: 0, totalTeacher: 0 };
      current.quantity += payment.quantity;
      current.totalClient += decimalToNumber(payment.totalPrice);
      current.totalTeacher += decimalToNumber(payment.teacherTotal);
      map.set(typeName, current);
      return map;
    }, new Map<string, { typeName: string; quantity: number; totalClient: number; totalTeacher: number }>())
  )
    .map(([, value]) => value)
    .sort((a, b) => b.totalTeacher - a.totalTeacher || b.quantity - a.quantity || a.typeName.localeCompare(b.typeName));
  const maxTrainingTypeQuantity = Math.max(...trainingTypeStats.map((item) => item.quantity), 0);
  const globalStats = activeGlobalPayments.reduce(
    (stats, payment) => ({
      count: stats.count + 1,
      quantity: stats.quantity + payment.quantity,
      credits: stats.credits + payment.totalCredits,
      totalClient: stats.totalClient + decimalToNumber(payment.totalPrice),
      totalTeacher: stats.totalTeacher + decimalToNumber(payment.teacherTotal)
    }),
    { count: 0, quantity: 0, credits: 0, totalClient: 0, totalTeacher: 0 }
  );
  const globalTeacherStats = Array.from(
    activeGlobalPayments.reduce((map, payment) => {
      const current = map.get(payment.teacherId) || {
        teacherName: payment.teacher.name,
        count: 0,
        quantity: 0,
        totalClient: 0,
        totalTeacher: 0
      };
      current.count += 1;
      current.quantity += payment.quantity;
      current.totalClient += decimalToNumber(payment.totalPrice);
      current.totalTeacher += decimalToNumber(payment.teacherTotal);
      map.set(payment.teacherId, current);
      return map;
    }, new Map<string, { teacherName: string; count: number; quantity: number; totalClient: number; totalTeacher: number }>())
  )
    .map(([, value]) => value)
    .sort((a, b) => b.totalTeacher - a.totalTeacher || a.teacherName.localeCompare(b.teacherName));
  const globalTrainingTypeStats = Array.from(
    activeGlobalPayments.reduce((map, payment) => {
      const typeName = payment.paymentType.description;
      const current = map.get(typeName) || { typeName, quantity: 0, totalClient: 0, totalTeacher: 0 };
      current.quantity += payment.quantity;
      current.totalClient += decimalToNumber(payment.totalPrice);
      current.totalTeacher += decimalToNumber(payment.teacherTotal);
      map.set(typeName, current);
      return map;
    }, new Map<string, { typeName: string; quantity: number; totalClient: number; totalTeacher: number }>())
  )
    .map(([, value]) => value)
    .sort((a, b) => b.totalTeacher - a.totalTeacher || b.quantity - a.quantity || a.typeName.localeCompare(b.typeName));
  const maxGlobalTrainingTypeTotal = Math.max(...globalTrainingTypeStats.map((type) => type.totalTeacher), 0);
  const paymentTypeOptions = paymentTypes.map((type) => ({
    id: type.id,
    label: `${type.description} - ${type.credits} créditos - ${formatCurrency(type.price)}`,
    requiredParticipants: requiredParticipantsForType(type.description)
  }));
  const teacherStudentOptions = teacherStudents.map((student) => ({
    id: student.id,
    label: `${student.fullName} - ${student.memberNumber}`
  }));

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel payment-page-hero">
        <div className="topbar">
          <div>
            <p className="eyebrow">Treinos Personalizados</p>
            <h1>Pagamentos de aulas</h1>
            <p className="muted">
              {canCreate
                ? "Lança pagamentos para o professor selecionado."
                : "Consulta os pagamentos lançados para os teus alunos."}
            </p>
          </div>
        </div>

        {params.success ? <p className="success">Pagamento lançado com sucesso.</p> : null}
        {params.creditSuccess ? <p className="success">Créditos corrigidos com sucesso.</p> : null}
        {params.paymentCancelSuccess ? <p className="success">Pagamento anulado com sucesso.</p> : null}
        {params.error ? <p className="error">Não foi possível lançar o pagamento. Confirma professor, aluno, tipo e quantidade.</p> : null}

        {canCreate ? (
          <>
            <TeacherAutoSubmitFilter
              teachers={teachers.map((teacher) => ({ id: teacher.id, name: teacher.name }))}
              selectedTeacherId={selectedTeacherId}
              activeTab={activeTab}
              selectedMonth={selectedMonth}
              selectedGlobalMonth={selectedGlobalMonth}
            />

            <PaymentLaunchForm teacherId={selectedTeacherId} paymentTypes={paymentTypeOptions} students={teacherStudentOptions} />
          </>
        ) : null}
      </section>

      <section className="panel payment-workspace">
        <div className="topbar">
          <div>
            <p className="eyebrow">Gestão</p>
            <h1>{managementTitle}</h1>
            <p className="muted">
              {isReceptionOnly
                ? "Consulta e anula apenas pagamentos lançados pelo teu utilizador."
                : `Ciclo de faturação: ${getBillingCycleLabel(selectedBillingCycle)}`}
            </p>
          </div>
        </div>

        <div className="tabs">
          <a className={activeTab === "credits" ? "tab active" : "tab"} href={tabHref("credits")}>
            Créditos dos alunos
          </a>
          <a className={activeTab === "payments" ? "tab active" : "tab"} href={tabHref("payments")}>
            {isAdmin ? "Pagamentos professor selecionado" : "Pagamentos"}
          </a>
          {isAdmin ? (
            <a className={activeTab === "global" ? "tab active" : "tab"} href={tabHref("global")}>
              Pagamentos todos os professores
            </a>
          ) : null}
        </div>

        {activeTab === "credits" ? (
          <div className="credits-table">
            <div className={isAdmin ? "credits-header admin-credits-row" : "credits-header"}>
              <span>Utente</span>
              <span>Tipo</span>
              <span>Comprados</span>
              <span>Ajustes</span>
              <span>Usados</span>
              <span>Saldo</span>
              <span>Estado</span>
              {isAdmin ? <span>Corrigir saldo</span> : null}
            </div>
            {creditBalances.length === 0 ? <p className="muted">Ainda não existem saldos para este professor.</p> : null}
            {creditBalances.map((balance) => (
              <div className={isAdmin ? "credits-row admin-credits-row" : "credits-row"} key={`${balance.studentId}-${balance.trainingTypeName}`}>
                <span>
                  {balance.fullName}
                  <small>{balance.memberNumber}</small>
                </span>
                <span>{balance.trainingTypeName}</span>
                <span>{balance.purchasedCredits}</span>
                <span className={balance.adjustedCredits < 0 ? "negative-balance" : ""}>{balance.adjustedCredits}</span>
                <span>{balance.usedCredits}</span>
                <span className={balance.availableCredits < 0 ? "negative-balance" : ""}>{balance.availableCredits}</span>
                <span className={balance.canBook ? "status active" : "status inactive"}>
                  {balance.canBook ? "Pode marcar" : "Sem margem"}
                </span>
                {isAdmin ? (
                  <form className="credit-adjust-form" action="/api/personal-training/credit-adjustments" method="post">
                    <input type="hidden" name="teacherId" value={selectedTeacherId} />
                    <input type="hidden" name="studentId" value={balance.studentId} />
                    <input type="hidden" name="trainingTypeKey" value={balance.trainingTypeKey} />
                    <input name="targetAvailableCredits" type="number" step="1" defaultValue={balance.availableCredits} title="Saldo pretendido" />
                    <input name="reason" placeholder="Motivo" title="Motivo" />
                    <button className="button secondary" type="submit">
                      Guardar
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "payments" ? (
          <div className="tab-content">
            <form className="period-filter" method="get" action="/treinos-personalizados/pagamentos">
              {canCreate ? <input type="hidden" name="teacherId" value={selectedTeacherId} /> : null}
              <input type="hidden" name="tab" value="payments" />
              <div className="field">
                <label htmlFor="month">Mes</label>
                <input id="month" name="month" type="month" defaultValue={selectedMonth} />
              </div>
              <div className="period-summary">
                <strong>{formatBillingPeriod(billingPeriod.start, billingPeriod.endExclusive)}</strong>
                <small>{getBillingCycleLabel(selectedBillingCycle)}</small>
              </div>
              <button className="button secondary" type="submit">
                Consultar
              </button>
            </form>

            <div className="stats-grid">
              <div className="stat-card">
                <span>Pagamentos</span>
                <strong>{paymentStats.count}</strong>
              </div>
              <div className="stat-card">
                <span>Quantidade</span>
                <strong>{paymentStats.quantity}</strong>
              </div>
              <div className="stat-card">
                <span>Créditos</span>
                <strong>{paymentStats.credits}</strong>
              </div>
              {isAdmin ? (
                <div className="stat-card">
                  <span>Total utente</span>
                  <strong>{formatCurrency(paymentStats.totalClient)}</strong>
                </div>
              ) : null}
              <div className="stat-card">
                <span>Total professor</span>
                <strong>{formatCurrency(paymentStats.totalTeacher)}</strong>
              </div>
            </div>

            <div className="chart-panel">
              <div>
                <h2>Tipos de treino pagos</h2>
                <p className="muted">Quantidade e valor por tipo de pagamento no período selecionado.</p>
              </div>
              <div className="bar-chart">
                {trainingTypeStats.length === 0 ? <p className="muted">Sem dados para apresentar.</p> : null}
                {trainingTypeStats.map((item) => (
                  <div className="bar-row training-type-bar-row" key={item.typeName}>
                    <span title={item.typeName}>{item.typeName}</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${maxTrainingTypeQuantity ? Math.max(8, (item.quantity / maxTrainingTypeQuantity) * 100) : 0}%` }}
                      />
                    </div>
                    <strong>{item.quantity}</strong>
                    <strong>
                      {formatCurrency(item.totalTeacher)}
                      {isAdmin ? <small>{formatCurrency(item.totalClient)} utente</small> : null}
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            {isAdmin ? (
              <div className="report-actions">
                <a className="button secondary" href={reportHref("payments")}>
                  Exportar pagamentos Excel
                </a>
                <a className="button secondary" href={reportHref("bookings")}>
                  Exportar agendamentos Excel
                </a>
              </div>
            ) : null}

            <div className="payments-table">
              <div
                className={`${isAdmin ? "payments-header" : "payments-header teacher-values"} ${
                  canCancelPayments ? "with-actions" : ""
                }`}
              >
                <span>Data</span>
                {isAdmin ? <span>Professor</span> : null}
                <span>Utente</span>
                <span>Lançado por</span>
                <span>Tipo</span>
                <span>Qtd./Cred.</span>
                <span>Valores</span>
                <span>Estado</span>
                {canCancelPayments ? <span>Ação</span> : null}
              </div>
              {payments.length === 0 ? <p className="muted">Não existem pagamentos neste ciclo.</p> : null}
              {payments.map((payment) => {
                const isCancelled = payment.status === "cancelled";
                const canCancelPayment = canCancelPayments && !isCancelled && (isAdmin || payment.createdById === user.id);

                return (
                  <div
                    className={`${isAdmin ? "payments-row" : "payments-row teacher-values"} ${
                      canCancelPayments ? "with-actions" : ""
                    } ${isCancelled ? "cancelled-payment" : ""}`}
                    key={payment.id}
                  >
                    <span>{payment.createdAt.toLocaleDateString("pt-PT")}</span>
                    {isAdmin ? <span>{payment.teacher.name}</span> : null}
                    <span>
                      {payment.student.fullName}
                      <small>{payment.student.memberNumber}</small>
                    </span>
                    <span>{payment.createdBy?.name || "-"}</span>
                    <span>{payment.paymentType.description}</span>
                    <span>
                      {payment.quantity} qtd.
                      <small>{payment.totalCredits} créditos</small>
                    </span>
                    <span>
                      {formatCurrency(payment.teacherTotal)}
                      {isAdmin ? <small>{formatCurrency(payment.totalPrice)} utente</small> : null}
                    </span>
                    <span className={isCancelled ? "status inactive" : "status active"}>
                      {isCancelled ? "Anulado" : "Ativo"}
                      {isCancelled && payment.cancelledByName ? <small>por {payment.cancelledByName}</small> : null}
                    </span>
                    {canCancelPayments ? (
                      <span>
                        {canCancelPayment ? (
                          <form className="payment-cancel-form" action="/api/personal-training/payments/cancel" method="post">
                            <input type="hidden" name="paymentId" value={payment.id} />
                            <input type="hidden" name="teacherId" value={selectedTeacherId} />
                            <input type="hidden" name="month" value={selectedMonth} />
                            <input name="reason" placeholder="Motivo" />
                            <button className="button danger" type="submit">
                              Anular
                            </button>
                          </form>
                        ) : (
                          <small className="muted">Sem permissão</small>
                        )}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {isAdmin ? (
              <div className="payment-logs-table">
                <div className="section-heading">
                  <div>
                    <h2>Logs de anulação</h2>
                    <p className="muted">Pagamentos anulados no ciclo selecionado.</p>
                  </div>
                </div>
                <div className="payment-logs-header">
                  <span>Data</span>
                  <span>Anulado por</span>
                  <span>Utente</span>
                  <span>Tipo</span>
                  <span>Créditos</span>
                  <span>Total professor</span>
                  <span>Motivo</span>
                </div>
                {paymentCancelLogs.length === 0 ? <p className="muted">Não existem anulações neste ciclo.</p> : null}
                {paymentCancelLogs.map((log) => (
                  <div className="payment-logs-row" key={log.id}>
                    <span>{log.createdAt.toLocaleString("pt-PT")}</span>
                    <span>{log.actionByName}</span>
                    <span>
                      {log.studentName}
                      <small>{log.studentMemberNumber}</small>
                    </span>
                    <span>{log.paymentType}</span>
                    <span>{log.totalCredits}</span>
                    <span>{formatCurrency(log.teacherTotal)}</span>
                    <span>{log.reason || "-"}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "global" && isAdmin ? (
          <div className="tab-content">
            <form className="period-filter" method="get" action="/treinos-personalizados/pagamentos">
              <input type="hidden" name="teacherId" value={selectedTeacherId} />
              <input type="hidden" name="tab" value="global" />
              <input type="hidden" name="month" value={selectedMonth} />
              <div className="field">
                <label htmlFor="globalMonth">Mes</label>
                <input id="globalMonth" name="globalMonth" type="month" defaultValue={selectedGlobalMonth} />
              </div>
              <div className="period-summary">
                <strong>{formatBillingPeriod(globalPeriod.start, globalPeriod.endExclusive)}</strong>
                <small>Todos os professores</small>
              </div>
              <button className="button secondary" type="submit">
                Consultar
              </button>
            </form>

            <div className="stats-grid">
              <div className="stat-card">
                <span>Pagamentos</span>
                <strong>{globalStats.count}</strong>
              </div>
              <div className="stat-card">
                <span>Quantidade</span>
                <strong>{globalStats.quantity}</strong>
              </div>
              <div className="stat-card">
                <span>Créditos</span>
                <strong>{globalStats.credits}</strong>
              </div>
              <div className="stat-card">
                <span>Total utente</span>
                <strong>{formatCurrency(globalStats.totalClient)}</strong>
              </div>
              <div className="stat-card">
                <span>Total professores</span>
                <strong>{formatCurrency(globalStats.totalTeacher)}</strong>
              </div>
            </div>

            <div className="chart-panel">
              <div>
                <h2>Total por tipo de treino</h2>
                <p className="muted">Quantidade e valor por tipo de pagamento no período selecionado.</p>
              </div>
              <div className="bar-chart">
                {globalTrainingTypeStats.length === 0 ? <p className="muted">Sem dados para apresentar.</p> : null}
                {globalTrainingTypeStats.map((type) => (
                  <div className="bar-row training-type-bar-row" key={type.typeName}>
                    <span title={type.typeName}>{type.typeName}</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${
                            maxGlobalTrainingTypeTotal
                              ? Math.max(8, (type.totalTeacher / maxGlobalTrainingTypeTotal) * 100)
                              : 0
                          }%`
                        }}
                      />
                    </div>
                    <strong>{type.quantity}</strong>
                    <strong>
                      {formatCurrency(type.totalTeacher)}
                      <small>{formatCurrency(type.totalClient)} utente</small>
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="global-payments-table">
              <div className="global-payments-header">
                <span>Professor</span>
                <span>Pagamentos</span>
                <span>Quantidade</span>
                <span>Total utente</span>
                <span>Total professor</span>
              </div>
              {globalTeacherStats.length === 0 ? <p className="muted">Não existem pagamentos neste período.</p> : null}
              {globalTeacherStats.map((teacher) => (
                <div className="global-payments-row" key={teacher.teacherName}>
                  <span>{teacher.teacherName}</span>
                  <span>{teacher.count}</span>
                  <span>{teacher.quantity}</span>
                  <span>{formatCurrency(teacher.totalClient)}</span>
                  <span>{formatCurrency(teacher.totalTeacher)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
