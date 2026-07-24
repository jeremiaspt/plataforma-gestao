import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BirthdayMonitorSelectGuard } from "@/components/BirthdayMonitorSelectGuard";
import { BirthdayPartyDialog } from "@/components/BirthdayPartyDialog";
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
  searchParams: Promise<{ error?: string; maintenance?: string; message?: string; month?: string; success?: string; tab?: string }>;
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
  const activeTab = params.tab === "upcoming" || params.tab === "history" ? params.tab : "map";
  const period = monthPeriod(selectedMonth);
  const weekendDates = weekendDatesForMonth(selectedMonth);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const partyInclude = {
    monitors: { include: { teacher: { select: { id: true, name: true } } }, orderBy: { teacher: { name: "asc" as const } } },
    paymentLogs: { orderBy: { createdAt: "desc" as const }, take: 5 },
    receptionist: { select: { id: true, name: true } }
  };
  const [parties, upcomingParties, historyParties, teachers, receptionists] = await Promise.all([
    prisma.birthdayParty.findMany({
      where: { partyDate: { gte: period.start, lt: period.endExclusive } },
      include: partyInclude,
      orderBy: [{ partyDate: "asc" }, { startMinutes: "asc" }]
    }),
    prisma.birthdayParty.findMany({
      where: { partyDate: { gte: today } },
      include: partyInclude,
      orderBy: [{ partyDate: "asc" }, { startMinutes: "asc" }]
    }),
    prisma.birthdayParty.findMany({
      where: { partyDate: { lt: today } },
      include: partyInclude,
      orderBy: [{ partyDate: "desc" }, { startMinutes: "desc" }]
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
  const tabHref = (tab: "map" | "upcoming" | "history") => `/festas-aniversario?tab=${tab}&month=${selectedMonth}`;
  const activePartyCount = activeTab === "upcoming" ? upcomingParties.length : activeTab === "history" ? historyParties.length : parties.length;
  const renderPartyDialog = (party: (typeof parties)[number], dialogId: string) => {
    const slot = birthdayPartySlots.find((birthdaySlot) => birthdaySlot.key === party.slotKey);
    const selectedMonitorIds = new Set(party.monitors.map((monitor) => monitor.teacherId));

    return (
      <dialog className="birthday-dialog" id={dialogId}>
        <div className="birthday-dialog-head">
          <div>
            <small>
              {formatDateLabel(party.partyDate)} - {slot?.label || ""}
            </small>
            <strong>{party.responsibleName}</strong>
          </div>
          <button className="button secondary compact-button" data-close-birthday-dialog type="button">
            Fechar
          </button>
        </div>
        <div className="birthday-detail-popover">
          <div className="birthday-slot-head">
            <strong>{paymentStatusLabel(party.paymentStatus)}</strong>
            <span className={party.paymentStatus === "paid" ? "status active" : "status inactive"}>{slot?.label || ""}</span>
          </div>
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
            <input type="hidden" name="tab" value={activeTab} />
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
              <input type="hidden" name="tab" value={activeTab} />
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
                <label data-birthday-child-count-label>
                  Criancas ({requiredBirthdayMonitors(party.ageGroup, party.childCount)} monitores necessarios)
                </label>
                <input name="childCount" min="1" type="number" defaultValue={party.childCount} required />
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
                  {log.createdAt.toLocaleString("pt-PT")} -{" "}
                  <span className={log.previousStatus === "paid" ? "birthday-log-status paid" : "birthday-log-status not-paid"}>
                    {paymentStatusLabel(log.previousStatus)}
                  </span>{" "}
                  para{" "}
                  <span className={log.newStatus === "paid" ? "birthday-log-status paid" : "birthday-log-status not-paid"}>
                    {paymentStatusLabel(log.newStatus)}
                  </span>{" "}
                  por {log.changedByName}
                </small>
              ))}
            </div>
          ) : null}
        </div>
      </dialog>
    );
  };

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <BirthdayMonitorSelectGuard />
      <BirthdayPartyDialog />
      <section className="panel birthday-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Festas Aniversario</p>
            <h1>Mapa de festas</h1>
            <p className="muted">Sabados e domingos com horarios disponiveis entre as 15:00 e as 19:30.</p>
          </div>
          <span className="status active">{activePartyCount} festas</span>
        </div>

        {params.success ? <p className="success">Operacao guardada.</p> : null}
        {params.error ? <p className="error">{params.message || "Nao foi possivel guardar a operacao."}</p> : null}
        {params.maintenance ? <p className="error">A plataforma esta em manutencao. Apenas administradores podem alterar registos.</p> : null}

        <div className="tabs">
          <a className={activeTab === "map" ? "tab active" : "tab"} href={tabHref("map")}>
            Mapa do mes
          </a>
          <a className={activeTab === "upcoming" ? "tab active" : "tab"} href={tabHref("upcoming")}>
            Proximas festas
          </a>
          <a className={activeTab === "history" ? "tab active" : "tab"} href={tabHref("history")}>
            Historico
          </a>
        </div>

        {activeTab === "map" ? (
          <form className="birthday-filter" method="get" action="/festas-aniversario">
          <input type="hidden" name="tab" value="map" />
          <div className="field">
            <label htmlFor="month">Mes</label>
            <input id="month" name="month" type="month" defaultValue={selectedMonth} />
          </div>
          <button className="button secondary" type="submit">
            Ver mes
          </button>
          </form>
        ) : null}

        {activeTab === "map" && isAdmin ? (
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
              <label htmlFor="childCount" data-birthday-child-count-label>
                Crianças (2 monitores necessários)
              </label>
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

        {activeTab === "map" ? (
          <>
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
                  const selectedMonitorIds = new Set(party?.monitors.map((monitor) => monitor.teacherId) || []);

                  return party ? (
                    <div className={party.paymentStatus === "paid" ? "birthday-overview-slot occupied paid" : "birthday-overview-slot occupied not-paid"} key={slot.key}>
                      <button className="birthday-overview-button" data-open-birthday-dialog={`birthday-dialog-${party.id}`} type="button">
                        <small>{slot.label}</small>
                        <strong>{party.responsibleName}</strong>
                        <span>{party.childCount} crianças</span>
                        <span>{party.receptionist?.name || "Sem recepcionista"}</span>
                        <span>{party.monitors.map((monitor) => monitor.teacher.name).join(", ") || "Sem monitores"}</span>
                      </button>
                      <dialog className="birthday-dialog" id={`birthday-dialog-${party.id}`}>
                        <div className="birthday-dialog-head">
                          <div>
                            <small>{formatDateLabel(party.partyDate)} - {slot.label}</small>
                            <strong>{party.responsibleName}</strong>
                          </div>
                          <button className="button secondary compact-button" data-close-birthday-dialog type="button">
                            Fechar
                          </button>
                        </div>
                        <div className="birthday-detail-popover">
                        <div className="birthday-slot-head">
                          <strong>{paymentStatusLabel(party.paymentStatus)}</strong>
                          <span className={party.paymentStatus === "paid" ? "status active" : "status inactive"}>{slot.label}</span>
                        </div>
                          <>
                            <div className="birthday-summary">
                              <span>{party.responsibleName}</span>
                              <small>{party.responsibleContact} - {party.responsibleEmail}</small>
                              <small>
                                {ageGroupLabel(party.ageGroup)} - {party.childCount} crianças - {party.monitorRequirement} monitores
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
                                  <label data-birthday-child-count-label>
                                    Crianças ({requiredBirthdayMonitors(party.ageGroup, party.childCount)} monitores necessários)
                                  </label>
                                  <input name="childCount" min="1" type="number" defaultValue={party.childCount} required />
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
                                    {log.createdAt.toLocaleString("pt-PT")} -{" "}
                                    <span className={log.previousStatus === "paid" ? "birthday-log-status paid" : "birthday-log-status not-paid"}>
                                      {paymentStatusLabel(log.previousStatus)}
                                    </span>{" "}
                                    para{" "}
                                    <span className={log.newStatus === "paid" ? "birthday-log-status paid" : "birthday-log-status not-paid"}>
                                      {paymentStatusLabel(log.newStatus)}
                                    </span>{" "}
                                    por {log.changedByName}
                                  </small>
                                ))}
                              </div>
                            ) : null}
                          </>
                        </div>
                      </dialog>
                    </div>
                  ) : (
                    <div className="birthday-overview-slot" key={slot.key}>
                      <small>{slot.label}</small>
                      Livre
                    </div>
                  );
                  })}
              </div>
            );
          })}
        </div>
          </>
        ) : null}

        {activeTab === "upcoming" ? (
          <div className="birthday-list">
            {upcomingParties.length === 0 ? <p className="muted">Nao existem proximas festas registadas.</p> : null}
            {upcomingParties.map((party) => (
              <div className={party.paymentStatus === "paid" ? "birthday-list-row paid" : "birthday-list-row not-paid"} key={party.id}>
                <button className="birthday-list-button" data-open-birthday-dialog={`birthday-upcoming-dialog-${party.id}`} type="button">
                  <div>
                    <strong>{formatDateLabel(party.partyDate)} - {birthdayPartySlots.find((slot) => slot.key === party.slotKey)?.label}</strong>
                    <span>{party.responsibleName}</span>
                  </div>
                  <span>{party.childCount} criancas</span>
                  <span>{party.receptionist?.name || "Sem recepcionista"}</span>
                  <span>{party.monitors.map((monitor) => monitor.teacher.name).join(", ") || "Sem monitores"}</span>
                  <span className={party.paymentStatus === "paid" ? "status active" : "status inactive"}>{paymentStatusLabel(party.paymentStatus)}</span>
                </button>
                {renderPartyDialog(party, `birthday-upcoming-dialog-${party.id}`)}
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "history" ? (
          <div className="birthday-list">
            {historyParties.length === 0 ? <p className="muted">Ainda nao existem festas antigas registadas.</p> : null}
            {historyParties.map((party) => (
              <div className={party.paymentStatus === "paid" ? "birthday-list-row paid" : "birthday-list-row not-paid"} key={party.id}>
                <button className="birthday-list-button" data-open-birthday-dialog={`birthday-history-dialog-${party.id}`} type="button">
                  <div>
                    <strong>{formatDateLabel(party.partyDate)} - {birthdayPartySlots.find((slot) => slot.key === party.slotKey)?.label}</strong>
                    <span>{party.responsibleName}</span>
                  </div>
                  <span>{party.childCount} criancas</span>
                  <span>{party.receptionist?.name || "Sem recepcionista"}</span>
                  <span>{party.monitors.map((monitor) => monitor.teacher.name).join(", ") || "Sem monitores"}</span>
                  <span className={party.paymentStatus === "paid" ? "status active" : "status inactive"}>{paymentStatusLabel(party.paymentStatus)}</span>
                </button>
                {renderPartyDialog(party, `birthday-history-dialog-${party.id}`)}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
