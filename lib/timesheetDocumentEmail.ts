import PDFDocument from "pdfkit/js/pdfkit.standalone";
import { currentBillingMonthValue, formatBillingPeriod, getBillingCycleLabel } from "@/lib/billingCycles";
import { getTimesheetDocumentsEmailSettings, parseEmailList, sendTransactionalEmail } from "@/lib/email";
import { calculateGroupClassTimesheet } from "@/lib/groupClassTimesheet";
import { getSystemSettings } from "@/lib/maintenance";
import { formatCurrency } from "@/lib/money";
import { calculatePersonalTrainingTimesheet, eachPeriodDate } from "@/lib/personalTrainingTimesheet";
import { dateToInputValue, formatMinutes, getPoolMapByKey } from "@/lib/pool";
import { prisma } from "@/lib/prisma";

type PdfAttachment = {
  content: string;
  filename: string;
};

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function weekdayShortLabel(date: Date) {
  return ["D", "2a", "3a", "4a", "5a", "6a", "S"][date.getDay()];
}

function formatCellValue(value: number) {
  if (!value) return "";
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2).replace(".", ",");
}

function formatDateValue(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-PT");
}

function filenamePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function classLabel(block: { poolKey: string; laneNumber: number }) {
  const poolMap = getPoolMapByKey(block.poolKey);
  const lane = poolMap.lanes.find((item) => item.number === block.laneNumber);
  return `${poolMap.eyebrow} - ${lane?.label || `${poolMap.laneFieldLabel} ${block.laneNumber}`}`;
}

function collectPdfBuffer(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed = 42) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function writeHeading(doc: PDFKit.PDFDocument, title: string, subtitle: string, total: string) {
  const topY = doc.y;
  const totalWidth = 120;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(16).text(title, doc.page.margins.left, topY, {
    width: contentWidth - totalWidth - 12
  });
  doc.moveDown(0.2);
  doc.fillColor("#475569").font("Helvetica").fontSize(9).text(subtitle, {
    width: contentWidth - totalWidth - 12
  });
  const leftY = doc.y;
  doc.fillColor("#0f766e").font("Helvetica-Bold").fontSize(11).text(total, doc.page.width - doc.page.margins.right - totalWidth, topY, {
    align: "right",
    width: totalWidth
  });
  doc.y = Math.max(leftY, topY + 24);
  doc.moveDown(0.8);
}

function writeSectionTitle(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
  ensureSpace(doc, 34);
  doc.moveDown(0.6);
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.x = doc.page.margins.left;
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(11).text(title, doc.page.margins.left, doc.y, {
    width
  });
  if (subtitle) {
    doc.fillColor("#64748b").font("Helvetica").fontSize(8).text(subtitle, doc.page.margins.left, doc.y, {
      width
    });
  }
  doc.moveDown(0.3);
}

function writeNote(doc: PDFKit.PDFDocument, text: string) {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  ensureSpace(doc, 18);
  doc.x = doc.page.margins.left;
  doc.fillColor("#64748b").font("Helvetica").fontSize(7).text(text, doc.page.margins.left, doc.y, {
    width
  });
  doc.moveDown(0.25);
}

