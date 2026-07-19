import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BookingModal } from "@/components/BookingModal";
import { PoolClassTeacherRequirement } from "@/components/PoolClassTeacherRequirement";
import { PoolCurrentTimeScroller } from "@/components/PoolCurrentTimeScroller";
import { PoolDatePicker } from "@/components/PoolDatePicker";
import { hasRole, requireUser } from "@/lib/auth";
import { getHolidayForDate } from "@/lib/holidays";
import { getCreditBalancesForTeacher } from "@/lib/personalTrainingCredits";
import { getSystemSettings } from "@/lib/maintenance";
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
  poolBlockAppliesToDate,
  poolBlockTypes,
  PoolMapConfig,
  poolRecurrenceOptions,
  poolWeekdays
} from "@/lib/pool";

export async function PoolMapView({
  mapConfig,
  searchParams
}: {
  mapConfig: PoolMapConfig;
  searchParams: Promise<{ date?: string; error?: string; success?: string; bookingBlockId?: string; tab?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);
  const isAdmin = hasRole(user, "admin");
  const isProfessor = hasRole(user, "professor");
  const isTeacherOnlySchedule = mapConfig.scheduleMode === "teacherOnly";
  const systemSettings = await getSystemSettings();
  const canSubmitChanges = !systemSettings.maintenanceMode || isAdmin;

  if (!canAccessPoolMap(roleKeys)) {
    redirect("/dashboard");
  }

  const selectedDate = parseDateParam(params.date);
  const selectedDateValue = dateToInputValue(selectedDate);
  const holidayOptions = {
    includeChristmasEveHoliday: systemSettings.includeChristmasEveHoliday,
    includeLisbonMunicipalHolidays: systemSettings.includeLisbonMunicipalHolidays,
    includeNewYearsEveHoliday: systemSettings.includeNewYearsEveHoliday
  };
  const selectedHoliday = getHolidayForDate(selectedDate, holidayOptions);
  const weekday = dateToWeekday(selectedDate);
  const selectedDayLabel = poolWeekdays.find((day) => day.key === weekday)?.label || "Dia";
  const previousDate = dateToInputValue(addDays(selectedDate, -1));
  const nextDate = dateToInputValue(addDays(selectedDate, 1));
  const todayDate = dateToInputValue(new Date());
  const isSelectedDateTodayOrFuture = isTodayOrFuture(selectedDate);
  const canBookSelectedDate = isSelectedDateTodayOrFuture && !selectedHoliday;
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
    `${mapConfig.basePath}?date=${selectedDateValue}&tab=${tab}`;

  const blocks = await prisma.poolScheduleBlock.findMany({
    where: { poolKey: mapConfig.key, weekday, active: true },
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
      poolBlock: { poolKey: mapConfig.key },
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
          poolBlock: { poolKey: mapConfig.key },
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
    ? blocks.find(
        (block) =>
          block.id === params.bookingBlockId &&
          block.type === "treino" &&
          poolBlockAppliesToDate(block, selectedDate)
      ) ||
      selectedEditBlock ||
      null
    : null;

  function blockForSlot(laneNumber: number, slot: number) {
    const candidates = blocks.filter(
      (block) => block.laneNumber === laneNumber && slot >= block.startMinutes && slot < block.endMinutes
    );
    return (
      candidates.find((block) => poolBlockAppliesToDate(block, selectedDate)) ||
      candidates[0] ||
      null
    );
  }

  function periodLabel(block: { recurrenceType: string; validFrom: Date | null; validTo: Date | null }) {
    if (block.recurrenceType !== "period" || !block.validFrom || !block.validTo) {
      return "Recorrente";
    }

    return `${block.validFrom.toLocaleDateString("pt-PT")} - ${block.validTo.toLocaleDateString("pt-PT")}`;
  }

  function laneLabel(laneNumber: number) {
    return mapConfig.lanes.find((lane) => lane.number === laneNumber)?.label || `${mapConfig.laneFieldLabel} ${laneNumber}`;
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
      <section className={selectedHoliday ? "panel pool-page-hero holiday-panel" : "panel pool-page-hero"}>
        <div className="topbar">
          <div>
            <p className="eyebrow">{mapConfig.eyebrow}</p>
            <h1>{mapConfig.title}</h1>
            <p className="muted">
              {selectedDayLabel}, {selectedDate.toLocaleDateString("pt-PT")} · {formatMinutes(bounds.start)} - {formatMinutes(bounds.end)}
            </p>
          </div>
        </div>

        <div className="date-nav">
          <a className="button secondary" href={`${mapConfig.basePath}?date=${previousDate}&tab=${activeTab}`}>
            Dia anterior
          </a>
          <a className="button secondary" href={`${mapConfig.basePath}?date=${todayDate}&tab=${activeTab}`}>
            Hoje
          </a>
          <a className="button secondary" href={`${mapConfig.basePath}?date=${nextDate}&tab=${activeTab}`}>
            Dia seguinte
          </a>
          <div className="date-picker">
            <PoolDatePicker activeTab={activeTab} basePath={mapConfig.basePath} selectedDateValue={selectedDateValue} />
          </div>
        </div>

        {!isSelectedDateTodayOrFuture ? (
          <p className="muted">Esta data está no passado. Pode ser consultada, mas não vai permitir novas marcações.</p>
        ) : null}
        {selectedHoliday ? (
          <p className="holiday-alert">
            {selectedHoliday.name}. Este dia está marcado como feriado e não permite marcações de PT.
          </p>
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
              <label htmlFor="laneNumber">{mapConfig.laneFieldLabel}</label>
              <select id="laneNumber" name="laneNumber" required>
                {mapConfig.lanes.map((lane) => (
                  <option value={lane.number} key={lane.number}>
                    {lane.label}
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
        <div className={selectedHoliday ? "pool-table-wrap holiday-map" : "pool-table-wrap"}>
          <PoolCurrentTimeScroller enabled={isSelectedDateToday} startMinutes={bounds.start} endMinutes={bounds.end} />
          <table className="pool-table">
            <colgroup>
              <col className="time-column" />
              {mapConfig.lanes.map((lane) => (
                <col className="lane-column" key={lane.number} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>Hora</th>
                {mapConfig.lanes.map((lane) => (
                  <th key={lane.number}>{lane.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr id={`pool-slot-${slot}`} key={slot}>
                  <th>{formatMinutes(slot)}</th>
                  {mapConfig.lanes.map((lane) => {
                    const block = blockForSlot(lane.number, slot);
                    const isBlockStart = Boolean(block && slot === block.startMinutes);
                    const isInsideExistingBlock = Boolean(block && !isBlockStart);
                    const blockAppliesToSelectedDate = block ? poolBlockAppliesToDate(block, selectedDate) : false;
                    const blockSlotSpan = block && isBlockStart ? Math.max(1, (block.endMinutes - block.startMinutes) / 5) : 1;
                    const blockBookings =
                      block && isBlockStart && blockAppliesToSelectedDate
                        ? blockBookingGroups(block.id, block.startMinutes, block.endMinutes)
                        : [];
                    const hasVacancy =
                      block && isBlockStart && blockAppliesToSelectedDate
                        ? hasBlockVacancy(block.id, block.startMinutes, block.endMinutes)
                        : false;
                    const canBookBlock = Boolean(
                      isProfessor &&
                        canSubmitChanges &&
                        canBookSelectedDate &&
                        block?.type === "treino" &&
                        isBlockStart &&
                        blockAppliesToSelectedDate &&
                        hasVacancy
                    );

                    if (isInsideExistingBlock) {
                      return null;
                    }

                    return (
                      <td
                        className={
                          block
                            ? `pool-cell occupied type-${block.type}${blockAppliesToSelectedDate ? "" : " ghost-occupation"}`
                            : "pool-cell"
                        }
                        key={lane.number}
                        rowSpan={block && isBlockStart ? blockSlotSpan : undefined}
                      >
                        {block ? (
                          <div className="pool-cell-content pool-block-card" style={{ minHeight: `${Math.max(42, blockSlotSpan * 30 - 10)}px` }}>
                            {isBlockStart ? (
                              <div className="pool-block-main">
                                <strong>{block.title}</strong>
                                <small>
                                  {formatMinutes(block.startMinutes)} - {formatMinutes(block.endMinutes)}
                                </small>
                                {block.type === "aula" && block.teacher ? <small>{block.teacher.name}</small> : null}
                                {block.notes ? <small>{block.notes}</small> : null}
                                {!blockAppliesToSelectedDate ? <small>Fora do período</small> : null}
                              </div>
                            ) : null}
                            {blockBookings.map((booking, index) => (
                              <div className="booking-chip" key={`${booking.teacherName}-${index}`}>
                                <span>{formatMinutes(booking.startMinutes)} - {formatMinutes(booking.endMinutes)}</span>
                                <strong>{booking.teacherName}</strong>
                                {booking.studentNames.map((studentName) => (
                                  <span key={studentName}>{studentName}</span>
                                ))}
                                {formatMinutes(booking.startMinutes)} - {formatMinutes(booking.endMinutes)} · {booking.teacherName}:{" "}
                                {booking.studentNames.join(", ")}
                              </div>
                            ))}
                            {block.type === "treino" && isBlockStart && blockAppliesToSelectedDate ? (
                              <small className={hasVacancy ? "vacancy-chip" : "full-chip"}>
                                {hasVacancy ? "Vaga" : "Sem vaga"}
                              </small>
                            ) : null}
                            {canBookBlock ? (
                              <a className="mini-button" href={`${mapConfig.basePath}?date=${selectedDateValue}&bookingBlockId=${block.id}`}>
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

      {isProfessor && canSubmitChanges && canBookSelectedDate && selectedBookingBlock ? (
        <BookingModal
          date={selectedDateValue}
          poolBlockId={selectedBookingBlock.id}
          poolKey={mapConfig.key}
          blockTitle={selectedBookingBlock.title}
          laneLabel={laneLabel(selectedBookingBlock.laneNumber)}
          startLabel={formatMinutes(selectedBookingBlock.startMinutes)}
          endLabel={formatMinutes(selectedBookingBlock.endMinutes)}
          blockStartMinutes={selectedBookingBlock.startMinutes}
          blockEndMinutes={selectedBookingBlock.endMinutes}
          maxDurationMinutes={selectedBookingBlock.endMinutes - selectedBookingBlock.startMinutes}
          closeHref={`${mapConfig.basePath}?date=${selectedDateValue}`}
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
                    {formatMinutes(booking.startMinutes)} - {formatMinutes(booking.endMinutes)} · {booking.blockTitle} · {laneLabel(booking.laneNumber)}
                  </strong>
                  <p className="muted">
                    {booking.trainingTypeName} · {booking.studentNames.join(", ")}
                  </p>
                </div>
                {canBookSelectedDate && canSubmitChanges ? (
                  <div className="action-row compact-actions">
                    <a className="button secondary" href={`${mapConfig.basePath}?date=${selectedDateValue}&bookingBlockId=${booking.groupId}`}>
                      Alterar
                    </a>
                    <form action="/api/personal-training/bookings/cancel" method="post">
                      <input type="hidden" name="date" value={selectedDateValue} />
                      <input type="hidden" name="poolKey" value={mapConfig.key} />
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
                    {formatMinutes(booking.endMinutes)} - {booking.blockTitle} - {laneLabel(booking.laneNumber)}
                  </strong>
                  <p className="muted">
                    {booking.trainingTypeName} - {booking.studentNames.join(", ")}
                  </p>
                </div>
                {canSubmitChanges ? (
                <div className="action-row compact-actions">
                  <a className="button secondary" href={`${mapConfig.basePath}?date=${booking.bookingDateValue}&bookingBlockId=${booking.groupId}`}>
                    Alterar
                  </a>
                  <form action="/api/personal-training/bookings/cancel" method="post">
                    <input type="hidden" name="date" value={booking.bookingDateValue} />
                    <input type="hidden" name="poolKey" value={mapConfig.key} />
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

      {activeTab === "weekly" && isAdmin ? (
        <section className="panel pool-list-panel">
          <h2>Ocupações semanais de {selectedDayLabel}</h2>
          <div className="weekly-tools">
            <form className="weekly-tool-card" action="/api/pool-schedule/import" method="post">
              <input type="hidden" name="targetWeekday" value={weekday} />
              <input type="hidden" name="date" value={selectedDateValue} />
              <input type="hidden" name="poolKey" value={mapConfig.key} />
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
              <input type="hidden" name="poolKey" value={mapConfig.key} />
              <label className="checkbox compact-confirmation">
                <input type="checkbox" name="confirmDeleteDay" required />
                Confirmo que quero apagar todas as ocupações deste dia
              </label>
              <button className="button danger" type="submit">
                Apagar dia
              </button>
            </form>
          </div>

          <form
            className={isTeacherOnlySchedule ? "pool-form teacher-only-schedule-form" : "pool-form"}
            action="/api/pool-schedule"
            method="post"
            data-pool-schedule-form
          >
            <PoolClassTeacherRequirement />
            <input type="hidden" name="weekday" value={weekday} />
            <input type="hidden" name="date" value={selectedDateValue} />
            <input type="hidden" name="poolKey" value={mapConfig.key} />
            <div className="field schedule-title-field">
              <label htmlFor="title">Ocupação</label>
              <input id="title" name="title" required placeholder="Ex.: PT" defaultValue={isTeacherOnlySchedule ? mapConfig.eyebrow : ""} />
            </div>
            <div className="field schedule-lane-field">
              <label htmlFor="laneNumber">{mapConfig.laneFieldLabel}</label>
              <select id="laneNumber" name="laneNumber" required>
                {mapConfig.lanes.map((lane) => (
                  <option value={lane.number} key={lane.number}>
                    {lane.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field schedule-time-field">
              <label htmlFor="startTime">Início</label>
              <input id="startTime" name="startTime" type="time" step="300" required />
            </div>
            <div className="field schedule-time-field">
              <label htmlFor="endTime">Fim</label>
              <input id="endTime" name="endTime" type="time" step="300" required />
            </div>
            <div className="field schedule-type-field">
              <label htmlFor="type">Tipo</label>
              <select id="type" name="type" required defaultValue={isTeacherOnlySchedule ? "aula" : undefined}>
                {poolBlockTypes.map((type) => (
                  <option value={type.key} key={type.key}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field schedule-teacher-field">
              <label htmlFor="teacherId">{isTeacherOnlySchedule ? "Professor" : "Professor da aula"}</label>
              <select id="teacherId" name="teacherId" required={isTeacherOnlySchedule ? true : undefined}>
                <option value="">{isTeacherOnlySchedule ? "Selecionar professor" : "Selecionar se for Aula"}</option>
                {classTeachers.map((teacher) => (
                  <option value={teacher.id} key={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field schedule-notes-field">
              <label htmlFor="notes">Notas</label>
              <input id="notes" name="notes" />
            </div>
            <div className="field schedule-recurrence-field">
              <label htmlFor="recurrenceType">Recorrência</label>
              <select id="recurrenceType" name="recurrenceType" defaultValue="recurring">
                {poolRecurrenceOptions.map((option) => (
                  <option value={option.key} key={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field schedule-date-field">
              <label htmlFor="validFrom">Desde</label>
              <input id="validFrom" name="validFrom" type="date" />
            </div>
            <div className="field schedule-date-field">
              <label htmlFor="validTo">Até</label>
              <input id="validTo" name="validTo" type="date" />
            </div>
            <button className="button schedule-submit-button" type="submit">
              Adicionar
            </button>
          </form>
          <div className="schedule-list">
            {blocks.length === 0 ? <p className="muted">Ainda não existem ocupações para este dia da semana.</p> : null}
            {blocks.map((block) => (
              <form
                className={
                  isTeacherOnlySchedule
                    ? "schedule-item schedule-edit-form teacher-only-schedule-edit-form"
                    : "schedule-item schedule-edit-form"
                }
                action={`/api/pool-schedule/${block.id}`}
                method="post"
                key={block.id}
                data-pool-schedule-form
              >
                <input type="hidden" name="date" value={selectedDateValue} />
                <input type="hidden" name="poolKey" value={mapConfig.key} />
                <div className="field schedule-title-field">
                  <label>Ocupação</label>
                  <input name="title" defaultValue={block.title} required />
                </div>
                <div className="field schedule-lane-field">
                  <label>{mapConfig.laneFieldLabel}</label>
                  <select name="laneNumber" defaultValue={block.laneNumber} required>
                    {mapConfig.lanes.map((lane) => (
                      <option value={lane.number} key={lane.number}>
                        {lane.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field schedule-time-field">
                  <label>Início</label>
                  <input name="startTime" type="time" step="300" defaultValue={formatMinutes(block.startMinutes)} required />
                </div>
                <div className="field schedule-time-field">
                  <label>Fim</label>
                  <input name="endTime" type="time" step="300" defaultValue={formatMinutes(block.endMinutes)} required />
                </div>
                <div className="field schedule-type-field">
                  <label>Tipo</label>
                  <select name="type" defaultValue={block.type} required>
                    {poolBlockTypes.map((type) => (
                      <option value={type.key} key={type.key}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field schedule-teacher-field">
                  <label>{isTeacherOnlySchedule ? "Professor" : "Professor da aula"}</label>
                  <select name="teacherId" defaultValue={block.teacherId || ""} required={isTeacherOnlySchedule ? true : undefined}>
                    <option value="">{isTeacherOnlySchedule ? "Selecionar professor" : "Selecionar se for Aula"}</option>
                    {classTeachers.map((teacher) => (
                      <option value={teacher.id} key={teacher.id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field schedule-notes-field">
                  <label>Notas</label>
                  <input name="notes" defaultValue={block.notes || ""} />
                </div>
                <div className="field schedule-recurrence-field">
                  <label>Recorrência</label>
                  <select name="recurrenceType" defaultValue={block.recurrenceType}>
                    {poolRecurrenceOptions.map((option) => (
                      <option value={option.key} key={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field schedule-date-field">
                  <label>Desde</label>
                  <input name="validFrom" type="date" defaultValue={block.validFrom ? dateToInputValue(block.validFrom) : ""} />
                </div>
                <div className="field schedule-date-field">
                  <label>Até</label>
                  <input name="validTo" type="date" defaultValue={block.validTo ? dateToInputValue(block.validTo) : ""} />
                </div>
                <span className={poolBlockAppliesToDate(block, selectedDate) ? "status active schedule-period-status" : "status inactive schedule-period-status"}>
                  {periodLabel(block)}
                </span>
                <div className="action-row compact-actions schedule-actions">
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
                    {formatMinutes(log.startMinutes)} - {formatMinutes(log.endMinutes)} · {log.poolBlockTitle} · {laneLabel(log.laneNumber)}
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


