import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { dateToInputValue, formatMinutes, getPoolMapByKey, parseDateParam, poolBlockAppliesToDate } from "@/lib/pool";
import { prisma } from "@/lib/prisma";

const statusOptions = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendentes" },
  { value: "approved", label: "Aprovadas" },
  { value: "rejected", label: "Rejeitadas" },
  { value: "cancelled", label: "Canceladas" }
];

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

function itemStatusText(status: string) {
  if (status === "approved") return "Aceite";
  if (status === "rejected") return "Rejeitada";
  if (status === "cancelled") return "Cancelada";
  return "Pendente";
}

function formatDate(date: Date) {
  return date.toLocaleDateString("pt-PT");
}

function decodeValidation(value?: string) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => ({
        label: String(item?.label || ""),
        message: String(item?.message || ""),
        status: item?.status === "ok" ? "ok" : "error"
      }))
      .filter((item) => item.label && item.message);
  } catch {
    return [];
  }
}

function classLabel(block: { poolKey: string; laneNumber: number }) {
  const poolMap = getPoolMapByKey(block.poolKey);
  const lane = poolMap.lanes.find((item) => item.number === block.laneNumber);
  return `${poolMap.eyebrow} · ${lane?.label || `${poolMap.laneFieldLabel} ${block.laneNumber}`}`;
}

function tabHref(tab: string, date: string, teacherId: string, status: string, isAdmin: boolean) {
  const params = new URLSearchParams({ tab, date, status });

  if (isAdmin && teacherId) {
    params.set("teacherId", teacherId);
  }

  return `/substituicoes?${params.toString()}`;
}

