import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import {
  birthdayAgeGroups,
  birthdayPartySlots,
  currentMonthValue,
  dateInputValue,
  monthPeriod,
  paymentStatusLabel,
  requiredBirthdayMonitors,
  weekendDatesForMonth
} from "@/lib/birthdayParties";
import { prisma } from "@/lib/prisma";

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", weekday: "short" });
}

function ageGroupLabel(value: string) {
  return birthdayAgeGroups.find((group) => group.key === value)?.label || value;
}

export default async function BirthdayPartiesPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; maintenance?: string; message?: string; month?: string; success?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);
  const isAdmin = hasRole(user, "admin");
  const isReception = hasRole(user, "recepcao");

  if (!isAdmin && !isReception) {
    redirect("/dashboard");
  }

  const selectedMonth = params.month || currentMonthValue();
  const period = monthPeriod(selectedMonth);
  const weekendDates = weekendDatesForMonth(selectedMonth);
  const [parties, teachers, receptionists] = await Promise.all([
    prisma.birthdayParty.findMany({
      where: { partyDate: { gte: period.start, lt: period.endExclusive } },
      include: {
        monitors: { include: { teacher: { select: { id: true, name: true } } }, orderBy: { teacher: { name: "asc" } } },
        paymentLogs: { orderBy: { createdAt: "desc" }, take: 5 },
        receptionist: { select: { id: true, name: true } }
      },
      orderBy: [{ partyDate: "asc" }, { startMinutes: "asc" }]
    }),
    prisma.user.findMany({
      where: { active: true, roles: { some: { role: { key: "professor" } } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true }
    }),
    prisma.user.findMany({
      where: { active: true, roles: { some: { role: { key: "recepcao" } } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true }
    })
  ]);
  const partiesBySlot = new Map(parties.map((party) => [`${dateInputValue(party.partyDate)}:${party.slotKey}`, party]));

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel birthday-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Festas Aniversario</p>
            <h1>Mapa de festas</h1>
            <p className="muted">Sabados e domingos com horarios disponiveis entre as 15:00 e as 19:30.</p>
          </div>
          <span className="status active">{parties.length} festas</span>
        </div>

        {params.success ? <p className="success">Operacao guardada.</p> : null}
        {params.error ? <p className="error">{params.message || "Nao foi possivel guardar a operacao."}</p> : null}
        {params.maintenance ? <p className="error">A plataforma esta em manutencao. Apenas administradores podem alterar registos.</p> : null}

        <form className="birthday-filter" method="get" action="/festas-aniversario">
          <div className="field">
            <label htmlFor="month">Mes</label>
            <input id="month" name="month" type="month" defaultValue={selectedMonth} />
          </div>
          <button className="button secondary" type="submit">
            Ver mes
          </button>
        </form>

        {isAdmin ? (
          <form className="birthday-create-form" action="/api/birthday-parties" method="post">
            <input type="hidden" name="month" value={selectedMonth} />
            <div className="field">
              <label htmlFor="partyDate">Dia</label>
              <select id="partyDate" name="partyDate" required>
                <option value="">Selecionar dia</option>
                {weekendDates.map((date) => (
                  <option value={dateInputValue(date)} key={dateInputValue(date)}>
                    {formatDateLabel(date)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="slotKey">Horario</label>
              <select id="slotKey" name="slotKey" required>
                {birthdayPartySlots.map((slot) => (
                  <option value={slot.key} key={slot.key}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="responsibleName">Responsavel</label>
              <input id="responsibleName" name="responsibleName" required />
            </div>
            <div className="field">
              <label htmlFor="responsibleContact">Contacto</label>
              <input id="responsibleContact" name="responsibleContact" required />
            </div>
            <div className="field">
              <label htmlFor="responsibleEmail">Email</label>
              <input id="responsibleEmail" name="responsibleEmail" type="email" required />
            </div>
            <div className="field">
              <label htmlFor="ageGroup">Idades</label>
              <select id="ageGroup" name="ageGroup" required>
                {birthdayAgeGroups.map((group) => (
                  <option value={group.key} key={group.key}>
                    {group.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field compact-number-field">
              <label htmlFor="childCount">Criancas</label>
              <input id="childCount" name="childCount" min="1" type="number" required />
            </div>
            <div className="field">
              <label htmlFor="receptionistId">Recepcionista</label>
              <select id="receptionistId" name="receptionistId">
                <option value="">Por atribuir</option>
                {receptionists.map((receptionist) => (
                  <option value={receptionist.id} key={receptionist.id}>
                    {receptionist.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="birthday-monitor-selects">
              {[1, 2, 3].map((position) => (
                <div className="field" key={position}>
                  <label htmlFor={`monitor-${position}`}>Monitor {position}</label>
                  <select id={`monitor-${position}`} name="monitorId">
                    <option value="">Por atribuir</option>
                    {teachers.map((teacher) => (
                      <option value={teacher.id} key={teacher.id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button className="button" type="submit">
              Criar festa
            </button>
          </form>
        ) : null}

        <div className="birthday-month-head">
          <h2>{formatMonthLabel(period.start)}</h2>
          <p className="muted">Cada dia permite uma festa das 15:00 as 18:00 e outra das 16:30 as 19:30.</p>
        </div>

        <div className="birthday-overview-grid">
          {weekendDates.map((date) => {
            const dateValue = dateInputValue(date);

            return (
              <div className="birthday-overview-day" key={dateValue}>
                <strong>{formatDateLabel(date)}</strong>
                {birthdayPartySlots.map((slot) => {
                  const party = partiesBySlot.get(`${dateValue}:${slot.key}`);

                  return (
                    <span className={party ? "birthday-overview-slot occupied" : "birthday-overview-slot"} key={slot.key}>
                      <small>{slot.label}</small>
                      {party ? party.responsibleName : "Livre"}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="birthday-calendar">
          {weekendDates.map((date) => {
            const dateValue = dateInputValue(date);

            return (
              <div className="birthday-day-card" key={dateValue}>
                <div className="birthday-day-title">
                  <strong>{formatDateLabel(date)}</strong>
                  <span>{dateValue}</span>
                </div>
                <div className="birthday-slots">
                  {birthdayPartySlots.map((slot) => {
                    const party = partiesBySlot.get(`${dateValue}:${slot.key}`);
                    const selectedMonitorIds = new Set(party?.monitors.map((monitor) => monitor.teacherId) || []);

                    return (
                      <div className={party ? "birthday-slot occupied" : "birthday-slot"} key={slot.key}>
                        <div className="birthday-slot-head">
                          <strong>{slot.label}</strong>
                          <span className={party?.paymentStatus === "paid" ? "status active" : "status inactive"}>
                            {party ? paymentStatusLabel(party.paymentStatus) : "Livre"}
                          </span>
                        </div>

                        {party ? (
                          <>
                            <div className="birthday-summary">
                              <span>{party.responsibleName}</span>
                              <small>{party.responsibleContact} - {party.responsibleEmail}</small>
                              <small>
                                {ageGroupLabel(party.ageGroup)} - {party.childCount} criancas - {party.monitorRequirement} monitores
                              </small>
                              <small>Recepcionista: {party.receptionist?.name || "Por atribuir"}</small>
                              <small>Monitores: {party.monitors.map((monitor) => monitor.teacher.name).join(", ") || "Por atribuir"}</small>
                            </div>

                            <form className="birthday-payment-form" action={`/api/birthday-parties/${party.id}`} method="post">
                              <input type="hidden" name="month" value={selectedMonth} />
                              <input type="hidden" name="action" value="payment" />
                              <select name="paymentStatus" defaultValue={party.paymentStatus}>
                                <option value="not_paid">Nao Pago</option>
                                <option value="paid">Pago</option>
                              </select>
                              <button className="button secondary compact-button" type="submit">
                                Atualizar pagamento
                              </button>
                            </form>

                            {isAdmin ? (
                              <form className="birthday-edit-form" action={`/api/birthday-parties/${party.id}`} method="post">
                                <input type="hidden" name="month" value={selectedMonth} />
                                <div className="field">
                                  <label>Responsavel</label>
                                  <input name="responsibleName" defaultValue={party.responsibleName} required />
                                </div>
                                <div className="field">
                                  <label>Contacto</label>
                                  <input name="responsibleContact" defaultValue={party.responsibleContact} required />
                                </div>
                                <div className="field">
                                  <label>Email</label>
                                  <input name="responsibleEmail" type="email" defaultValue={party.responsibleEmail} required />
                                </div>
                                <div className="field">
                                  <label>Idades</label>
                                  <select name="ageGroup" defaultValue={party.ageGroup}>
                                    {birthdayAgeGroups.map((group) => (
                                      <option value={group.key} key={group.key}>
                                        {group.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="field compact-number-field">
                                  <label>Criancas</label>
                                  <input name="childCount" min="1" type="number" defaultValue={party.childCount} required />
                                  <small>{requiredBirthdayMonitors(party.ageGroup, party.childCount)} monitores</small>
                                </div>
                                <div className="field">
                                  <label>Recepcionista</label>
                                  <select name="receptionistId" defaultValue={party.receptionistId || ""}>
                                    <option value="">Por atribuir</option>
                                    {receptionists.map((receptionist) => (
                                      <option value={receptionist.id} key={receptionist.id}>
                                        {receptionist.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="birthday-monitor-selects compact">
                                  {[0, 1, 2].map((index) => (
                                    <div className="field" key={index}>
                                      <label>Monitor {index + 1}</label>
                                      <select name="monitorId" defaultValue={party.monitors[index]?.teacherId || ""}>
                                        <option value="">Por atribuir</option>
                                        {teachers.map((teacher) => (
                                          <option value={teacher.id} key={teacher.id} disabled={selectedMonitorIds.has(teacher.id) && party.monitors[index]?.teacherId !== teacher.id}>
                                            {teacher.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  ))}
                                </div>
                                <div className="action-row compact-actions">
                                  <button className="button secondary compact-button" name="action" value="save" type="submit">
                                    Guardar
                                  </button>
                                  <button className="button danger compact-button" name="action" value="delete" type="submit">
                                    Remover
                                  </button>
                                </div>
                              </form>
                            ) : null}

                            {party.paymentLogs.length > 0 ? (
                              <div className="birthday-log-list">
                                {party.paymentLogs.map((log) => (
                                  <small key={log.id}>
                                    {log.createdAt.toLocaleString("pt-PT")} - {paymentStatusLabel(log.previousStatus)} para {paymentStatusLabel(log.newStatus)} por {log.changedByName}
                                  </small>
                                ))}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <p className="muted">Sem festa marcada.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