function drawCell(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: { align?: "left" | "center" | "right"; bold?: boolean; fill?: string; textColor?: string }
) {
  const isMultiline = text.includes("\n");
  const textTop = isMultiline ? y + 1.6 : y + 4.4;
  if (options?.fill) {
    doc.rect(x, y, width, height).fill(options.fill);
  }
  doc.rect(x, y, width, height).strokeColor("#cbd5e1").lineWidth(0.4).stroke();
  if (isMultiline) {
    const lines = text.split("\n");
    doc
      .fillColor(options?.textColor || "#0f172a")
      .font(options?.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(5.2)
      .text(lines[0] || "", x + 2, y + 1.7, { align: options?.align || "center", lineBreak: false, width: width - 4 })
      .text(lines[1] || "", x + 2, y + 8, { align: options?.align || "center", lineBreak: false, width: width - 4 });
    return;
  }
  doc
    .fillColor(options?.textColor || "#0f172a")
    .font(options?.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(5.5)
    .text(text, x + 2, textTop, { align: options?.align || "center", height: height - 3, lineBreak: isMultiline, width: width - 4 });
}

function drawTimesheetTable({
  doc,
  firstColumns,
  rows,
  periodDates,
  totalColumns
}: {
  doc: PDFKit.PDFDocument;
  firstColumns: Array<{ key: string; label: string; width: number }>;
  rows: Array<{ cells: Record<string, string>; id: string }>;
  periodDates: Date[];
  totalColumns: Array<{ key: string; label: string; width: number }>;
}) {
  const startX = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const fixedWidth = [...firstColumns, ...totalColumns].reduce((total, column) => total + column.width, 0);
  const dayWidth = Math.max(12, (usableWidth - fixedWidth) / periodDates.length);
  const rowHeight = 15;
  let y = doc.y;

  const drawHeader = () => {
    let x = startX;
    for (const column of firstColumns) {
      drawCell(doc, column.label, x, y, column.width, rowHeight, { bold: true, fill: "#e8f1fb" });
      x += column.width;
    }
    for (const date of periodDates) {
      const dateValue = `${date.getDate()}\n${weekdayShortLabel(date)}`;
      drawCell(doc, dateValue, x, y, dayWidth, rowHeight, {
        bold: true,
        fill: date.getDay() === 0 || date.getDay() === 6 ? "#2563a6" : "#15558a",
        textColor: "#ffffff"
      });
      x += dayWidth;
    }
    for (const column of totalColumns) {
      drawCell(doc, column.label, x, y, column.width, rowHeight, { bold: true, fill: "#e8f1fb" });
      x += column.width;
    }
    y += rowHeight;
  };

  drawHeader();
  for (const row of rows) {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }

    let x = startX;
    for (const column of firstColumns) {
      drawCell(doc, row.cells[column.key] || "", x, y, column.width, rowHeight, { align: column.key === "name" ? "left" : "center", fill: "#f8fafc" });
      x += column.width;
    }
    for (const date of periodDates) {
      drawCell(doc, row.cells[dateToInputValue(date)] || "", x, y, dayWidth, rowHeight, { fill: date.getDay() === 0 || date.getDay() === 6 ? "#eef6ff" : "#ffffff" });
      x += dayWidth;
    }
    for (const column of totalColumns) {
      drawCell(doc, row.cells[column.key] || "", x, y, column.width, rowHeight, { bold: true, fill: "#f1f5f9" });
      x += column.width;
    }
    y += rowHeight;
  }
  doc.y = y + 8;
}

function writeBulletLines(doc: PDFKit.PDFDocument, lines: string[], columns = 1) {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const gap = 10;
  const columnCount = Math.max(1, columns);
  const columnWidth = (width - gap * (columnCount - 1)) / columnCount;
  let columnIndex = 0;
  let y = doc.y;
  const startY = doc.y;
  let pageBottom = doc.page.height - doc.page.margins.bottom;

  for (const line of lines) {
    const text = `- ${line}`;
    const height = doc.heightOfString(text, { width: columnWidth }) + 3;
    if (y + height > pageBottom) {
      columnIndex += 1;
      if (columnIndex >= columnCount) {
        doc.addPage();
        columnIndex = 0;
        y = doc.page.margins.top;
        pageBottom = doc.page.height - doc.page.margins.bottom;
      } else {
        y = startY;
      }
    }
    const x = doc.page.margins.left + columnIndex * (columnWidth + gap);
    doc.fillColor("#0f172a").font("Helvetica").fontSize(6.5).text(text, x, y, {
      width: columnWidth
    });
    y += height;
  }
  doc.y = y + 4;
}

export async function generateGroupHoursPdf({ month, teacherId }: { month?: string; teacherId: string }) {
  const systemSettings = await getSystemSettings();
  const timesheet = await calculateGroupClassTimesheet({
    excludeDockSupportOverlapWithClasses: systemSettings.excludeDockSupportOverlapWithClasses,
    holidayOptions: {
      includeChristmasEveHoliday: systemSettings.includeChristmasEveHoliday,
      includeLisbonMunicipalHolidays: systemSettings.includeLisbonMunicipalHolidays,
      includeNewYearsEveHoliday: systemSettings.includeNewYearsEveHoliday
    },
    month,
    teacherId
  });

  if (!timesheet) return null;

  const periodDates = eachPeriodDate(timesheet.period.start, timesheet.period.endExclusive);
  const grandTotal = timesheet.rows.reduce((total, row) => total + row.totalValue, 0);
  const doc = new PDFDocument({ margin: 24, size: "A4", layout: "landscape" });
  writeHeading(
    doc,
    "Folha de horas - aulas de grupo",
    `${timesheet.teacher.name} - ${formatBillingPeriod(timesheet.period.start, timesheet.period.endExclusive)}`,
    formatCurrency(grandTotal)
  );
  const groupRows = timesheet.rows.map((row) => {
    const cells: Record<string, string> = {
      name: row.name,
      partial: formatCurrency(row.totalValue),
      rate: row.hourlyRate.toFixed(2).replace(".", ","),
      total: row.totalHours.toFixed(2).replace(".", ",")
    };
    for (const date of periodDates) {
      const dateValue = dateToInputValue(date);
      const count = row.dayCounts.get(dateValue) || 0;
      const hours = row.dayHours.get(dateValue) || 0;
      cells[dateValue] = row.calculationMode === "minutes" ? formatCellValue(hours) : formatCellValue(count);
    }
    return { id: row.id, cells };
  });

  drawTimesheetTable({
    doc,
    firstColumns: [
      { key: "name", label: "Caract.", width: 86 },
      { key: "rate", label: "Valor/hora", width: 38 }
    ],
    periodDates,
    rows: groupRows,
    totalColumns: [
      { key: "total", label: "Total horas", width: 44 },
      { key: "partial", label: "Parcial", width: 48 }
    ]
  });

  if (timesheet.absenceDetails.length > 0) {
    writeSectionTitle(doc, "Faltas", "Aulas retiradas desta folha por substituicao.");
    writeBulletLines(
      doc,
      timesheet.absenceDetails.map(
        (item) =>
          `${formatDateValue(item.date)} - ${formatMinutes(item.startMinutes)}-${formatMinutes(item.endMinutes)} - ${item.title}${
            item.accumulation ? " (ACUM.)" : ""
          } - ${classLabel(item)} - Substituto: ${item.substituteTeacherName}`
      ),
      2
    );
  }

  if (timesheet.extraDetails.length > 0) {
    writeSectionTitle(doc, "Extras", "Substituicoes feitas por outros professores neste periodo.");
    writeBulletLines(
      doc,
      timesheet.extraDetails.map(
        (item) =>
          `${formatDateValue(item.date)} - ${formatMinutes(item.startMinutes)}-${formatMinutes(item.endMinutes)} - ${item.title}${
            item.accumulation ? " (ACUM.)" : ""
          } - ${classLabel(item)} - Por: ${item.absentTeacherName}`
      ),
      2
    );
  }

  if (timesheet.otherDetails.length > 0) {
    writeSectionTitle(doc, "Outros", "Outros registos considerados na folha.");
    writeBulletLines(
      doc,
      timesheet.otherDetails.map((item) => `${formatDateValue(item.date)} - ${formatMinutes(item.startMinutes)}-${formatMinutes(item.endMinutes)} - ${item.title} - ${item.responsibleName}`),
      2
    );
  }

  const buffer = await collectPdfBuffer(doc);
  return {
    buffer,
    filename: `folha-horas-${filenamePart(timesheet.teacher.name)}-${month || currentBillingMonthValue()}.pdf`,
    timesheet
  };
}

export async function generatePersonalTrainingPdf({ month, teacherId }: { month?: string; teacherId: string }) {
  const timesheet = await calculatePersonalTrainingTimesheet({ month, teacherId });
  if (!timesheet) return null;

  const periodDates = eachPeriodDate(timesheet.period.start, timesheet.period.endExclusive);
  const periodMonthKeys = Array.from(new Set(periodDates.map((date) => monthKey(date))));
  const grandTotal = timesheet.rows.reduce((total, row) => total + row.totalValue, 0);
  const doc = new PDFDocument({ margin: 24, size: "A4", layout: "landscape" });
  writeHeading(
    doc,
    "Folha de treinos personalizados",
    `${timesheet.teacher.name} - ${formatBillingPeriod(timesheet.period.start, timesheet.period.endExclusive)} - ${getBillingCycleLabel(timesheet.teacher.billingCycle)}`,
    formatCurrency(grandTotal)
  );
  const trainingRows = timesheet.rows.map((row) => {
    const cells: Record<string, string> = {
      name: row.name,
      partial: formatCurrency(row.totalValue),
      students: String(row.studentCount),
      total: formatCellValue(row.totalLessons),
      value: formatCurrency(row.valuePerStudent)
    };
    for (const date of periodDates) {
      const dateValue = dateToInputValue(date);
      cells[dateValue] = formatCellValue(row.dayLessons.get(dateValue) || 0);
    }
    return { id: row.id, cells };
  });

  drawTimesheetTable({
    doc,
    firstColumns: [
      { key: "name", label: "Caract.", width: 76 },
      { key: "students", label: "N. alunos", width: 34 },
      { key: "value", label: "Valor/aluno", width: 42 }
    ],
    periodDates,
    rows: trainingRows,
    totalColumns: [
      { key: "total", label: "Total aulas", width: 44 },
      { key: "partial", label: "Parcial", width: 48 }
    ]
  });

  if (periodMonthKeys.length > 1) {
    writeNote(doc, "Nota: esta folha inclui dias de dois meses por causa do ciclo de faturacao do professor.");
  }

  if (timesheet.studentDetails.length > 0) {
    writeSectionTitle(doc, "Detalhe por utente", "Pagamentos considerados neste ciclo, agrupados por utente e duracao.");
    writeBulletLines(
      doc,
      timesheet.studentDetails.map((item) => {
        const students = item.students.map((student) => `${student.memberNumber} - ${student.fullName}`).join(" / ");
        return `${students} ${item.trainingLabel} (${item.days.join(", ")})`;
      }),
      3
    );
  }

  if (timesheet.unmatched.length > 0) {
    writeSectionTitle(doc, "Pagamentos sem Caract.", "Pagamentos que existem, mas ainda nao entram em nenhuma regra da folha de treinos.");
    writeBulletLines(
      doc,
      timesheet.unmatched.map((item) => `${item.date} - ${item.student} - ${item.paymentType} - ${formatCellValue(item.lessons)} aulas - ${formatCurrency(item.value)}`),
      3
    );
  }

  const buffer = await collectPdfBuffer(doc);
  return {
    buffer,
    filename: `folha-treinos-${filenamePart(timesheet.teacher.name)}-${month || currentBillingMonthValue()}.pdf`,
    timesheet
  };
}

export async function sendTimesheetDocumentsEmail({
  documentType,
  month,
  teacherId
}: {
  documentType: "group" | "personal" | "both";
  month?: string;
  teacherId: string;
}) {
  const settings = await getTimesheetDocumentsEmailSettings();
  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, active: true, roles: { some: { role: { key: "professor" } } } },
    select: { email: true, id: true, name: true }
  });

  if (!teacher) {
    return { ok: false, reason: "Professor invalido." };
  }

  const selectedMonth = month || currentBillingMonthValue();
  const subject = `Folhas - ${teacher.name} - ${selectedMonth}`;
  const cc = parseEmailList(settings.ccEmails);

  if (!settings.enabled) {
    await prisma.emailLog.create({
      data: {
        type: "timesheet_documents",
        status: "skipped",
        toEmail: teacher.email,
        ccEmails: cc.join(", "),
        subject,
        paymentId: teacher.id,
        error: "Envio desativado nas configuracoes."
      }
    });
    return { ok: false, reason: "Envio desativado." };
  }

  try {
    const attachments: PdfAttachment[] = [];
  if (documentType === "group" || documentType === "both") {
    const groupPdf = await generateGroupHoursPdf({ month: selectedMonth, teacherId });
    if (groupPdf) {
      attachments.push({ filename: groupPdf.filename, content: groupPdf.buffer.toString("base64") });
    }
  }
  if (documentType === "personal" || documentType === "both") {
    const personalPdf = await generatePersonalTrainingPdf({ month: selectedMonth, teacherId });
    if (personalPdf) {
      attachments.push({ filename: personalPdf.filename, content: personalPdf.buffer.toString("base64") });
    }
  }

  if (attachments.length === 0) {
    throw new Error("Sem documentos para enviar.");
  }

  const previewText = `Folhas em anexo - ${teacher.name} - ${selectedMonth}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${previewText}</div>
      <p style="color:#475569;font-size:13px;margin:0 0 4px;">${previewText}</p>
      <h2>Folhas em anexo</h2>
      <p>Olá ${teacher.name},</p>
      <p>Segue em anexo a documentação selecionada referente ao período ${selectedMonth}.</p>
    </div>
  `;
  const text = `Olá ${teacher.name},\n\nSegue em anexo a documentação selecionada referente ao período ${selectedMonth}.`;

    const emailResult = await sendTransactionalEmail({
      attachments,
      cc,
      html,
      subject,
      text: `${previewText}\n\n${text}`,
      to: teacher.email,
      emailType: "timesheet_documents"
    });

    await prisma.emailLog.create({
      data: {
        type: "timesheet_documents",
        status: "sent",
        toEmail: teacher.email,
        ccEmails: cc.join(", "),
        subject,
        provider: emailResult.provider,
        providerId: emailResult.providerId,
        paymentId: teacher.id
      }
    });
    return { ok: true };
  } catch (error) {
    await prisma.emailLog.create({
      data: {
        type: "timesheet_documents",
        status: "failed",
        toEmail: teacher.email,
        ccEmails: cc.join(", "),
        subject,
        paymentId: teacher.id,
        error: error instanceof Error ? error.message : "Erro desconhecido"
      }
    });
    return { ok: false, reason: "Erro no envio." };
  }
}