export default async function SubstitutionsPage({
  searchParams
}: {
  searchParams: Promise<{ date?: string; error?: string; success?: string; tab?: string; teacherId?: string; status?: string; validation?: string }>;
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
  const todayValue = dateToInputValue(new Date());
  const selectedDateStart = new Date(`${selectedDateValue}T00:00:00`);
  const todayStart = new Date(`${todayValue}T00:00:00`);
  const activeTab = params.tab === "geral" || params.tab === "historico" ? params.tab : "gerir";
  const statusFilter = statusOptions.some((option) => option.value === params.status) ? params.status || "all" : "all";
  const validationMessages = decodeValidation(params.validation);
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
  const filterTeacherId = isAdmin ? params.teacherId || "all" : user.id;
  const substituteTeachers = teachers.filter((teacher) => teacher.id !== selectedTeacherId);
  const visibleStatusWhere = statusFilter === "all" ? {} : { status: statusFilter };
  const userScopeWhere = isAdmin
    ? {}
    : {
        OR: [{ absentTeacherId: user.id }, { items: { some: { substituteTeacherId: user.id } } }]
      };
  const adminTeacherWhere = isAdmin && filterTeacherId !== "all" ? { absentTeacherId: filterTeacherId } : {};

  const [rawBlocks, managedSubstitutions, allFutureSubstitutions, historicalSubstitutions] = await Promise.all([
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
      where: {
        ...userScopeWhere,
        ...(isAdmin ? { absentTeacherId: selectedTeacherId } : {}),
        ...visibleStatusWhere,
        substitutionDate: { gte: selectedDateStart }
      },
      include: {
        absentTeacher: { select: { name: true } },
        requestedBy: { select: { name: true } },
        items: { include: { substituteTeacher: { select: { name: true } } }, orderBy: { startMinutes: "asc" } }
      },
      orderBy: [{ substitutionDate: "asc" }, { createdAt: "desc" }],
      take: 80
    }),
    prisma.groupClassSubstitutionRequest.findMany({
      where: {
        ...adminTeacherWhere,
        ...visibleStatusWhere,
        substitutionDate: { gte: todayStart },
        ...(statusFilter === "all" ? { status: { not: "cancelled" } } : {})
      },
      include: {
        absentTeacher: { select: { name: true } },
        requestedBy: { select: { name: true } },
        items: { include: { substituteTeacher: { select: { name: true } } }, orderBy: { startMinutes: "asc" } }
      },
      orderBy: [{ substitutionDate: "asc" }, { createdAt: "desc" }],
      take: 100
    }),
    prisma.groupClassSubstitutionRequest.findMany({
      where: {
        ...userScopeWhere,
        ...adminTeacherWhere,
        ...visibleStatusWhere,
        OR:
          statusFilter === "all"
            ? [{ substitutionDate: { lt: todayStart } }, { status: { in: ["cancelled", "rejected"] } }]
            : [{ substitutionDate: { lt: todayStart } }, { status: statusFilter }]
      },
      include: {
        absentTeacher: { select: { name: true } },
        requestedBy: { select: { name: true } },
        items: { include: { substituteTeacher: { select: { name: true } } }, orderBy: { startMinutes: "asc" } }
      },
      orderBy: [{ substitutionDate: "desc" }, { createdAt: "desc" }],
      take: 120
    })
  ]);

  const blocks = rawBlocks.filter((block) => poolBlockAppliesToDate(block, selectedDate));
  const currentList =
    activeTab === "geral" ? allFutureSubstitutions : activeTab === "historico" ? historicalSubstitutions : managedSubstitutions;
  const currentCount = currentList.length;

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel substitutions-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Aulas de grupo</p>
            <h1>Substituições</h1>
            <p className="muted">Cria pedidos de substituição, acompanha respostas e consulta o histórico.</p>
          </div>
          <span className="status active">{currentCount} registos</span>
        </div>

        {params.success ? <p className="success">Operação registada.</p> : null}
        {params.error ? <p className="error">Não foi possível concluir a operação. Confirma os dados e tenta novamente.</p> : null}
        {validationMessages.length > 0 ? (
          <div className="validation-panel">
            <strong>Validação do pedido</strong>
            {validationMessages.map((message, index) => (
              <div className={message.status === "ok" ? "validation-row ok" : "validation-row error"} key={`${message.label}-${index}`}>
                <span>{message.status === "ok" ? "OK" : "Erro"}</span>
                <div>
                  <strong>{message.label}</strong>
                  <p>{message.message}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="tabs">
          <a className={activeTab === "gerir" ? "tab active" : "tab"} href={tabHref("gerir", selectedDateValue, selectedTeacherId, statusFilter, isAdmin)}>
            Gerir substituições
          </a>
          <a className={activeTab === "geral" ? "tab active" : "tab"} href={tabHref("geral", selectedDateValue, filterTeacherId, statusFilter, isAdmin)}>
            Visão geral
          </a>
          <a
            className={activeTab === "historico" ? "tab active" : "tab"}
            href={tabHref("historico", selectedDateValue, filterTeacherId, statusFilter, isAdmin)}
          >
            Histórico
          </a>
        </div>

        <form className="substitution-filter" method="get" action="/substituicoes">
          <input type="hidden" name="tab" value={activeTab} />
          <div className="field">
            <label htmlFor="date">{activeTab === "historico" ? "Data de referência" : "Dia da falta"}</label>
            <input id="date" name="date" type="date" defaultValue={selectedDateValue} />
          </div>
          {isAdmin ? (
            <div className="field">
              <label htmlFor="teacherId">{activeTab === "gerir" ? "Professor em falta" : "Professor"}</label>
              <select id="teacherId" name="teacherId" defaultValue={activeTab === "gerir" ? selectedTeacherId : filterTeacherId}>
                {activeTab !== "gerir" ? <option value="all">Todos os professores</option> : null}
                {teachers.map((teacher) => (
                  <option value={teacher.id} key={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="status">Estado</label>
            <select id="status" name="status" defaultValue={statusFilter}>
              {statusOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button className="button secondary" type="submit">
            Filtrar
          </button>
        </form>

        {activeTab === "gerir" ? (
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
        ) : null}

        <div className="substitution-list-header">
          <h2>{activeTab === "geral" ? "Futuras substituições" : activeTab === "historico" ? "Histórico de substituições" : "Pedidos"}</h2>
          <p className="muted">
            {activeTab === "geral"
              ? "Mostra quem está previsto substituir aulas nos dias atuais e futuros."
              : activeTab === "historico"
                ? "Registos antigos, rejeitados e cancelados ficam disponíveis para consulta."
                : "Pedidos do dia selecionado em diante, filtrados pelo estado escolhido."}
          </p>
        </div>

        <div className="substitution-request-list">
          {currentList.length === 0 ? <p className="muted">Sem substituições registadas para estes filtros.</p> : null}
          {currentList.map((request) => {
            const canCancel = request.status !== "cancelled" && activeTab !== "historico" && (isAdmin || request.absentTeacherId === user.id);

            return (
              <article className="substitution-request-card" key={request.id}>
                <div className="substitution-request-head">
                  <div>
                    <strong>
                      {formatDate(request.substitutionDate)} · Falta: {request.absentTeacher.name}
                    </strong>
                    <span>
                      {request.items.length} aula(s)
                      {request.requestedBy ? ` · Pedido por ${request.requestedBy.name}` : ""}
                    </span>
                  </div>
                  <div className="substitution-request-actions">
                    <span className={statusClass(request.status)}>{statusLabel(request.status)}</span>
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
                      <div className="substitution-item-actions">
                        <span className={statusClass(item.status)}>{itemStatusText(item.status)}</span>
                        {item.status === "pending" && item.substituteTeacherId === user.id ? (
                          <>
                            <form action="/api/group-class-substitutions/respond" method="post">
                              <input type="hidden" name="itemId" value={item.id} />
                              <input type="hidden" name="action" value="approved" />
                              <input type="hidden" name="date" value={selectedDateValue} />
                              <button className="button compact-button" type="submit">
                                Aceitar
                              </button>
                            </form>
                            <form action="/api/group-class-substitutions/respond" method="post">
                              <input type="hidden" name="itemId" value={item.id} />
                              <input type="hidden" name="action" value="rejected" />
                              <input type="hidden" name="date" value={selectedDateValue} />
                              <button className="button danger compact-button" type="submit">
                                Rejeitar
                              </button>
                            </form>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                {request.status === "cancelled" ? (
                  <div className="substitution-cancel-note">
                    <strong>Cancelado por {request.cancelledByName || "utilizador"}</strong>
                    <span>
                      {request.cancelledAt ? `${request.cancelledAt.toLocaleString("pt-PT")} · ` : ""}
                      {request.cancelReason || "Sem motivo registado."}
                    </span>
                  </div>
                ) : null}

                {canCancel ? (
                  <form className="substitution-cancel-form" action="/api/group-class-substitutions/cancel" method="post">
                    <input type="hidden" name="requestId" value={request.id} />
                    <input type="hidden" name="date" value={selectedDateValue} />
                    <input type="hidden" name="teacherId" value={activeTab === "gerir" ? selectedTeacherId : filterTeacherId} />
                    <input type="hidden" name="tab" value={activeTab} />
                    <input type="hidden" name="status" value={statusFilter} />
                    <input name="reason" placeholder="Motivo do cancelamento" required />
                    <button className="button danger compact-button" type="submit">
                      Cancelar
                    </button>
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
