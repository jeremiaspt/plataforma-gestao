import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dateToInputValue, formatMinutes, parseDateParam, poolBlockAppliesToDate, poolMaps, poolWeekdays } from "@/lib/pool";

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  const weekday = start.getDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  start.setDate(start.getDate() + offset);
  start.setHours(0, 0, 0, 0);
  return start;
}

function weekdayDate(weekStart: Date, weekday: number) {
  return addDays(weekStart, weekday === 0 ? 6 : weekday - 1);
}

function poolLabel(poolKey: string) {
  return Object.values(poolMaps).find((poolMap) => poolMap.key === poolKey)?.eyebrow || poolKey;
}

function laneLabel(poolKey: string, laneNumber: number) {
  const poolMap = Object.values(poolMaps).find((map) => map.key === poolKey);
  return poolMap?.lanes.find((lane) => lane.number === laneNumber)?.label || `${poolMap?.laneFieldLabel || "Espaço"} ${laneNumber}`;
}

export default async function GroupClassesPage({
  searchParams
}: {
  searchParams: Promise<{ teacherId?: string; tab?: string; week?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const roleKeys = user.roles.map((userRole) => userRole.role.key);
  const isAdmin = hasRole(user, "admin");
  const isProfessor = hasRole(user, "professor");

  if (!isAdmin && !isProfessor) {
    redirect("/dashboard");
  }

  const teachers = isAdmin
    ? await prisma.user.findMany({
        where: {
          active: true,
          roles: { some: { role: { key: "professor" } } }
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true }
      })
    : [];

  const activeTab = isAdmin && params.tab === "professor" ? "professor" : "mine";
  const selectedTeacherId = activeTab === "professor" ? params.teacherId || teachers[0]?.id || user.id : user.id;
  const selectedTeacherName =
    activeTab === "professor" ? teachers.find((teacher) => teacher.id === selectedTeacherId)?.name || "Professor" : user.name;
  const selectedWeekStart = startOfWeek(parseDateParam(params.week));
  const selectedWeekValue = dateToInputValue(selectedWeekStart);
  const previousWeek = dateToInputValue(addDays(selectedWeekStart, -7));
  const nextWeek = dateToInputValue(addDays(selectedWeekStart, 7));
  const currentWeek = dateToInputValue(startOfWeek(new Date()));
  const tabHref = (tab: "mine" | "professor") => `/aulas-grupo?tab=${tab}&week=${selectedWeekValue}`;

  const blocks = await prisma.poolScheduleBlock.findMany({
    where: {
      active: true,
      teacherId: selectedTeacherId,
      type: "aula"
    },
    orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }, { poolKey: "asc" }, { laneNumber: "asc" }]
  });

  const classesByWeekday = new Map<
    number,
    Array<{
      id: string;
      poolKey: string;
      startMinutes: number;
      endMinutes: number;
      classes: Array<{
        title: string;
        notes: string | null;
        laneNumbers: number[];
      }>;
    }>
  >();

  for (const weekday of poolWeekdays) {
    const date = weekdayDate(selectedWeekStart, weekday.key);
    const grouped = new Map<
      string,
      {
        id: string;
        poolKey: string;
        startMinutes: number;
        endMinutes: number;
        classes: Map<
          string,
          {
            title: string;
            notes: string | null;
            laneNumbers: number[];
          }
        >;
      }
    >();

    for (const block of blocks.filter((item) => item.weekday === weekday.key && poolBlockAppliesToDate(item, date))) {
      const groupKey = [block.poolKey, block.startMinutes, block.endMinutes].join("|");
      const current =
        grouped.get(groupKey) ||
        {
          id: block.id,
          poolKey: block.poolKey,
          startMinutes: block.startMinutes,
          endMinutes: block.endMinutes,
          classes: new Map()
        };
      const classKey = [block.title, block.notes || ""].join("|");
      const currentClass =
        current.classes.get(classKey) ||
        {
          title: block.title,
          notes: block.notes,
          laneNumbers: []
        };

      currentClass.laneNumbers.push(block.laneNumber);
      current.classes.set(classKey, currentClass);
      grouped.set(groupKey, current);
    }

    classesByWeekday.set(
      weekday.key,
      Array.from(grouped.values()).map((group) => ({
        id: group.id,
        poolKey: group.poolKey,
        startMinutes: group.startMinutes,
        endMinutes: group.endMinutes,
        classes: Array.from(group.classes.values()).map((classItem) => ({
          ...classItem,
          laneNumbers: Array.from(new Set(classItem.laneNumbers)).sort((a, b) => a - b)
        }))
      }))
    );
  }

  const totalClasses = Array.from(classesByWeekday.values()).reduce((total, dayBlocks) => total + dayBlocks.length, 0);

  return (
    <AppShell userName={user.name} roles={roleKeys}>
      <section className="panel group-classes-panel">
        <div className="topbar">
          <div>
            <p className="eyebrow">Professores</p>
            <h1>Aulas de grupo</h1>
            <p className="muted">
              Horário semanal de {selectedTeacherName}, de {selectedWeekStart.toLocaleDateString("pt-PT")} a{" "}
              {addDays(selectedWeekStart, 6).toLocaleDateString("pt-PT")}.
            </p>
          </div>
          <span className="status active">{totalClasses} aulas</span>
        </div>

        <div className="tabs">
          <a className={activeTab === "mine" ? "tab active" : "tab"} href={tabHref("mine")}>
            As minhas aulas
          </a>
          {isAdmin ? (
            <a className={activeTab === "professor" ? "tab active" : "tab"} href={tabHref("professor")}>
              Consultar professor
            </a>
          ) : null}
        </div>

        <div className="group-classes-toolbar">
          <div className="date-nav group-week-nav">
            <a className="button secondary" href={`/aulas-grupo?tab=${activeTab}&teacherId=${selectedTeacherId}&week=${previousWeek}`}>
              Semana anterior
            </a>
            <a className="button secondary" href={`/aulas-grupo?tab=${activeTab}&teacherId=${selectedTeacherId}&week=${currentWeek}`}>
              Semana atual
            </a>
            <a className="button secondary" href={`/aulas-grupo?tab=${activeTab}&teacherId=${selectedTeacherId}&week=${nextWeek}`}>
              Semana seguinte
            </a>
          </div>

          {activeTab === "professor" && isAdmin ? (
            <form className="teacher-filter group-teacher-filter" method="get" action="/aulas-grupo">
              <input type="hidden" name="tab" value="professor" />
              <input type="hidden" name="week" value={selectedWeekValue} />
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
                Ver
              </button>
            </form>
          ) : null}
        </div>

        <div className="group-week-grid">
          {poolWeekdays.map((weekday) => {
            const dayDate = weekdayDate(selectedWeekStart, weekday.key);
            const dayBlocks = classesByWeekday.get(weekday.key) || [];

            return (
              <section className="group-day-card" key={weekday.key}>
                <div className="group-day-header">
                  <strong>{weekday.label}</strong>
                  <span>{dayDate.toLocaleDateString("pt-PT")}</span>
                </div>
                <div className="group-class-list">
                  {dayBlocks.length === 0 ? <p className="muted">Sem aulas.</p> : null}
                  {dayBlocks.map((group) => {
                    const poolMap = Object.values(poolMaps).find((map) => map.key === group.poolKey);
                    const dateValue = dateToInputValue(dayDate);
                    const href = poolMap ? `${poolMap.basePath}?date=${dateValue}` : "#";

                    return (
                      <a className="group-class-card" href={href} key={group.id}>
                        <span className="group-class-time">
                          {formatMinutes(group.startMinutes)} - {formatMinutes(group.endMinutes)}
                        </span>
                        <span>{poolLabel(group.poolKey)}</span>
                        <div className="group-class-items">
                          {group.classes.map((classItem) => {
                            const lanes = classItem.laneNumbers.map((laneNumber) => laneLabel(group.poolKey, laneNumber)).join(", ");

                            return (
                              <div className="group-class-item" key={`${classItem.title}-${classItem.notes || ""}`}>
                                <strong>{classItem.title}</strong>
                                <span>{lanes}</span>
                                {classItem.notes ? <small>{classItem.notes}</small> : null}
                              </div>
                            );
                          })}
                        </div>
                      </a>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
