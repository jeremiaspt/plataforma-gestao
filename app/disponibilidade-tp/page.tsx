import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { dayBounds, formatMinutes, poolWeekdays } from "@/lib/pool";
import { prisma } from "@/lib/prisma";

function timeValue(minutes: number) {
  return formatMinutes(minutes);
}

function availabilityForSlot(
  items: Array<{
    endMinutes: number;
    startMinutes: number;
    teacher: { name: string };
    notes: string | null;
    weekday: number;
  }>,
  weekday: number,
  slot: number
) {
  return items.filter((item) => item.weekday === weekday && item.startMinutes <= slot && item.endMinutes > slot);
}

export default async function PersonalTrainingAvailabilityPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; success?: string; tab?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);
  const isAdmin = hasRole(user, "admin");
  const isProfessor = hasRole(user, "professor");

  if (!isAdmin && !isProfessor) {
    redirect("/dashboard");
  }

  const activeTab = params.tab === "map" && isAdmin ? "map" : "mine";
  const [teachers, myAvailability, allAvailability] = await Promise.all([
    isAdmin
      ? prisma.user.findMany({
          where: { active: true, roles: { some: { role: { key: "professor" } } } },
          orderBy: { name: "asc" },
          select: { id: true, name: true }
        })
      : Promise.resolve([]),
    prisma.personalTrainingAvailability.findMany({
      where: { active: true, teacherId: user.id },
      include: { teacher: { select: { name: true } } },
      orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }]
    }),
    isAdmin
      ? prisma.personalTrainingAvailability.findMany({
          where: { active: true },
          include: { teacher: { select: { name: true } } },
          orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }, { teacher: { name: "asc" } }]
        })
      : Promise.resolve([])
  ]);
  const mapSlots = Array.from({ length: 29 }, (_, index) => 7 * 60 + index * 30);

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel availability-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Treinos personalizados</p>
            <h1>Disponibilidade novos TP</h1>
            <p className="muted">Indica janelas de disponibilidade para novas angariacoes de treinos personalizados.</p>
          </div>
          <span className="status active">{isAdmin ? allAvailability.length : myAvailability.length} janelas</span>
        </div>

        {params.success ? <p className="success">Disponibilidade guardada.</p> : null}
        {params.error ? <p className="error">Nao foi possivel guardar. Confirma dia e horario.</p> : null}

        <div className="tabs">
          <a className={activeTab === "mine" ? "tab active" : "tab"} href="/disponibilidade-tp?tab=mine">
            A minha disponibilidade
          </a>
          {isAdmin ? (
            <a className={activeTab === "map" ? "tab active" : "tab"} href="/disponibilidade-tp?tab=map">
              Mapa geral
            </a>
          ) : null}
        </div>

        {activeTab === "mine" ? (
          <>
            <form className="availability-form" action="/api/personal-training/availability" method="post">
              {isAdmin ? (
                <div className="field">
                  <label htmlFor="teacherId">Professor</label>
                  <select id="teacherId" name="teacherId" defaultValue={user.id}>
                    <option value={user.id}>O meu utilizador</option>
                    {teachers.map((teacher) => (
                      <option value={teacher.id} key={teacher.id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="field">
                <label htmlFor="weekday">Dia</label>
                <select id="weekday" name="weekday" required>
                  {poolWeekdays.map((weekday) => (
                    <option value={weekday.key} key={weekday.key}>
                      {weekday.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="startTime">Inicio</label>
                <input id="startTime" name="startTime" type="time" step="300" required />
              </div>
              <div className="field">
                <label htmlFor="endTime">Fim</label>
                <input id="endTime" name="endTime" type="time" step="300" required />
              </div>
              <div className="field">
                <label htmlFor="notes">Notas</label>
                <input id="notes" name="notes" placeholder="Ex.: preferencia de horario" />
              </div>
              <button className="button" type="submit">
                Adicionar disponibilidade
              </button>
            </form>

            <div className="availability-list">
              {myAvailability.length === 0 ? <p className="muted">Ainda nao tens disponibilidade registada.</p> : null}
              {myAvailability.map((item) => (
                <div className="availability-row" key={item.id}>
                  <div>
                    <strong>{poolWeekdays.find((weekday) => weekday.key === item.weekday)?.label}</strong>
                    <small>
                      {formatMinutes(item.startMinutes)} - {formatMinutes(item.endMinutes)}
                    </small>
                    {item.notes ? <small>{item.notes}</small> : null}
                  </div>
                  <form action="/api/personal-training/availability" method="post">
                    <input type="hidden" name="action" value="delete" />
                    <input type="hidden" name="id" value={item.id} />
                    <button className="button danger compact-button" type="submit">
                      Remover
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {activeTab === "map" && isAdmin ? (
          <div className="availability-map-wrap">
            <table className="availability-map">
              <thead>
                <tr>
                  <th>Hora</th>
                  {poolWeekdays.map((weekday) => (
                    <th key={weekday.key}>{weekday.shortLabel}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mapSlots.map((slot) => (
                  <tr key={slot}>
                    <th>{timeValue(slot)}</th>
                    {poolWeekdays.map((weekday) => {
                      const bounds = dayBounds(weekday.key);
                      const outsideBounds = slot < bounds.start || slot >= bounds.end;
                      const items = availabilityForSlot(allAvailability, weekday.key, slot);

                      return (
                        <td className={outsideBounds ? "outside-hours" : items.length > 0 ? "has-availability" : ""} key={weekday.key}>
                          {items.map((item) => (
                            <span className="availability-chip" key={`${item.teacher.name}-${item.startMinutes}-${item.endMinutes}`}>
                              <strong>{item.teacher.name}</strong>
                              <small>
                                {formatMinutes(item.startMinutes)} - {formatMinutes(item.endMinutes)}
                              </small>
                              {item.notes ? <small>{item.notes}</small> : null}
                            </span>
                          ))}
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
    </AppShell>
  );
}
