import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { dateToInputValue, formatMinutes, getPoolMapByKey, parseDateParam, poolBlockAppliesToDate } from "@/lib/pool";
import { prisma } from "@/lib/prisma";

function statusLabel(status: string) {
  if (status === "approved") return "Aprovado";
  if (status === "rejected") return "Rejeitado";
  if (status === "cancelled") return "Cancelado";
  return "Pendente";
}

function statusClass(status: string) {
  if (status === "approved") return "status active";
  if (status === "rejected") return "status inactive";
  if (status === "cancelled") return "status inactive";
  return "status pending";
}

function formatDate(date: Date) {
  return date.toLocaleDateString("pt-PT");
}

function classLabel(block: { poolKey: string; laneNumber: number }) {
  const poolMap = getPoolMapByKey(block.poolKey);
  const lane = poolMap.lanes.find((item) => item.number === block.laneNumber);
  return `${poolMap.eyebrow} · ${lane?.label || `${poolMap.laneFieldLabel} ${block.laneNumber}`}`;
}

export default async function SubstitutionsPage({
  searchParams
}: {
  searchParams: Promise<{ date?: string; error?: string; success?: string; teacherId?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);
  const isAdmin = hasRole(user, "admin");
  const isProfessor = hasRole(user, "professor");

  if (!isAdmin && !isProfessor) {
    redirect("/dashboard");
  }

  const selectedDate = parseDateParam(params.date);
  const selectedDateValue = dateToInputValue(selectedDate);
  const weekday = selectedDate.getDay();
  const teachers = await prisma.user.findMany({
    where: {
      active: true,
      roles: { some: { role: { key: "professor" } } }
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  });
  const selectedTeacherId = isAdmin ? params.teacherId || teachers[0]?.id || user.id : user.id;
  const substituteTeachers = teachers.filter((teacher) => teacher.id !== selectedTeacherId);

  const [rawBlocks, substitutions] = await Promise.all([
    prisma.poolScheduleBlock.findMany({
      where: {
        active: true,
        teacherId: selectedTeacherId,
        type: "aula",
        weekday
      },
      orderBy: [{ startMinutes: "asc" }, { poolKey: "asc" }, { laneNumber: "asc" }]
    }),
    prisma.groupClassSubstitutionRequest.findMany({
      where: isAdmin
        ? { substitutionDate: { gte: new Date(`${selectedDateValue}T00:00:00`) } }
        : {
            substitutionDate: { gte: new Date(`${selectedDateValue}T00:00:00`) },
            OR: [{ absentTeacherId: user.id }, { items: { some: { substituteTeacherId: user.id } } }]
          },
      include: {
        absentTeacher: { select: { name: true } },
        items: { include: { substituteTeacher: { select: { name: true } } }, orderBy: { startMinutes: "asc" } }
      },
      orderBy: [{ substitutionDate: "asc" }, { createdAt: "desc" }],
      take: 40
    })
  ]);

  const blocks = rawBlocks.filter((block) => poolBlockAppliesToDate(block, selectedDate));

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel substitutions-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Aulas de grupo</p>
            <h1>Substituições</h1>
            <p className="muted">Cria pedidos de substituição para aulas de grupo e acompanha as próximas substituições.</p>
          </div>
          <span className="status active">{substitutions.length} registos</span>
        </div>

        {params.success ? <p className="success">Pedido de substituição registado.</p> : null}
        {params.error ? (
          <p className="error">Não foi possível criar o pedido. Confirma as aulas, substitutos e a opção de acumulação.</p>
        ) : null}

        <form className="substitution-filter" method="get" action="/substituicoes">
          <div className="field">
            <label htmlFor="date">Dia da falta</label>
            <input id="date" name="date" type="date" defaultValue={selectedDateValue} />
          </div>
          {isAdmin ? (
            <div className="field">
              <label htmlFor="teacherId">Professor em falta</label>
              <select id="teacherId" name="teacherId" defaultValue={selectedTeacherId}>
                {teachers.map((teacher) => (
                  <option value={teacher.id} key={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button className="button secondary" type="submit">
            Ver aulas
          </button>
        </form>

        <form className="substitution-create" action="/api/group-class-substitutions" method="post">
          <input type="hidden" name="date" value={selectedDateValue} />
          <input type="hidden" name="teacherId" value={selectedTeacherId} />
          <div className="substitution-list-header">
            <h2>Aulas de {formatDate(selectedDate)}</h2>
            <p className="muted">Seleciona as aulas a substituir e define o professor substituto em cada uma.</p>
          </div>

          {blocks.length === 0 ? <p className="muted">Sem aulas para este professor neste dia.</p> : null}
          {blocks.map((block) => (
            <div className="substitution-class-row" key={block.id}>
              <label className="checkbox compact-checkbox">
                <input type="checkbox" name="poolBlockId" value={block.id} />
                Selecionar
              </label>
              <div className="substitution-class-main">
                <strong>
                  {formatMinutes(block.startMinutes)} - {formatMinutes(block.endMinutes)} · {block.title}
                </strong>
                <span>{classLabel(block)}</span>
                {block.notes ? <small>{block.notes}</small> : null}
              </div>
              <div className="field">
                <label htmlFor={`substituteTeacherId_${block.id}`}>Substituto</label>
                <select id={`substituteTeacherId_${block.id}`} name={`substituteTeacherId_${block.id}`} defaultValue="">
                  <option value="">Selecionar professor</option>
                  {substituteTeachers.map((teacher) => (
                    <option value={teacher.id} key={teacher.id}>
                      {teacher.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="checkbox compact-checkbox">
                <input type="checkbox" name={`accumulation_${block.id}`} />
                Acumulação
              </label>
            </div>
          ))}

          <button className="button" type="submit" disabled={blocks.length === 0}>
            Criar pedido
          </button>
        </form>

        <div className="substitution-list-header">
          <h2>Próximas substituições</h2>
          <p className="muted">Pedidos do dia selecionado em diante. Os pedidos antigos ficam guardados na base de dados.</p>
        </div>
        <div className="substitution-request-list">
          {substitutions.length === 0 ? <p className="muted">Sem substituições futuras registadas.</p> : null}
          {substitutions.map((request) => {
            const canCancel = request.status !== "cancelled" && (isAdmin || request.absentTeacherId === user.id);

            return (
            <article className="substitution-request-card" key={request.id}>
              <div className="substitution-request-head">
                <div>
                  <strong>
                    {formatDate(request.substitutionDate)} · {request.absentTeacher.name}
                  </strong>
                  <span>{request.items.length} aula(s)</span>
                </div>
                <div className="substitution-request-actions">
                  <span className={statusClass(request.status)}>{statusLabel(request.status)}</span>
                  {canCancel ? (
                    <form action="/api/group-class-substitutions/cancel" method="post">
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="date" value={selectedDateValue} />
                      <input type="hidden" name="teacherId" value={selectedTeacherId} />
                      <button className="button danger compact-button" type="submit">
                        Cancelar
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
              <div className="substitution-request-items">
                {request.items.map((item) => (
                  <div className="substitution-request-item" key={item.id}>
                    <span>
                      {formatMinutes(item.startMinutes)} - {formatMinutes(item.endMinutes)} · {item.title}
                    </span>
                    <strong>{item.substituteTeacher.name}</strong>
                    <small>
                      {classLabel(item)}
                      {item.accumulation ? " · Acumulação" : ""}
                    </small>
                  </div>
                ))}
              </div>
            </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
