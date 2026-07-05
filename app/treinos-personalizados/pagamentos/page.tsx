import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { formatCurrency } from "@/lib/money";
import { getCreditBalancesForTeacher } from "@/lib/personalTrainingCredits";
import { prisma } from "@/lib/prisma";

export default async function PersonalTrainingPaymentsPage({
  searchParams
}: {
  searchParams: Promise<{ teacherId?: string; error?: string; success?: string }>;
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
      where: canCreate ? (selectedTeacherId ? { teacherId: selectedTeacherId } : {}) : { teacherId: user.id },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        teacher: { select: { name: true } },
        student: true,
        paymentType: true,
        createdBy: { select: { name: true } }
      }
    }),
    selectedTeacherId ? getCreditBalancesForTeacher(selectedTeacherId) : Promise.resolve([])
  ]);

  const selectedTeacher = teachers.find((teacher) => teacher.id === selectedTeacherId);

  return (
    <AppShell userName={user.name}>
      <section className="panel">
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
        {params.error ? <p className="error">Não foi possível lançar o pagamento. Confirma professor, aluno, tipo e quantidade.</p> : null}

        {canCreate ? (
          <>
            <form className="teacher-filter" method="get" action="/treinos-personalizados/pagamentos">
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
                      {student.fullName} · {student.memberNumber}
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
                      {type.description} · {type.credits} créditos · {formatCurrency(type.price)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="quantity">Quantidade</label>
                <input id="quantity" name="quantity" type="number" min="1" step="1" defaultValue="1" required />
              </div>
              <button className="button" type="submit" disabled={!selectedTeacherId || paymentTypes.length === 0}>
                Lançar pagamento
              </button>
            </form>
          </>
        ) : null}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="topbar">
          <div>
            <p className="eyebrow">Créditos</p>
            <h1>Saldos dos alunos</h1>
            <p className="muted">O saldo pode ir até -2 créditos para permitir marcações excecionais.</p>
          </div>
        </div>

        <div className="credits-table">
          <div className="credits-header">
            <span>Utente</span>
            <span>Tipo</span>
            <span>Comprados</span>
            <span>Usados</span>
            <span>Saldo</span>
            <span>Estado</span>
          </div>
          {creditBalances.length === 0 ? <p className="muted">Ainda não existem saldos para este professor.</p> : null}
          {creditBalances.map((balance) => (
            <div className="credits-row" key={balance.studentId}>
              <span>
                {balance.fullName}
                <small>{balance.memberNumber}</small>
              </span>
              <span>{balance.paymentTypeDescription}</span>
              <span>{balance.purchasedCredits}</span>
              <span>{balance.usedCredits}</span>
              <span className={balance.availableCredits < 0 ? "negative-balance" : ""}>{balance.availableCredits}</span>
              <span className={balance.canBook ? "status active" : "status inactive"}>
                {balance.canBook ? "Pode marcar" : "Sem margem"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="topbar">
          <div>
            <p className="eyebrow">Histórico</p>
            <h1>{selectedTeacher?.name || user.name}</h1>
          </div>
        </div>

        <div className="payments-table">
          <div className="payments-header">
            <span>Data</span>
            <span>Professor</span>
            <span>Utente</span>
            <span>Tipo</span>
            <span>Qtd.</span>
            <span>Créditos</span>
            <span>Total utente</span>
            <span>Total professor</span>
          </div>
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
      </section>
    </AppShell>
  );
}
