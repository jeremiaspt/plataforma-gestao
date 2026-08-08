import PDFDocument from "pdfkit/js/pdfkit.standalone";
import { addDays, dateToInputValue, formatMinutes, poolBlockAppliesToDate, poolMaps, poolWeekdays } from "@/lib/pool";
import { printMapPaletteItem, printMapRuleMatches } from "@/lib/printMapColors";
import { prisma } from "@/lib/prisma";

type PrintMode = "day" | "week";

type ScheduleBlock = {
  endMinutes: number;
  id: string;
  laneNumber: number;
  notes: string | null;
  poolKey: string;
  recurrenceType: string;
  startMinutes: number;
  teacher: { name: string } | null;
  title: string;
  type: string;
  validFrom: Date | null;
  validTo: Date | null;
  weekday: number;
};

type PrintColorRule = {
  active: boolean;
  colorKey: string;
  matchPatterns: string;
};

type PrintPage = {
  date: Date;
  endMinutes: number;
  label: string;
  startMinutes: number;
  weekday: number;
};

const poolOrder = [poolMaps.piscina25m, poolMaps.apoioCais, poolMaps.tanqueAprendizagem];
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
const poolWidthWeights: Record<string, number> = {
  apoio_cais: 1.45,
  piscina_25m: 6,
  tanque_aprendizagem: 5
};

