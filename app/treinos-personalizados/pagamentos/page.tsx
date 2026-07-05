import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import { currentBillingMonthValue, formatBillingPeriod, getBillingCycleLabel, getBillingPeriod } from "@/lib/billingCycles";
import { decimalToNumber, formatCurrency } from "@/lib/money";
import { getCreditBalancesForTeacher } from "@/lib/personalTrainingCredits";
import { getTrainingTypeName } from "@/lib/personalTrainingRules";
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
    tab?: string;
    month?: string;
    globalMonth?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);
  const isAdmin = roleKeys.includes("admin");
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
  const selectedGlobalMonth = params.globalMonth || currentBillingMonthValue();
  const activeTab = isAdmin && params.tab === "global" ? "global" : params.tab === "payments" ? "payments" : "credits";
  const billingPeriod = getBillingPeriod(selectedBillingCycle, selectedMonth);
  const globalPeriod = getAdminGlobalPeriod(selectedGlobalMonth);

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

  const [paymentTypes, teacherStudents, payments, creditBalances, globalPayments] = await Promise.all([
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
      : Promise.resolve([])
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
  const trainingTypeStats = Array.from(
    payments.reduce((map, payment) => {
      const typeName = getTrainingTypeName(payment.paymentType.description);
      const current = map.get(typeName) || { typeName, quantity: 0 };
      current.quantity += payment.quantity;
      map.set(typeName, current);
      return map;
    }, new Map<string, { typeName: string; quantity: number }>())
  )
    .map(([, value]) => value)
    .sort((a, b) => b.quantity - a.quantity || a.typeName.localeCompare(b.typeName));
  const maxTrainingTypeQuantity = Math.max(...trainingTypeStats.map((item) => item.quantity), 0);
  const globalStats = globalPayments.reduce(
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
    globalPayments.reduce((map, payment) => {
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
  const maxGlobalTeacherTotal = Math.max(...globalTeacherStats.map((teacher) => teacher.totalTeacher), 0);

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
              <input type="hidden" name="globalMonth" value={selectedGlobalMonth} />
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
          {isAdmin ? (
            <a className={activeTab === "global" ? "tab active" : "tab"} href={tabHref("global")}>
              Totais gerais
            </a>
          ) : null}
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
                <p className="muted">Quantidade paga por tipo de treino no periodo selecionado.</p>
              </div>
              <div className="bar-chart">
                {trainingTypeStats.length === 0 ? <p className="muted">Sem dados para apresentar.</p> : null}
                {trainingTypeStats.map((item) => (
                  <div className="bar-row" key={item.typeName}>
                    <span title={item.typeName}>{item.typeName}</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${maxTrainingTypeQuantity ? Math.max(8, (item.quantity / maxTrainingTypeQuantity) * 100) : 0}%` }}
                      />
                    </div>
                    <strong>{item.quantity}</strong>
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
              <div className={isAdmin ? "payments-header" : "payments-header teacher-values"}>
                <span>Data</span>
                {isAdmin ? <span>Professor</span> : null}
                <span>Utente</span>
                <span>Lancado por</span>
                <span>Tipo</span>
                <span>Qtd.</span>
                <span>Creditos</span>
                {isAdmin ? <span>Total utente</span> : null}
                <span>Total professor</span>
              </div>
              {payments.length === 0 ? <p className="muted">Nao existem pagamentos neste ciclo.</p> : null}
              {payments.map((payment) => (
                <div className={isAdmin ? "payments-row" : "payments-row teacher-values"} key={payment.id}>
                  <span>{payment.createdAt.toLocaleDateString("pt-PT")}</span>
                  {isAdmin ? <span>{payment.teacher.name}</span> : null}
                  <span>
                    {payment.student.fullName}
                    <small>{payment.student.memberNumber}</small>
                  </span>
                  <span>{payment.createdBy?.name || "-"}</span>
                  <span>{payment.paymentType.description}</span>
                  <span>{payment.quantity}</span>
                  <span>{payment.totalCredits}</span>
                  {isAdmin ? <span>{formatCurrency(payment.totalPrice)}</span> : null}
                  <span>{formatCurrency(payment.teacherTotal)}</span>
                </div>
              ))}
            </div>
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
                <span>Creditos</span>
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
                <h2>Total por professor</h2>
                <p className="muted">Valor total a pagar a cada professor no periodo selecionado.</p>
              </div>
              <div className="bar-chart">
                {globalTeacherStats.length === 0 ? <p className="muted">Sem dados para apresentar.</p> : null}
                {globalTeacherStats.map((teacher) => (
                  <div className="bar-row global-bar-row" key={teacher.teacherName}>
                    <span title={teacher.teacherName}>{teacher.teacherName}</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${
                            maxGlobalTeacherTotal ? Math.max(8, (teacher.totalTeacher / maxGlobalTeacherTotal) * 100) : 0
                          }%`
                        }}
                      />
                    </div>
                    <strong>{formatCurrency(teacher.totalTeacher)}</strong>
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
              {globalTeacherStats.length === 0 ? <p className="muted">Nao existem pagamentos neste periodo.</p> : null}
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
