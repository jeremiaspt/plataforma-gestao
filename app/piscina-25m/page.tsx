import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
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
  searchParams: Promise<{ date?: string; error?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);
  const isAdmin = hasRole(user, "admin");

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

  function blockForSlot(laneNumber: number, slot: number) {
    return blocks.find(
      (block) => block.laneNumber === laneNumber && slot >= block.startMinutes && slot < block.endMinutes
    );
  }

  function bookingsForBlock(blockId: string, slot: number) {
    return bookings.filter((booking) => booking.poolBlockId === blockId && slot >= booking.startMinutes && slot < booking.endMinutes);
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

        {params.error ? <p className="error">Não foi possível criar a ocupação. Confirma horários, pista e sobreposições.</p> : null}

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
                    const slotBookings = block ? bookingsForBlock(block.id, slot) : [];

                    return (
                      <td className={block ? `pool-cell occupied type-${block.type}` : "pool-cell"} key={lane}>
                        {block ? (
                          <span>
                            <strong>{block.title}</strong>
                            <small>
                              {formatMinutes(block.startMinutes)} - {formatMinutes(block.endMinutes)}
                            </small>
                            {slotBookings.map((booking) => (
                              <small className="booking-chip" key={booking.id}>
                                {booking.teacher.name}: {booking.student.fullName}
                              </small>
                            ))}
                          </span>
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
