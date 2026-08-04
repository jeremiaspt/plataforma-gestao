import { getGroupClassScheduleEmailSettings, parseEmailList, sendResendEmail } from "@/lib/email";
import { getHolidayForDate } from "@/lib/holidays";
import { getSystemSettings } from "@/lib/maintenance";
import { dateToInputValue, formatMinutes, poolBlockAppliesToDate, poolMaps, poolWeekdays } from "@/lib/pool";
import { prisma } from "@/lib/prisma";

type ScheduleBlock = {
  id: string;
  poolKey: string;
  weekday: number;
  startMinutes: number;
  endMinutes: number;
  title: string;
  notes: string | null;
  laneNumber: number;
  recurrenceType?: string | null;
  validFrom?: Date | null;
  validTo?: Date | null;
};

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function weekdayDate(weekStart: Date, weekday: number) {
  return addDays(weekStart, weekday === 0 ? 6 : weekday - 1);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function poolLabel(poolKey: string) {
  return Object.values(poolMaps).find((poolMap) => poolMap.key === poolKey)?.eyebrow || poolKey;
}

function laneLabel(poolKey: string, laneNumber: number) {
  const poolMap = Object.values(poolMaps).find((map) => map.key === poolKey);
  return poolMap?.lanes.find((lane) => lane.number === laneNumber)?.label || `${poolMap?.laneFieldLabel || "Espaço"} ${laneNumber}`;
}

function mergeSameClassBlocks(blocks: ScheduleBlock[]) {
  const merged = new Map<string, ScheduleBlock & { laneNumbers: number[] }>();

  for (const block of blocks) {
    const key = [block.poolKey, block.startMinutes, block.title, block.notes || ""].join("|");
    const current = merged.get(key);

    if (!current) {
      merged.set(key, { ...block, laneNumbers: [block.laneNumber] });
      continue;
    }

    current.endMinutes = Math.max(current.endMinutes, block.endMinutes);
    current.laneNumbers.push(block.laneNumber);
  }

  return Array.from(merged.values()).map((block) => ({
    ...block,
    laneNumbers: Array.from(new Set(block.laneNumbers)).sort((a, b) => a - b)
  }));
}

function groupedDayBlocks(blocks: ScheduleBlock[], date: Date, weekday: number) {
  const grouped = new Map<
    string,
    {
      poolKey: string;
      startMinutes: number;
      endMinutes: number;
      classes: Map<string, { title: string; notes: string | null; laneNumbers: number[] }>;
    }
  >();
  const dayBlocks = mergeSameClassBlocks(blocks.filter((item) => item.weekday === weekday && poolBlockAppliesToDate(item, date)));

  for (const block of dayBlocks) {
    const groupKey = [block.poolKey, block.startMinutes, block.endMinutes].join("|");
    const current =
      grouped.get(groupKey) ||
      {
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

    currentClass.laneNumbers.push(...block.laneNumbers);
    current.classes.set(classKey, currentClass);
    grouped.set(groupKey, current);
  }

  return Array.from(grouped.values()).map((group) => ({
    ...group,
    classes: Array.from(group.classes.values()).map((classItem) => ({
      ...classItem,
      laneNumbers: Array.from(new Set(classItem.laneNumbers)).sort((a, b) => a - b)
    }))
  }));
}

type GroupedDayBlock = ReturnType<typeof groupedDayBlocks>[number];

function renderClassItems(group: GroupedDayBlock) {
  return group.classes
    .map((classItem) => {
      const lanes = classItem.laneNumbers.map((laneNumber) => laneLabel(group.poolKey, laneNumber)).join(", ");
      const notes = classItem.notes ? `<div style="color:#64748b;font-size:11px;margin-top:2px;">${escapeHtml(classItem.notes)}</div>` : "";

      return `
        <div style="border-top:1px solid #e2e8f0;padding-top:6px;margin-top:6px;">
          <div style="font-weight:700;color:#0f172a;">${escapeHtml(classItem.title)}</div>
          <div style="font-size:12px;color:#475569;">${escapeHtml(lanes)}</div>
          ${notes}
        </div>
      `;
    })
    .join("");
}

function renderGroupCard(group: GroupedDayBlock) {
  return `
    <div style="background:#ffffff;border:1px solid #d8e4ef;border-radius:7px;border-left:4px solid #0f766e;margin-top:8px;padding:8px;">
      <div style="font-size:13px;font-weight:800;color:#0f766e;">${formatMinutes(group.startMinutes)} - ${formatMinutes(group.endMinutes)}</div>
      <div style="font-size:12px;color:#475569;margin-top:2px;">${escapeHtml(poolLabel(group.poolKey))}</div>
      ${renderClassItems(group)}
    </div>
  `;
}

function renderDayCard({
  date,
  dayBlocks,
  holidayName,
  weekdayLabel
}: {
  date: Date;
  dayBlocks: GroupedDayBlock[];
  holidayName?: string;
  weekdayLabel: string;
}) {
  const body = holidayName
    ? `<div style="background:#fee2e2;border:1px solid #fecaca;border-radius:7px;color:#991b1b;font-size:12px;margin-top:8px;padding:8px;">${escapeHtml(holidayName)}</div>`
    : dayBlocks.length === 0
      ? `<div style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:7px;color:#64748b;font-size:12px;margin-top:8px;padding:8px;">Sem aulas.</div>`
      : dayBlocks.map(renderGroupCard).join("");

  return `
    <td style="vertical-align:top;width:14.28%;padding:4px;">
      <div style="background:#f8fafc;border:1px solid #d8e4ef;border-radius:8px;min-height:120px;padding:8px;">
        <div style="font-size:13px;font-weight:800;color:#0f172a;">${escapeHtml(weekdayLabel)}</div>
        <div style="font-size:12px;color:#64748b;">${date.toLocaleDateString("pt-PT")}</div>
        ${body}
      </div>
    </td>
  `;
}

async function logEmail({
  status,
  toEmail,
  ccEmails,
  subject,
  providerId,
  error,
  teacherId
}: {
  status: string;
  toEmail: string;
  ccEmails: string;
  subject: string;
  providerId?: string | null;
  error?: string;
  teacherId: string;
}) {
  await prisma.emailLog.create({
    data: {
      type: "group_class_schedule",
      status,
      toEmail,
      ccEmails,
      subject,
      providerId,
      paymentId: teacherId,
      error
    }
  });
}

export async function sendGroupClassScheduleEmail({ teacherId, weekStart }: { teacherId: string; weekStart: Date }) {
  const settings = await getGroupClassScheduleEmailSettings();
  const systemSettings = await getSystemSettings();
  const cc = parseEmailList(settings.ccEmails);
  const teacher = await prisma.user.findFirst({
    where: {
      id: teacherId,
      active: true,
      roles: { some: { role: { key: "professor" } } }
    },
    select: { id: true, email: true, name: true }
  });

  if (!teacher) {
    return { ok: false, reason: "Professor inválido." };
  }

  const blocks = await prisma.poolScheduleBlock.findMany({
    where: {
      active: true,
      teacherId,
      type: "aula"
    },
    orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }, { poolKey: "asc" }, { laneNumber: "asc" }]
  });
  const holidayOptions = {
    includeChristmasEveHoliday: systemSettings.includeChristmasEveHoliday,
    includeLisbonMunicipalHolidays: systemSettings.includeLisbonMunicipalHolidays,
    includeNewYearsEveHoliday: systemSettings.includeNewYearsEveHoliday
  };
  const weekEnd = addDays(weekStart, 6);
  const subject = `Mapa de aulas de grupo - ${teacher.name} - ${weekStart.toLocaleDateString("pt-PT")} a ${weekEnd.toLocaleDateString("pt-PT")}`;

  if (!settings.enabled) {
    await logEmail({
      status: "skipped",
      toEmail: teacher.email,
      ccEmails: cc.join(", "),
      subject,
      teacherId,
      error: "Envio desativado nas configurações."
    });
    return { ok: false, reason: "Envio desativado." };
  }

  const textLines = [`Olá ${teacher.name},`, "", `Segue o teu mapa de aulas de grupo de ${weekStart.toLocaleDateString("pt-PT")} a ${weekEnd.toLocaleDateString("pt-PT")}.`, ""];
  const dayCells: string[] = [];

  for (const weekday of poolWeekdays) {
    const date = weekdayDate(weekStart, weekday.key);
    const holiday = getHolidayForDate(date, holidayOptions);
    const dayBlocks = holiday ? [] : groupedDayBlocks(blocks, date, weekday.key);

    textLines.push(`${weekday.label}, ${date.toLocaleDateString("pt-PT")}`);

    if (holiday) {
      textLines.push(`- ${holiday.name}`);
      dayCells.push(renderDayCard({ date, dayBlocks: [], holidayName: holiday.name, weekdayLabel: weekday.label }));
      continue;
    }

    if (dayBlocks.length === 0) {
      textLines.push("- Sem aulas.");
      dayCells.push(renderDayCard({ date, dayBlocks, weekdayLabel: weekday.label }));
      continue;
    }

    dayCells.push(renderDayCard({ date, dayBlocks, weekdayLabel: weekday.label }));

    for (const group of dayBlocks) {
      textLines.push(`- ${formatMinutes(group.startMinutes)} - ${formatMinutes(group.endMinutes)} | ${poolLabel(group.poolKey)}`);
      for (const classItem of group.classes) {
        const lanes = classItem.laneNumbers.map((laneNumber) => laneLabel(group.poolKey, laneNumber)).join(", ");
        textLines.push(`  ${classItem.title}${classItem.notes ? ` (${classItem.notes})` : ""} - ${lanes}`);
      }
    }
  }

  const html = `
    <div style="background:#eef3f7;font-family:Arial,sans-serif;line-height:1.45;padding:18px;color:#0f172a;">
      <div style="background:#ffffff;border:1px solid #d8e4ef;border-radius:10px;padding:18px;">
        <p style="color:#475569;font-size:13px;margin:0 0 4px;">Aulas de grupo</p>
        <h2 style="font-size:24px;line-height:1.15;margin:0 0 8px;">Mapa semanal</h2>
        <p style="color:#475569;margin:0 0 16px;">
          Olá ${escapeHtml(teacher.name)}, segue o teu mapa de aulas de grupo de
          <strong>${weekStart.toLocaleDateString("pt-PT")}</strong> a <strong>${weekEnd.toLocaleDateString("pt-PT")}</strong>.
        </p>
        <table role="presentation" style="border-collapse:separate;border-spacing:0;width:100%;">
          <tr>${dayCells.join("")}</tr>
        </table>
      </div>
    </div>
  `;
  try {
    const providerId = await sendResendEmail({
      to: teacher.email,
      cc,
      subject,
      html,
      text: textLines.join("\n")
    });

    await logEmail({
      status: "sent",
      toEmail: teacher.email,
      ccEmails: cc.join(", "),
      subject,
      providerId,
      teacherId
    });
    return { ok: true };
  } catch (error) {
    await logEmail({
      status: "failed",
      toEmail: teacher.email,
      ccEmails: cc.join(", "),
      subject,
      teacherId,
      error: error instanceof Error ? error.message : "Erro desconhecido"
    });
    return { ok: false, reason: "Erro no envio." };
  }
}