function collectPdfBuffer(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function parseInputDate(value?: string) {
  const parsed = value ? new Date(`${value}T00:00:00`) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  date.setHours(0, 0, 0, 0);
  return date;
}

function weekStartDate(value?: string) {
  const date = parseInputDate(value);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(date, offset);
}

function dateForWeekday(startOfWeek: Date, weekday: number) {
  const index = weekday === 0 ? 6 : weekday - 1;
  return addDays(startOfWeek, index);
}

function weekdayLabel(weekday: number) {
  return poolWeekdays.find((item) => item.key === weekday)?.label || "Dia";
}

function filenamePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDate(value: Date) {
  return value.toLocaleDateString("pt-PT");
}

function pageDefinitions(mode: PrintMode, weekday: number, startOfWeek: Date): PrintPage[] {
  const weekdays = mode === "day" ? [weekday] : weekdayOrder;

  return weekdays.flatMap((day) => {
    const date = dateForWeekday(startOfWeek, day);
    if (day === 0 || day === 6) {
      return [
        {
          date,
          endMinutes: 14 * 60,
          label: "08:45 - 14:00",
          startMinutes: 8 * 60 + 45,
          weekday: day
        }
      ];
    }

    return [
      { date, endMinutes: 14 * 60, label: "Manha | 07:00 - 14:00", startMinutes: 7 * 60, weekday: day },
      { date, endMinutes: 21 * 60, label: "Tarde | 14:00 - 21:00", startMinutes: 14 * 60, weekday: day }
    ];
  });
}

function drawTextFit(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  options: { bold?: boolean; color?: string; size?: number } = {}
) {
  doc
    .fillColor(options.color || "#0f172a")
    .font(options.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(options.size || 6)
    .text(text, x, y, { ellipsis: true, lineBreak: false, width });
}

function blockLabel(block: ScheduleBlock) {
  if (block.poolKey === poolMaps.apoioCais.key) {
    return block.teacher?.name || block.title;
  }

  const parts = [block.title];
  if (block.teacher?.name) parts.push(block.teacher.name);
  if (block.notes) parts.push(block.notes);
  return parts.filter(Boolean).join(" - ");
}

function blockColors(block: ScheduleBlock, rules: PrintColorRule[], applies: boolean) {
  if (!applies) {
    return { fill: "#f1f5f9", stroke: "#94a3b8", text: "#64748b" };
  }

  const rule = rules.find((item) => item.active && printMapRuleMatches(block.title, item.matchPatterns));
  if (rule) {
    const color = printMapPaletteItem(rule.colorKey);
    return { fill: color.fill, stroke: color.stroke, text: color.text };
  }

  if (block.type === "treino") {
    return { fill: "#e6f5f2", stroke: "#0f766e", text: "#10233f" };
  }

  return { fill: "#dff0fb", stroke: "#2b6f9c", text: "#10233f" };
}

function drawCenteredBlockText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { bold?: boolean; color?: string; size?: number } = {}
) {
  const fontSize = options.size || 5.4;
  const lines = text.split("\n").filter(Boolean);
  const lineHeight = fontSize * 1.25;
  const textHeight = Math.min(height - 4, lines.length * lineHeight);
  const textY = y + Math.max(2, (height - textHeight) / 2);

  doc.fillColor(options.color || "#0f172a").font(options.bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);

  lines.forEach((line, index) => {
    doc.text(line, x + 2.5, textY + index * lineHeight, {
      align: "center",
      ellipsis: true,
      lineBreak: false,
      width: width - 5
    });
  });
}

function drawPoolGrid({
  blocks,
  colorRules,
  date,
  doc,
  endMinutes,
  gridBottom,
  gridTop,
  startMinutes,
  x,
  width
}: {
  blocks: ScheduleBlock[];
  date: Date;
  doc: PDFKit.PDFDocument;
  endMinutes: number;
  gridBottom: number;
  gridTop: number;
  startMinutes: number;
  width: number;
  x: number;
  colorRules: PrintColorRule[];
}) {
  const headerHeight = 38;
  const bodyTop = gridTop + headerHeight;
  const bodyHeight = gridBottom - bodyTop;
  const minutesRange = endMinutes - startMinutes;
  const groupGap = 4;
  const totalWeight = poolOrder.reduce((total, poolMap) => total + poolWidthWeights[poolMap.key], 0);
  let cursorX = x;

  for (const poolMap of poolOrder) {
    const poolWidth = (width - groupGap * (poolOrder.length - 1)) * (poolWidthWeights[poolMap.key] / totalWeight);
    const laneWidth = poolWidth / poolMap.lanes.length;

    doc.rect(cursorX, gridTop, poolWidth, 20).fill("#0f3d73");
    drawTextFit(doc, poolMap.eyebrow, cursorX + 4, gridTop + 6, poolWidth - 8, { bold: true, color: "#ffffff", size: poolMap.key === "apoio_cais" ? 5.4 : 6.8 });

    poolMap.lanes.forEach((lane, index) => {
      const laneX = cursorX + index * laneWidth;
      doc.rect(laneX, gridTop + 20, laneWidth, 18).fill("#e8f1fb");
      doc.rect(laneX, gridTop + 20, laneWidth, 18).strokeColor("#cbd5e1").lineWidth(0.4).stroke();
      drawTextFit(doc, lane.label, laneX + 2, gridTop + 25, laneWidth - 4, { bold: true, color: "#0f172a", size: 5.8 });
      doc.rect(laneX, bodyTop, laneWidth, bodyHeight).strokeColor("#cbd5e1").lineWidth(0.35).stroke();
    });

    for (let time = startMinutes; time <= endMinutes; time += 5) {
      const y = bodyTop + ((time - startMinutes) / minutesRange) * bodyHeight;
      const major = time % 30 === 0;
      doc
        .moveTo(cursorX, y)
        .lineTo(cursorX + poolWidth, y)
        .strokeColor(major ? "#d1dbe8" : "#eef2f7")
        .lineWidth(major ? 0.28 : 0.18)
        .stroke();
    }

    const poolBlocks = blocks.filter((block) => block.poolKey === poolMap.key);
    for (const block of poolBlocks) {
      const laneIndex = poolMap.lanes.findIndex((lane) => lane.number === block.laneNumber);
      if (laneIndex < 0 || block.endMinutes <= startMinutes || block.startMinutes >= endMinutes) continue;

      const visibleStart = Math.max(block.startMinutes, startMinutes);
      const visibleEnd = Math.min(block.endMinutes, endMinutes);
      const blockX = cursorX + laneIndex * laneWidth + 1.2;
      const blockY = bodyTop + ((visibleStart - startMinutes) / minutesRange) * bodyHeight + 1;
      const blockW = laneWidth - 2.4;
      const blockH = Math.max(14, ((visibleEnd - visibleStart) / minutesRange) * bodyHeight - 2);
      const applies = poolBlockAppliesToDate(block, date);
      const colors = blockColors(block, colorRules, applies);

      doc.roundedRect(blockX, blockY, blockW, blockH, 3).fillAndStroke(colors.fill, colors.stroke);
      if (!applies) {
        doc
          .moveTo(blockX + 2, blockY + 2)
          .lineTo(blockX + blockW - 2, blockY + blockH - 2)
          .strokeColor("#cbd5e1")
          .lineWidth(0.45)
          .stroke();
      }

      const label = `${formatMinutes(block.startMinutes)}-${formatMinutes(block.endMinutes)}\n${blockLabel(block)}`;
      drawCenteredBlockText(doc, label, blockX + 2, blockY + 2, blockW - 4, blockH - 4, { bold: true, color: colors.text, size: blockH < 22 ? 4.3 : 5.2 });
    }

    cursorX += poolWidth + groupGap;
  }
}

function drawTimeAxis(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number, startMinutes: number, endMinutes: number) {
  const headerHeight = 38;
  const bodyTop = y + headerHeight;
  const bodyHeight = height - headerHeight;
  doc.rect(x, y, width, headerHeight).fill("#0f3d73");
  drawTextFit(doc, "Hora", x + 4, y + 13, width - 8, { bold: true, color: "#ffffff", size: 7 });
  doc.rect(x, bodyTop, width, bodyHeight).fill("#f8fafc").strokeColor("#cbd5e1").lineWidth(0.4).stroke();

  for (let time = startMinutes; time <= endMinutes; time += 5) {
    const lineY = bodyTop + ((time - startMinutes) / (endMinutes - startMinutes)) * bodyHeight;
    const major = time % 30 === 0;
    doc
      .moveTo(x, lineY)
      .lineTo(x + width, lineY)
      .strokeColor(major ? "#cbd5e1" : "#e8eef5")
      .lineWidth(major ? 0.25 : 0.16)
      .stroke();
    drawTextFit(doc, formatMinutes(time), x + 2, lineY + 1, width - 4, { bold: major, color: "#0f3d73", size: 4.6 });
  }
}

function drawPage(doc: PDFKit.PDFDocument, page: PrintPage, blocks: ScheduleBlock[], colorRules: PrintColorRule[], pageNumber: number, pageCount: number) {
  const margin = doc.page.margins.left;
  const pageWidth = doc.page.width - margin - doc.page.margins.right;
  const titleY = doc.page.margins.top;
  const gridTop = titleY + 54;
  const gridBottom = doc.page.height - doc.page.margins.bottom - 18;
  const axisWidth = 38;

  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(14).text(weekdayLabel(page.weekday), margin, titleY, {
    width: pageWidth - 120
  });
  doc
    .fillColor("#475569")
    .font("Helvetica")
    .fontSize(8)
    .text(`${formatDate(page.date)} | ${page.label}`, margin, titleY + 19, { width: pageWidth - 120 });
  doc
    .fillColor("#64748b")
    .fontSize(7)
    .text("Piscina 25m | Apoio ao Cais | Tanque de aprendizagem", margin, titleY + 34, { width: pageWidth - 120 });
  doc
    .fillColor("#64748b")
    .fontSize(7)
    .text(`${pageNumber}/${pageCount}`, doc.page.width - doc.page.margins.right - 50, titleY + 3, {
      align: "right",
      width: 50
    });

  drawTimeAxis(doc, margin, gridTop, axisWidth, gridBottom - gridTop, page.startMinutes, page.endMinutes);
  drawPoolGrid({
    blocks,
    date: page.date,
    doc,
    endMinutes: page.endMinutes,
    gridBottom,
    gridTop,
    startMinutes: page.startMinutes,
    width: pageWidth - axisWidth - 6,
    x: margin + axisWidth + 6,
    colorRules
  });

  doc
    .fillColor("#64748b")
    .font("Helvetica")
    .fontSize(6.5)
    .text("Formato fantasma: ocupacao fora do periodo definido para a semana de referencia.", margin, gridBottom + 6, { width: pageWidth });
}

export async function generatePoolSchedulePrintPdf({
  mode,
  weekStart,
  weekday
}: {
  mode: PrintMode;
  weekStart?: string;
  weekday?: number;
}) {
  const startOfWeek = weekStartDate(weekStart);
  const selectedWeekday = weekdayOrder.includes(Number(weekday)) ? Number(weekday) : 1;
  const pages = pageDefinitions(mode, selectedWeekday, startOfWeek);
  const weekdays = Array.from(new Set(pages.map((page) => page.weekday)));
  const [blocks, colorRules] = await Promise.all([
    prisma.poolScheduleBlock.findMany({
    where: {
      active: true,
      poolKey: { in: poolOrder.map((poolMap) => poolMap.key) },
      weekday: { in: weekdays }
    },
    include: {
      teacher: { select: { name: true } }
    },
    orderBy: [{ poolKey: "asc" }, { laneNumber: "asc" }, { startMinutes: "asc" }]
    }),
    prisma.printMapColorRule.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { active: true, colorKey: true, matchPatterns: true }
    })
  ]);

  const doc = new PDFDocument({
    layout: "portrait",
    margin: 24,
    size: "A4"
  });

  pages.forEach((page, index) => {
    if (index > 0) doc.addPage();
    drawPage(
      doc,
      page,
      blocks.filter((block) => block.weekday === page.weekday),
      colorRules,
      index + 1,
      pages.length
    );
  });

  const buffer = await collectPdfBuffer(doc);
  const scope = mode === "week" ? "semana" : filenamePart(weekdayLabel(selectedWeekday));
  return {
    buffer,
    filename: `impressao-mapa-${scope}-${dateToInputValue(startOfWeek)}.pdf`,
    pageCount: pages.length
  };
}
