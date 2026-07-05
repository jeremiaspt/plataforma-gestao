import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BookingModal } from "@/components/BookingModal";
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
  searchParams: Promise<{ date?: string; error?: string; success?: string; bookingBlockId?: string }>;
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
  const slots = buildTimeSlots(weekday);
  const bounds = dayBounds(weekday);

  const blocks = await prisma.poolScheduleBlock.findMany({
    where: { weekday },
    orderBy: [{ laneNumber: "asc" }, { startMinutes: "asc" }],
    include: { createdBy: { select: { name: true } } }
  });

  const bookings = await prisma.personalTrainingBooking.findMany({
    where: {
      bookingDate: new Date(`${selectedDateValue}T00:00:00`)
    },
    include: {
      teacher: { select: { name: true } },
      student: true,
      paymentType: true,
      poolBlock: true
    },
    orderBy: [{ startMinutes: "asc" }]
  });

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
  const selectedBookingBlock = params.bookingBlockId
    ? blocks.find((block) => block.id === params.bookingBlockId && block.type === "treino")
    : null;

  function blockForSlot(laneNumber: number, slot: number) {
    return blocks.find(
      (block) => block.laneNumber === laneNumber && slot >= block.startMinutes && slot < block.endMinutes
    );
  }

  function bookingsForBlock(blockId: string, slot: number) {
    return bookings.filter((booking) => booking.poolBlockId === blockId && slot >= booking.startMinutes && slot < booking.endMinutes);
  }

  function groupedBookingsForBlock(blockId: string, slot: number) {
    const grouped = new Map<string, { teacherName: string; studentNames: string[] }>();

    for (const booking of bookingsForBlock(blockId, slot)) {
      const current = grouped.get(booking.bookingGroupId) || {
        teacherName: booking.teacher.name,
        studentNames: []
      };
      current.studentNames.push(booking.student.fullName);
      grouped.set(booking.bookingGroupId, current);
    }

    return Array.from(grouped.values());
  }

  function blockBookingGroups(blockId: string, startMinutes: number, endMinutes: number) {
    const grouped = new Map<string, { teacherName: string; studentNames: string[]; exclusive: boolean }>();
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
        exclusive: description.includes("pares") || description.includes("trio") || description.includes("grupo")
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
    <AppShell userName={user.name}>
      <section className="panel">
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
          <a className="button secondary" href={`/piscina-25m?date=${previousDate}`}>
            Dia anterior
          </a>
          <a className="button secondary" href={`/piscina-25m?date=${todayDate}`}>
            Hoje
          </a>
          <a className="button secondary" href={`/piscina-25m?date=${nextDate}`}>
            Dia seguinte
          </a>
          <form className="date-picker" action="/piscina-25m" method="get">
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

        {isAdmin ? (
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

      <section className="panel pool-panel">
        <div className="pool-table-wrap">
          <table className="pool-table">
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
                <tr key={slot}>
                  <th>{formatMinutes(slot)}</th>
                  {poolLanes.map((lane) => {
                    const block = blockForSlot(lane, slot);
                    const slotBookings = block ? groupedBookingsForBlock(block.id, slot) : [];
                    const isBlockStart = Boolean(block && slot === block.startMinutes);
                    const blockGroups =
                      block && isBlockStart ? blockBookingGroups(block.id, block.startMinutes, block.endMinutes) : [];
                    const hasVacancy =
                      block && isBlockStart ? hasBlockVacancy(block.id, block.startMinutes, block.endMinutes) : false;
                    const canBookBlock = Boolean(
                      isProfessor && canBookSelectedDate && block?.type === "treino" && isBlockStart && hasVacancy
                    );

                    return (
                      <td className={block ? `pool-cell occupied type-${block.type}` : "pool-cell"} key={lane}>
                        {block ? (
                          <div className="pool-cell-content">
                            <strong>{block.title}</strong>
                            <small>
                              {formatMinutes(block.startMinutes)} - {formatMinutes(block.endMinutes)}
                            </small>
                            {slotBookings.map((booking, index) => (
                              <small className="booking-chip" key={`${booking.teacherName}-${index}`}>
                                {booking.teacherName}: {booking.studentNames.join(", ")}
                              </small>
                            ))}
                            {block.type === "treino" && isBlockStart ? (
                              <small className={hasVacancy ? "vacancy-chip" : "full-chip"}>
                                {hasVacancy ? "Vaga" : "Sem vaga"}
                              </small>
                            ) : null}
                            {block.type === "treino" && isBlockStart && blockGroups.length > 0 ? (
                              <div className="booking-summary">
                                {blockGroups.map((group, index) => (
                                  <small key={`${group.teacherName}-${index}`}>
                                    {group.teacherName}: {group.studentNames.join(", ")}
                                  </small>
                                ))}
                              </div>
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
      </section>

      {isProfessor && canBookSelectedDate && selectedBookingBlock ? (
        <BookingModal
          date={selectedDateValue}
          poolBlockId={selectedBookingBlock.id}
          blockTitle={selectedBookingBlock.title}
          laneNumber={selectedBookingBlock.laneNumber}
          startLabel={formatMinutes(selectedBookingBlock.startMinutes)}
          endLabel={formatMinutes(selectedBookingBlock.endMinutes)}
          maxDurationMinutes={selectedBookingBlock.endMinutes - selectedBookingBlock.startMinutes}
          closeHref={`/piscina-25m?date=${selectedDateValue}`}
          trainingTypes={trainingTypes}
          creditBalances={creditBalances}
        />
      ) : null}


      {isAdmin ? (
        <section className="panel">
          <h2>Ocupações semanais de {selectedDayLabel}</h2>
          <div className="schedule-list">
            {blocks.length === 0 ? <p className="muted">Ainda não existem ocupações para este dia da semana.</p> : null}
            {blocks.map((block) => (
              <form className="schedule-item" action={`/api/pool-schedule/${block.id}`} method="post" key={block.id}>
                <input type="hidden" name="date" value={selectedDateValue} />
                <div>
                  <strong>{block.title}</strong>
                  <p className="muted">
                    Pista {block.laneNumber}, {formatMinutes(block.startMinutes)} - {formatMinutes(block.endMinutes)}
                  </p>
                </div>
                <button className="button danger" name="action" value="delete" type="submit">
                  Remover
                </button>
              </form>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
