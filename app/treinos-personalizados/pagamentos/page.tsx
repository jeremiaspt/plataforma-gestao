import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import { currentBillingMonthValue, formatBillingPeriod, getBillingCycleLabel, getBillingPeriod } from "@/lib/billingCycles";
import { decimalToNumber, formatCurrency } from "@/lib/money";
import { getCreditBalancesForTeacher } from "@/lib/personalTrainingCredits";
import { prisma } from "@/lib/prisma";

export default async function PersonalTrainingPaymentsPage({
  searchParams
}: {
  searchParams: Promise<{ teacherId?: string; error?: string; success?: string; tab?: string; month?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);
  const canCreate = roleKeys.includes("admin") || roleKeys.includes("recepcao");
  const canViewAsTeacher = roleKeys.includes("professor");

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

  const selectedTeacherId = canCreate ? params.teacherId || teachers[0]?.id || "" : user.id;
  const selectedTeacher = teachers.find((teacher) => teacher.id === selectedTeacherId);
  const selectedBillingCycle = selectedTeacher?.billingCycle || user.billingCycle || "calendar_month";
  const selectedMonth = params.month || currentBillingMonthValue();
  const activeTab = params.tab === "payments" ? "payments" : "credits";
  const billingPeriod = getBillingPeriod(selectedBillingCycle, selectedMonth);

  const tabHref = (tab: "credits" | "payments") => {
    const query = new URLSearchParams();
    if (canCreate && selectedTeacherId) {
      query.set("teacherId", selectedTeacherId);
    }
    query.set("tab", tab);
    query.set("month", selectedMonth);

    return `/treinos-personalizados/pagamentos?${query.toString()}`;
  };

  const [paymentTypes, teacherStudents, payments, creditBalances] = await Promise.all([
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
        ...(canCreate ? (selectedTeacherId ? { teacherId: selectedTeacherId } : {}) : { teacherId: user.id }),
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
    selectedTeacherId ? getCreditBalancesForTeacher(selectedTeacherId) : Promise.resolve([])
  ]);

  const paymentStats = payments.reduce(
    (stats, payment) => ({
      count: stats.count + 1,
      quantity: stats.quantity + payment.quantity,
      credits: stats.credits + payment.totalCredits,
      totalClient: stats.totalClient + decimalToNumber(payment.totalPrice),
      totalTeacher: stats.totalTeacher + decimalToNumber(payment.teacherTotal)
    }),
    { count: 0, quantity: 0, credits: 0, totalClient: 0, totalTeacher: 0 }
  );

  return (
    <AppShell userName={user.name}>
      <section className="panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Treinos Personalizados</p>
            <h1>Pagamentos de aulas</h1>
            <p className="muted">
              {canCreate
                ? "Lanca pagamentos para o professor selecionado."
                : "Consulta os pagamentos lancados para os teus alunos."}
            </p>
          </div>
        </div>

        {params.success ? <p className="success">Pagamento lancado com sucesso.</p> : null}
        {params.error ? <p className="error">Nao foi possivel lancar o pagamento. Confirma professor, aluno, tipo e quantidade.</p> : null}

        {canCreate ? (
          <>
            <form className="teacher-filter" method="get" action="/treinos-personalizados/pagamentos">
              <input type="hidden" name="tab" value={activeTab} />
              <input type="hidden" name="month" value={selectedMonth} />
              <div className="field">
                <label htmlFor="teacherId">Professor</label>
                <select id="teacherId" name="teacherId" defaultValue={selectedTeacherId}>
                  {teachers.map((teacher) => (
                    <option value={teacher.id} key={teacher.id}>
                      {teacher.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="button secondary" type="submit">
                Ver alunos
              </button>
            </form>

            <form className="payment-launch-form" action="/api/personal-training/payments" method="post">
              <input type="hidden" name="teacherId" value={selectedTeacherId} />
              <div className="field">
                <label htmlFor="existingStudentId">Aluno do professor</label>
                <select id="existingStudentId" name="existingStudentId" defaultValue="">
                  <option value="">Adicionar novo aluno</option>
                  {teacherStudents.map((student) => (
                    <option value={student.id} key={student.id}>
                      {student.fullName} - {student.memberNumber}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="memberNumber">N.º utente</label>
                <input id="memberNumber" name="memberNumber" />
              </div>
              <div className="field">
                <label htmlFor="fullName">Nome completo</label>
                <input id="fullName" name="fullName" />
              </div>
              <div className="field wide">
                <label htmlFor="paymentTypeId">Tipo de aula</label>
                <select id="paymentTypeId" name="paymentTypeId" required>
                  {paymentTypes.map((type) => (
                    <option value={type.id} key={type.id}>
                      {type.description} - {type.credits} creditos - {formatCurrency(type.price)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="quantity">Quantidade</label>
                <input id="quantity" name="quantity" type="number" min="1" step="1" defaultValue="1" required />
              </div>
              <button className="button" type="submit" disabled={!selectedTeacherId || paymentTypes.length === 0}>
                Lancar pagamento
              </button>
            </form>
          </>
        ) : null}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="topbar">
          <div>
            <p className="eyebrow">Gestao</p>
            <h1>{selectedTeacher?.name || user.name}</h1>
            <p className="muted">Ciclo de faturacao: {getBillingCycleLabel(selectedBillingCycle)}</p>
          </div>
        </div>

        <div className="tabs">
          <a className={activeTab === "credits" ? "tab active" : "tab"} href={tabHref("credits")}>
            Creditos dos alunos
          </a>
          <a className={activeTab === "payments" ? "tab active" : "tab"} href={tabHref("payments")}>
            Pagamentos
          </a>
        </div>

        {activeTab === "credits" ? (
          <div className="credits-table">
            <div className="credits-header">
              <span>Utente</span>
              <span>Tipo</span>
              <span>Comprados</span>
              <span>Usados</span>
              <span>Saldo</span>
              <span>Estado</span>
            </div>
            {creditBalances.length === 0 ? <p className="muted">Ainda nao existem saldos para este professor.</p> : null}
            {creditBalances.map((balance) => (
              <div className="credits-row" key={`${balance.studentId}-${balance.trainingTypeName}`}>
                <span>
                  {balance.fullName}
                  <small>{balance.memberNumber}</small>
                </span>
                <span>{balance.trainingTypeName}</span>
                <span>{balance.purchasedCredits}</span>
                <span>{balance.usedCredits}</span>
                <span className={balance.availableCredits < 0 ? "negative-balance" : ""}>{balance.availableCredits}</span>
                <span className={balance.canBook ? "status active" : "status inactive"}>
                  {balance.canBook ? "Pode marcar" : "Sem margem"}
                </span>
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
                <span>Creditos</span>
                <strong>{paymentStats.credits}</strong>
              </div>
              <div className="stat-card">
                <span>Total utente</span>
                <strong>{formatCurrency(paymentStats.totalClient)}</strong>
              </div>
              <div className="stat-card">
                <span>Total professor</span>
                <strong>{formatCurrency(paymentStats.totalTeacher)}</strong>
              </div>
            </div>

            <div className="payments-table">
              <div className="payments-header">
                <span>Data</span>
                <span>Professor</span>
                <span>Utente</span>
                <span>Tipo</span>
                <span>Qtd.</span>
                <span>Creditos</span>
                <span>Total utente</span>
                <span>Total professor</span>
              </div>
              {payments.length === 0 ? <p className="muted">Nao existem pagamentos neste ciclo.</p> : null}
              {payments.map((payment) => (
                <div className="payments-row" key={payment.id}>
                  <span>{payment.createdAt.toLocaleDateString("pt-PT")}</span>
                  <span>{payment.teacher.name}</span>
                  <span>
                    {payment.student.fullName}
                    <small>{payment.student.memberNumber}</small>
                  </span>
                  <span>{payment.paymentType.description}</span>
                  <span>{payment.quantity}</span>
                  <span>{payment.totalCredits}</span>
                  <span>{formatCurrency(payment.totalPrice)}</span>
                  <span>{formatCurrency(payment.teacherTotal)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
