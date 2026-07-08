import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BookingModal } from "@/components/BookingModal";
import { PoolClassTeacherRequirement } from "@/components/PoolClassTeacherRequirement";
import { PoolCurrentTimeScroller } from "@/components/PoolCurrentTimeScroller";
import { hasRole, requireUser } from "@/lib/auth";
import { getCreditBalancesForTeacher } from "@/lib/personalTrainingCredits";
import {
  getTrainingTypeKey,
  getTrainingTypeName,
  paymentTypeMatchesDuration,
  trainingDurationOptions
} from "@/lib/personalTrainingRules";
import { prisma } from "@/lib/prisma";
import {
  addDays,
  buildTimeSlots,
  canAccessPoolMap,
  dateToInputValue,
  dateToWeekday,
  dayBounds,
  formatMinutes,
  isTodayOrFuture,
  parseDateParam,
  poolBlockTypes,
  poolLanes,
  poolWeekdays
} from "@/lib/pool";

export default async function PoolMapPage({
  searchParams
}: {
  searchParams: Promise<{ date?: string; error?: string; success?: string; bookingBlockId?: string; tab?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);
  const isAdmin = hasRole(user, "admin");
  const isProfessor = hasRole(user, "professor");

  if (!canAccessPoolMap(roleKeys)) {
    redirect("/dashboard");
  }

  const selectedDate = parseDateParam(params.date);
  const selectedDateValue = dateToInputValue(selectedDate);
  const weekday = dateToWeekday(selectedDate);
  const selectedDayLabel = poolWeekdays.find((day) => day.key === weekday)?.label || "Dia";
  const previousDate = dateToInputValue(addDays(selectedDate, -1));
  const nextDate = dateToInputValue(addDays(selectedDate, 1));
  const todayDate = dateToInputValue(new Date());
  const canBookSelectedDate = isTodayOrFuture(selectedDate);
  const isSelectedDateToday = selectedDateValue === dateToInputValue(new Date());
  const slots = buildTimeSlots(weekday);
  const bounds = dayBounds(weekday);
  const requestedTab = params.bookingBlockId ? "map" : params.tab;
  const activeTab =
    requestedTab === "my-bookings" && isProfessor
      ? "my-bookings"
      : requestedTab === "future-bookings" && isProfessor
        ? "future-bookings"
      : requestedTab === "weekly" && isAdmin
        ? "weekly"
        : requestedTab === "logs" && isAdmin
          ? "logs"
          : "map";
  const tabHref = (tab: "map" | "my-bookings" | "future-bookings" | "weekly" | "logs") =>
    `/piscina-25m?date=${selectedDateValue}&tab=${tab}`;

  const blocks = await prisma.poolScheduleBlock.findMany({
    where: { weekday, active: true },
    orderBy: [{ laneNumber: "asc" }, { startMinutes: "asc" }],
    include: {
      createdBy: { select: { name: true } },
      teacher: { select: { name: true } }
    }
  });

  const classTeachers = isAdmin
    ? await prisma.user.findMany({
        where: {
          active: true,
          roles: { some: { role: { key: "professor" } } }
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true }
      })
    : [];

  const bookings = await prisma.personalTrainingBooking.findMany({
    where: {
      bookingDate: new Date(`${selectedDateValue}T00:00:00`),
      status: { not: "cancelled" }
    },
    include: {
      teacher: { select: { name: true } },
      student: true,
      paymentType: true,
      poolBlock: true
    },
    orderBy: [{ startMinutes: "asc" }]
  });

  const bookingLogs = isAdmin
    ? await prisma.personalTrainingBookingLog.findMany({
        where: {
          bookingDate: new Date(`${selectedDateValue}T00:00:00`)
        },
        orderBy: { createdAt: "desc" }
      })
    : [];

  const futureBookings = isProfessor
    ? await prisma.personalTrainingBooking.findMany({
        where: {
          teacherId: user.id,
          bookingDate: { gte: new Date(`${todayDate}T00:00:00`) },
          status: { not: "cancelled" }
        },
        include: {
          student: true,
          paymentType: true,
          poolBlock: true
        },
        orderBy: [{ bookingDate: "asc" }, { startMinutes: "asc" }]
      })
    : [];

  const [creditBalances, paymentTypes] = isProfessor
    ? await Promise.all([
        getCreditBalancesForTeacher(user.id),
        prisma.personalTrainingPaymentType.findMany({
          where: { active: true },
          orderBy: { description: "asc" }
        })
      ])
    : [[], []];
  const trainingTypeMap = new Map<string, { key: string; name: string; durationMinutes: number }>();

  for (const paymentType of paymentTypes) {
    for (const duration of trainingDurationOptions) {
      if (paymentTypeMatchesDuration(paymentType.description, duration)) {
        const key = getTrainingTypeKey(paymentType.description);
        trainingTypeMap.set(key, {
          key,
          name: getTrainingTypeName(paymentType.description),
          durationMinutes: duration
        });
      }
    }
  }

  const trainingTypes = Array.from(trainingTypeMap.values()).sort(
    (a, b) => a.durationMinutes - b.durationMinutes || a.name.localeCompare(b.name)
  );
  const teacherBookingGroups = new Map<
    string,
    {
      groupId: string;
      poolBlockId: string;
      laneNumber: number;
      blockTitle: string;
      startMinutes: number;
      endMinutes: number;
      durationMinutes: number;
      trainingTypeKey: string;
      trainingTypeName: string;
      studentIds: string[];
      studentNames: string[];
    }
  >();

  if (isProfessor) {
    for (const booking of bookings.filter((booking) => booking.teacherId === user.id && booking.status !== "cancelled")) {
      const current =
        teacherBookingGroups.get(booking.bookingGroupId) ||
        {
          groupId: booking.bookingGroupId,
          poolBlockId: booking.poolBlockId,
          laneNumber: booking.poolBlock.laneNumber,
          blockTitle: booking.poolBlock.title,
          startMinutes: booking.startMinutes,
          endMinutes: booking.endMinutes,
          durationMinutes: booking.durationMinutes,
          trainingTypeKey: booking.paymentType ? getTrainingTypeKey(booking.paymentType.description) : "",
          trainingTypeName: booking.paymentType ? getTrainingTypeName(booking.paymentType.description) : "",
          studentIds: [],
          studentNames: []
        };

      current.studentIds.push(booking.studentId);
      current.studentNames.push(booking.student.fullName);
      teacherBookingGroups.set(booking.bookingGroupId, current);
    }
  }

  const teacherBookings = Array.from(teacherBookingGroups.values()).sort((a, b) => a.startMinutes - b.startMinutes);
  const futureBookingGroups = new Map<
    string,
    {
      groupId: string;
      bookingDate: Date;
      bookingDateValue: string;
      laneNumber: number;
      blockTitle: string;
      startMinutes: number;
      endMinutes: number;
      durationMinutes: number;
      trainingTypeName: string;
      studentNames: string[];
    }
  >();

  if (isProfessor) {
    for (const booking of futureBookings) {
      const bookingDateValue = dateToInputValue(booking.bookingDate);
      const current =
        futureBookingGroups.get(booking.bookingGroupId) ||
        {
          groupId: booking.bookingGroupId,
          bookingDate: booking.bookingDate,
          bookingDateValue,
          laneNumber: booking.poolBlock.laneNumber,
          blockTitle: booking.poolBlock.title,
          startMinutes: booking.startMinutes,
          endMinutes: booking.endMinutes,
          durationMinutes: booking.durationMinutes,
          trainingTypeName: booking.paymentType ? getTrainingTypeName(booking.paymentType.description) : "",
          studentNames: []
        };

      current.studentNames.push(booking.student.fullName);
      futureBookingGroups.set(booking.bookingGroupId, current);
    }
  }

  const futureTeacherBookings = Array.from(futureBookingGroups.values()).sort(
    (a, b) => a.bookingDate.getTime() - b.bookingDate.getTime() || a.startMinutes - b.startMinutes
  );
  const editBookingGroup = params.bookingBlockId
    ? teacherBookings.find((booking) => booking.groupId === params.bookingBlockId)
    : null;
  const selectedEditBlock = editBookingGroup
    ? blocks.find((block) => block.id === editBookingGroup.poolBlockId)
    : null;
  const selectedBookingBlock = params.bookingBlockId
    ? blocks.find((block) => block.id === params.bookingBlockId && block.type === "treino") || selectedEditBlock || null
    : null;

  function blockForSlot(laneNumber: number, slot: number) {
    return blocks.find(
      (block) => block.laneNumber === laneNumber && slot >= block.startMinutes && slot < block.endMinutes
    );
  }

  function bookingsForBlock(blockId: string, slot: number) {
    return bookings.filter((booking) => booking.poolBlockId === blockId && slot >= booking.startMinutes && slot < booking.endMinutes);
  }

  function groupedBookingsStartingAt(blockId: string, slot: number) {
    const grouped = new Map<string, { teacherName: string; studentNames: string[]; startMinutes: number; endMinutes: number }>();

    for (const booking of bookings.filter((booking) => booking.poolBlockId === blockId && booking.startMinutes === slot)) {
      const current = grouped.get(booking.bookingGroupId) || {
        teacherName: booking.teacher.name,
        studentNames: [],
        startMinutes: booking.startMinutes,
        endMinutes: booking.endMinutes
      };
      current.studentNames.push(booking.student.fullName);
      grouped.set(booking.bookingGroupId, current);
    }

    return Array.from(grouped.values());
  }

  function blockBookingGroups(blockId: string, startMinutes: number, endMinutes: number) {
    const grouped = new Map<
      string,
      { teacherName: string; studentNames: string[]; exclusive: boolean; startMinutes: number; endMinutes: number }
    >();
    const blockBookings = bookings.filter(
      (booking) =>
        booking.poolBlockId === blockId &&
        booking.startMinutes < endMinutes &&
        booking.endMinutes > startMinutes
    );

    for (const booking of blockBookings) {
      const description = booking.paymentType?.description?.toLowerCase() || "";
      const current = grouped.get(booking.bookingGroupId) || {
        teacherName: booking.teacher.name,
        studentNames: [],
        exclusive: description.includes("pares") || description.includes("trio"),
        startMinutes: booking.startMinutes,
        endMinutes: booking.endMinutes
      };
      current.studentNames.push(booking.student.fullName);
      grouped.set(booking.bookingGroupId, current);
    }

    return Array.from(grouped.values());
  }

  function hasBlockVacancy(blockId: string, startMinutes: number, endMinutes: number) {
    const groups = blockBookingGroups(blockId, startMinutes, endMinutes);
    return groups.length < 2 && !groups.some((group) => group.exclusive);
  }

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel pool-page-hero">
        <div className="topbar">
          <div>
            <p className="eyebrow">Piscina 25m</p>
            <h1>Mapa de disponibilidade</h1>
            <p className="muted">
              {selectedDayLabel}, {selectedDate.toLocaleDateString("pt-PT")} · {formatMinutes(bounds.start)} - {formatMinutes(bounds.end)}
            </p>
          </div>
        </div>

        <div className="date-nav">
          <a className="button secondary" href={`/piscina-25m?date=${previousDate}&tab=${activeTab}`}>
            Dia anterior
          </a>
          <a className="button secondary" href={`/piscina-25m?date=${todayDate}&tab=${activeTab}`}>
            Hoje
          </a>
          <a className="button secondary" href={`/piscina-25m?date=${nextDate}&tab=${activeTab}`}>
            Dia seguinte
          </a>
          <form className="date-picker" action="/piscina-25m" method="get">
            <input type="hidden" name="tab" value={activeTab} />
            <label className="field" htmlFor="date">
              <span>Data</span>
              <input id="date" name="date" type="date" defaultValue={selectedDateValue} />
            </label>
            <button className="button" type="submit">
              Ver
            </button>
          </form>
        </div>

        {!canBookSelectedDate ? (
          <p className="muted">Esta data está no passado. Pode ser consultada, mas não vai permitir novas marcações.</p>
        ) : null}

        {params.success ? <p className="success">Marcação criada com sucesso.</p> : null}
        {params.error ? <p className="error">Não foi possível concluir a ação. Confirma horários, créditos, aluno e sobreposições.</p> : null}

        {false && isAdmin ? (
          <form className="pool-form" action="/api/pool-schedule" method="post">
            <input type="hidden" name="weekday" value={weekday} />
            <input type="hidden" name="date" value={selectedDateValue} />
            <div className="field">
              <label htmlFor="title">Ocupação</label>
              <input id="title" name="title" required placeholder="Ex.: PT" />
            </div>
            <div className="field">
              <label htmlFor="laneNumber">Pista</label>
              <select id="laneNumber" name="laneNumber" required>
                {poolLanes.map((lane) => (
                  <option value={lane} key={lane}>
                    Pista {lane}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="startTime">Início</label>
              <input id="startTime" name="startTime" type="time" step="300" required />
            </div>
            <div className="field">
              <label htmlFor="endTime">Fim</label>
              <input id="endTime" name="endTime" type="time" step="300" required />
            </div>
            <div className="field">
              <label htmlFor="type">Tipo</label>
              <select id="type" name="type" required>
                {poolBlockTypes.map((type) => (
                  <option value={type.key} key={type.key}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="notes">Notas</label>
              <input id="notes" name="notes" />
            </div>
            <button className="button" type="submit">
              Adicionar
            </button>
          </form>
        ) : null}
      </section>

      <section className="panel pool-panel pool-workspace">
        <div className="tabs">
          <a className={activeTab === "map" ? "tab active" : "tab"} href={tabHref("map")}>
            Mapa
          </a>
          {isProfessor ? (
            <a className={activeTab === "my-bookings" ? "tab active" : "tab"} href={tabHref("my-bookings")}>
              As minhas marcações
            </a>
          ) : null}
          {isProfessor ? (
            <a className={activeTab === "future-bookings" ? "tab active" : "tab"} href={tabHref("future-bookings")}>
              Agenda futura
            </a>
          ) : null}
          {isAdmin ? (
            <a className={activeTab === "weekly" ? "tab active" : "tab"} href={tabHref("weekly")}>
              Ocupações semanais
            </a>
          ) : null}
          {isAdmin ? (
            <a className={activeTab === "logs" ? "tab active" : "tab"} href={tabHref("logs")}>
              Logs de marcações
            </a>
          ) : null}
        </div>

        {activeTab === "map" ? (
        <div className="pool-table-wrap">
          <PoolCurrentTimeScroller enabled={isSelectedDateToday} startMinutes={bounds.start} endMinutes={bounds.end} />
          <table className="pool-table">
            <colgroup>
              <col className="time-column" />
              {poolLanes.map((lane) => (
                <col className="lane-column" key={lane} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>Hora</th>
                {poolLanes.map((lane) => (
                  <th key={lane}>Pista {lane}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr id={`pool-slot-${slot}`} key={slot}>
                  <th>{formatMinutes(slot)}</th>
                  {poolLanes.map((lane) => {
                    const block = blockForSlot(lane, slot);
                    const isBlockStart = Boolean(block && slot === block.startMinutes);
                    const slotBookings = block ? groupedBookingsStartingAt(block.id, slot) : [];
                    const hasVacancy =
                      block && isBlockStart ? hasBlockVacancy(block.id, block.startMinutes, block.endMinutes) : false;
                    const canBookBlock = Boolean(
                      isProfessor && canBookSelectedDate && block?.type === "treino" && isBlockStart && hasVacancy
                    );

                    return (
                      <td className={block ? `pool-cell occupied type-${block.type}` : "pool-cell"} key={lane}>
                        {block ? (
                          <div className="pool-cell-content">
                            {isBlockStart ? (
                              <>
                                <strong>{block.title}</strong>
                                <small>
                                  {formatMinutes(block.startMinutes)} - {formatMinutes(block.endMinutes)}
                                </small>
                                {block.type === "aula" && block.teacher ? <small>{block.teacher.name}</small> : null}
                                {block.notes ? <small>{block.notes}</small> : null}
                              </>
                            ) : null}
                            {slotBookings.map((booking, index) => (
                              <small className="booking-chip" key={`${booking.teacherName}-${index}`}>
                                {formatMinutes(booking.startMinutes)} - {formatMinutes(booking.endMinutes)} · {booking.teacherName}:{" "}
                                {booking.studentNames.join(", ")}
                              </small>
                            ))}
                            {block.type === "treino" && isBlockStart ? (
                              <small className={hasVacancy ? "vacancy-chip" : "full-chip"}>
                                {hasVacancy ? "Vaga" : "Sem vaga"}
                              </small>
                            ) : null}
                            {canBookBlock ? (
                              <a className="mini-button" href={`/piscina-25m?date=${selectedDateValue}&bookingBlockId=${block.id}`}>
                                Marcar
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        ) : null}
      </section>

      {isProfessor && canBookSelectedDate && selectedBookingBlock ? (
        <BookingModal
          date={selectedDateValue}
          poolBlockId={selectedBookingBlock.id}
          blockTitle={selectedBookingBlock.title}
          laneNumber={selectedBookingBlock.laneNumber}
          startLabel={formatMinutes(selectedBookingBlock.startMinutes)}
          endLabel={formatMinutes(selectedBookingBlock.endMinutes)}
          blockStartMinutes={selectedBookingBlock.startMinutes}
          blockEndMinutes={selectedBookingBlock.endMinutes}
          maxDurationMinutes={selectedBookingBlock.endMinutes - selectedBookingBlock.startMinutes}
          closeHref={`/piscina-25m?date=${selectedDateValue}`}
          trainingTypes={trainingTypes}
          creditBalances={creditBalances}
          editBooking={
            editBookingGroup
              ? {
                  groupId: editBookingGroup.groupId,
                  startMinutes: editBookingGroup.startMinutes,
                  durationMinutes: editBookingGroup.durationMinutes,
                  trainingTypeKey: editBookingGroup.trainingTypeKey,
                  studentIds: editBookingGroup.studentIds
                }
              : undefined
          }
        />
      ) : null}

      {activeTab === "my-bookings" && isProfessor ? (
        <section className="panel pool-list-panel">
          <h2>As minhas marcações</h2>
          <div className="teacher-bookings-list">
            {teacherBookings.length === 0 ? <p className="muted">Ainda não existem marcações para este dia.</p> : null}
            {teacherBookings.map((booking) => (
              <div className="teacher-booking-row" key={booking.groupId}>
                <div>
                  <strong>
                    {formatMinutes(booking.startMinutes)} - {formatMinutes(booking.endMinutes)} · {booking.blockTitle} · Pista {booking.laneNumber}
                  </strong>
                  <p className="muted">
                    {booking.trainingTypeName} · {booking.studentNames.join(", ")}
                  </p>
                </div>
                {canBookSelectedDate ? (
                  <div className="action-row compact-actions">
                    <a className="button secondary" href={`/piscina-25m?date=${selectedDateValue}&bookingBlockId=${booking.groupId}`}>
                      Alterar
                    </a>
                    <form action="/api/personal-training/bookings/cancel" method="post">
                      <input type="hidden" name="date" value={selectedDateValue} />
                      <input type="hidden" name="bookingGroupId" value={booking.groupId} />
                      <button className="button danger" type="submit">
                        Anular
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}


      {activeTab === "future-bookings" && isProfessor ? (
        <section className="panel pool-list-panel">
          <h2>Agenda futura</h2>
          <p className="muted">Todas as tuas marcações de hoje em diante.</p>
          <div className="teacher-bookings-list">
            {futureTeacherBookings.length === 0 ? <p className="muted">Não existem marcações futuras.</p> : null}
            {futureTeacherBookings.map((booking) => (
              <div className="teacher-booking-row" key={booking.groupId}>
                <div>
                  <strong>
                    {booking.bookingDate.toLocaleDateString("pt-PT")} - {formatMinutes(booking.startMinutes)} -{" "}
                    {formatMinutes(booking.endMinutes)} - {booking.blockTitle} - Pista {booking.laneNumber}
                  </strong>
                  <p className="muted">
                    {booking.trainingTypeName} - {booking.studentNames.join(", ")}
                  </p>
                </div>
                <div className="action-row compact-actions">
                  <a className="button secondary" href={`/piscina-25m?date=${booking.bookingDateValue}&bookingBlockId=${booking.groupId}`}>
                    Alterar
                  </a>
                  <form action="/api/personal-training/bookings/cancel" method="post">
                    <input type="hidden" name="date" value={booking.bookingDateValue} />
                    <input type="hidden" name="bookingGroupId" value={booking.groupId} />
                    <button className="button danger" type="submit">
                      Anular
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "weekly" && isAdmin ? (
        <section className="panel pool-list-panel">
          <h2>Ocupações semanais de {selectedDayLabel}</h2>
          <div className="weekly-tools">
            <form className="weekly-tool-card" action="/api/pool-schedule/import" method="post">
              <input type="hidden" name="targetWeekday" value={weekday} />
              <input type="hidden" name="date" value={selectedDateValue} />
              <div className="field">
                <label htmlFor="sourceWeekday">Importar de</label>
                <select id="sourceWeekday" name="sourceWeekday" required>
                  {poolWeekdays
                    .filter((day) => day.key !== weekday)
                    .map((day) => (
                      <option value={day.key} key={day.key}>
                        {day.label}
                      </option>
                    ))}
                </select>
              </div>
              <label className="checkbox compact-confirmation">
                <input type="checkbox" name="confirmImportDay" required />
                Confirmo que quero importar ocupações para este dia
              </label>
              <button className="button secondary" type="submit">
                Importar ocupações
              </button>
            </form>

            <form className="weekly-tool-card danger-zone" action="/api/pool-schedule/bulk-delete" method="post">
              <input type="hidden" name="weekday" value={weekday} />
              <input type="hidden" name="date" value={selectedDateValue} />
              <label className="checkbox compact-confirmation">
                <input type="checkbox" name="confirmDeleteDay" required />
                Confirmo que quero apagar todas as ocupações deste dia
              </label>
              <button className="button danger" type="submit">
                Apagar dia
              </button>
            </form>
          </div>

          <form className="pool-form" action="/api/pool-schedule" method="post" data-pool-schedule-form>
            <PoolClassTeacherRequirement />
            <input type="hidden" name="weekday" value={weekday} />
            <input type="hidden" name="date" value={selectedDateValue} />
            <div className="field">
              <label htmlFor="title">Ocupação</label>
              <input id="title" name="title" required placeholder="Ex.: PT" />
            </div>
            <div className="field">
              <label htmlFor="laneNumber">Pista</label>
              <select id="laneNumber" name="laneNumber" required>
                {poolLanes.map((lane) => (
                  <option value={lane} key={lane}>
                    Pista {lane}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="startTime">Início</label>
              <input id="startTime" name="startTime" type="time" step="300" required />
            </div>
            <div className="field">
              <label htmlFor="endTime">Fim</label>
              <input id="endTime" name="endTime" type="time" step="300" required />
            </div>
            <div className="field">
              <label htmlFor="type">Tipo</label>
              <select id="type" name="type" required>
                {poolBlockTypes.map((type) => (
                  <option value={type.key} key={type.key}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="teacherId">Professor da aula</label>
              <select id="teacherId" name="teacherId">
                <option value="">Selecionar se for Aula</option>
                {classTeachers.map((teacher) => (
                  <option value={teacher.id} key={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="notes">Notas</label>
              <input id="notes" name="notes" />
            </div>
            <button className="button" type="submit">
              Adicionar
            </button>
          </form>
          <div className="schedule-list">
            {blocks.length === 0 ? <p className="muted">Ainda não existem ocupações para este dia da semana.</p> : null}
            {blocks.map((block) => (
              <form
                className="schedule-item schedule-edit-form"
                action={`/api/pool-schedule/${block.id}`}
                method="post"
                key={block.id}
                data-pool-schedule-form
              >
                <input type="hidden" name="date" value={selectedDateValue} />
                <div className="field">
                  <label>Ocupação</label>
                  <input name="title" defaultValue={block.title} required />
                </div>
                <div className="field">
                  <label>Pista</label>
                  <select name="laneNumber" defaultValue={block.laneNumber} required>
                    {poolLanes.map((lane) => (
                      <option value={lane} key={lane}>
                        Pista {lane}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Início</label>
                  <input name="startTime" type="time" step="300" defaultValue={formatMinutes(block.startMinutes)} required />
                </div>
                <div className="field">
                  <label>Fim</label>
                  <input name="endTime" type="time" step="300" defaultValue={formatMinutes(block.endMinutes)} required />
                </div>
                <div className="field">
                  <label>Tipo</label>
                  <select name="type" defaultValue={block.type} required>
                    {poolBlockTypes.map((type) => (
                      <option value={type.key} key={type.key}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Professor da aula</label>
                  <select name="teacherId" defaultValue={block.teacherId || ""}>
                    <option value="">Selecionar se for Aula</option>
                    {classTeachers.map((teacher) => (
                      <option value={teacher.id} key={teacher.id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Notas</label>
                  <input name="notes" defaultValue={block.notes || ""} />
                </div>
                <div className="action-row compact-actions">
                  <button className="button secondary" name="action" value="save" type="submit">
                    Guardar
                  </button>
                  <button className="button danger" name="action" value="delete" type="submit">
                    Remover
                  </button>
                </div>
              </form>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "logs" && isAdmin ? (
        <section className="panel pool-list-panel">
          <h2>Logs de agendamentos PT</h2>
          <div className="booking-log-list">
            {bookingLogs.length === 0 ? <p className="muted">Ainda não existem logs para este dia.</p> : null}
            {bookingLogs.map((log) => (
              <div className="booking-log-row" key={log.id}>
                <div>
                  <strong>
                    {log.action} · {log.teacherName}
                  </strong>
                  <p className="muted">
                    {formatMinutes(log.startMinutes)} - {formatMinutes(log.endMinutes)} · {log.poolBlockTitle} · Pista {log.laneNumber}
                  </p>
                  <p className="muted">
                    {log.studentNames}
                    {log.paymentType ? ` · ${log.paymentType}` : ""}
                  </p>
                </div>
                <span className="muted">{log.createdAt.toLocaleString("pt-PT")}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
