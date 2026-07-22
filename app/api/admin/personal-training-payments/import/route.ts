import { readSheet } from "read-excel-file/node";
import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { decimalToNumber } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export const runtime = "nodejs";

type ImportRow = {
  rowNumber: number;
  memberNumber: string;
  fullName: string;
  teacherName: string;
  paymentTypeName: string;
  quantity: number;
  paymentDate: Date;
  receptionistName: string;
};

function normalize(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function cellText(value: unknown) {
  return String(value || "").trim();
}

function parseQuantity(value: unknown) {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
}

function parsePaymentDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + value);
    return new Date(excelEpoch.getUTCFullYear(), excelEpoch.getUTCMonth(), excelEpoch.getUTCDate());
  }

  const text = cellText(value);
  const portugueseDate = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (portugueseDate) {
    const [, day, month, year] = portugueseDate;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? date : null;
  }

  const isoDate = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (isoDate) {
    const [, year, month, day] = isoDate;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? date : null;
  }

  return null;
}

function hasAnyValue(row: unknown[]) {
  return row.some((cell) => cellText(cell) !== "");
}

function duplicateNormalizedNames(items: Array<{ name: string }>) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = normalize(item.name);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
}

function summarizeErrors(errors: string[]) {
  const grouped = new Map<string, number[]>();
  const standalone: string[] = [];

  for (const error of errors) {
    const match = error.match(/^Linha\s+(\d+):\s+(.+)$/);

    if (!match) {
      standalone.push(error);
      continue;
    }

    const [, line, message] = match;
    const lines = grouped.get(message) || [];
    lines.push(Number(line));
    grouped.set(message, lines);
  }

  const groupedMessages = Array.from(grouped.entries()).map(([message, lines]) => {
    const visibleLines = lines.slice(0, 18).join(", ");
    const suffix = lines.length > 18 ? `, +${lines.length - 18} linha(s)` : "";
    return `${message} Linhas: ${visibleLines}${suffix}.`;
  });

  return [...standalone, ...groupedMessages].slice(0, 8).map((message) => (message.length > 220 ? `${message.slice(0, 217)}...` : message));
}

function redirectWithErrors(request: Request, errors: string[]) {
  const params = new URLSearchParams({ tab: "maintenance", importError: "1" });
  params.set("importErrors", Buffer.from(JSON.stringify(summarizeErrors(errors))).toString("base64url"));
  return NextResponse.redirect(appRedirectUrl(`/atividade?${params.toString()}`, request));
}

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const file = formData.get("paymentsFile");

  if (!(file instanceof File) || file.size === 0 || file.size > 5 * 1024 * 1024) {
    return redirectWithErrors(request, ["O ficheiro é obrigatório e deve ter no máximo 5 MB."]);
  }

  let rows;

  try {
    rows = await readSheet(Buffer.from(await file.arrayBuffer()), { dateFormat: "dd/mm/yyyy" });
  } catch {
    return redirectWithErrors(request, ["Não foi possível ler o ficheiro. Confirma que é um Excel .xlsx válido."]);
  }
  const dataRows = rows.slice(1).filter(hasAnyValue);
  const errors: string[] = [];

  if (dataRows.length === 0) {
    return redirectWithErrors(request, ["O ficheiro não tem linhas de pagamentos para importar."]);
  }

  const parsedRows: ImportRow[] = [];

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const memberNumber = cellText(row[0]);
    const fullName = cellText(row[1]);
    const teacherName = cellText(row[2]);
    const paymentTypeName = cellText(row[3]);
    const quantity = parseQuantity(row[4]);
    const paymentDate = parsePaymentDate(row[6]);
    const receptionistName = cellText(row[7]);

    if (!memberNumber) errors.push(`Linha ${rowNumber}: falta o número de utente.`);
    if (!fullName) errors.push(`Linha ${rowNumber}: falta o nome do utente.`);
    if (!teacherName) errors.push(`Linha ${rowNumber}: falta o nome do professor.`);
    if (!paymentTypeName) errors.push(`Linha ${rowNumber}: falta o nome do pack.`);
    if (!quantity) errors.push(`Linha ${rowNumber}: quantidade inválida.`);
    if (!paymentDate) errors.push(`Linha ${rowNumber}: data do pagamento inválida.`);
    if (!receptionistName) errors.push(`Linha ${rowNumber}: falta o nome do rececionista.`);

    if (memberNumber && fullName && teacherName && paymentTypeName && quantity && paymentDate && receptionistName) {
      parsedRows.push({ rowNumber, memberNumber, fullName, teacherName, paymentTypeName, quantity, paymentDate, receptionistName });
    }
  });

  const [teachers, receptionUsers, paymentTypes] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, roles: { some: { role: { key: "professor" } } } },
      select: { id: true, name: true }
    }),
    prisma.user.findMany({
      where: { active: true, roles: { some: { role: { key: { in: ["recepcao", "admin"] } } } } },
      select: { id: true, name: true }
    }),
    prisma.personalTrainingPaymentType.findMany({ where: { active: true } })
  ]);

  const teacherByName = new Map(teachers.map((teacher) => [normalize(teacher.name), teacher]));
  const receptionByName = new Map(receptionUsers.map((receptionist) => [normalize(receptionist.name), receptionist]));
  const paymentTypeByName = new Map(paymentTypes.map((paymentType) => [normalize(paymentType.description), paymentType]));
  const duplicateTeachers = duplicateNormalizedNames(teachers);
  const duplicateReceptionUsers = duplicateNormalizedNames(receptionUsers);

  for (const row of parsedRows) {
    const teacherKey = normalize(row.teacherName);
    const receptionistKey = normalize(row.receptionistName);

    if (duplicateTeachers.has(teacherKey)) {
      errors.push(`Linha ${row.rowNumber}: professor "${row.teacherName}" é ambíguo porque existe mais do que um utilizador com esse nome.`);
    } else if (!teacherByName.has(teacherKey)) {
      errors.push(`Linha ${row.rowNumber}: professor "${row.teacherName}" não existe ou não está ativo.`);
    }

    if (!paymentTypeByName.has(normalize(row.paymentTypeName))) {
      errors.push(`Linha ${row.rowNumber}: pack "${row.paymentTypeName}" não corresponde a um tipo ativo da plataforma.`);
    }

    if (duplicateReceptionUsers.has(receptionistKey)) {
      errors.push(`Linha ${row.rowNumber}: rececionista "${row.receptionistName}" é ambíguo porque existe mais do que um utilizador com esse nome.`);
    } else if (!receptionByName.has(receptionistKey)) {
      errors.push(`Linha ${row.rowNumber}: rececionista "${row.receptionistName}" não existe, não está ativo ou não tem permissão.`);
    }
  }

  if (errors.length > 0) {
    return redirectWithErrors(request, errors);
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of parsedRows) {
        const teacher = teacherByName.get(normalize(row.teacherName));
        const receptionist = receptionByName.get(normalize(row.receptionistName));
        const paymentType = paymentTypeByName.get(normalize(row.paymentTypeName));

        if (!teacher || !receptionist || !paymentType) {
          throw new Error("Validated import row lost lookup data");
        }

        const student = await tx.personalTrainingStudent.upsert({
          where: { memberNumber: row.memberNumber },
          update: { fullName: row.fullName },
          create: { memberNumber: row.memberNumber, fullName: row.fullName }
        });
        const creditsPerUnit = 0;
        const totalCredits = 0;
        const pricePerUnit = decimalToNumber(paymentType.price);
        const teacherPricePerUnit = decimalToNumber(paymentType.teacherPrice);
        const totalPrice = pricePerUnit * row.quantity;
        const teacherTotal = teacherPricePerUnit * row.quantity;
        const payment = await tx.personalTrainingPayment.create({
          data: {
            teacherId: teacher.id,
            studentId: student.id,
            paymentTypeId: paymentType.id,
            quantity: row.quantity,
            creditsPerUnit,
            totalCredits,
            pricePerUnit,
            totalPrice,
            teacherPricePerUnit,
            teacherTotal,
            createdById: receptionist.id,
            createdAt: row.paymentDate,
            updatedAt: row.paymentDate
          }
        });

        await tx.personalTrainingPaymentLog.create({
          data: {
            paymentId: payment.id,
            teacherId: teacher.id,
            studentId: student.id,
            action: "created",
            teacherName: teacher.name,
            studentName: student.fullName,
            studentMemberNumber: student.memberNumber,
            paymentType: paymentType.description,
            quantity: row.quantity,
            totalCredits,
            totalPrice,
            teacherTotal,
            createdByName: receptionist.name,
            actionById: user.id,
            actionByName: `Importado por ${user.name}`,
            reason: `Importação Excel. Rececionista original: ${receptionist.name}`,
            createdAt: row.paymentDate
          }
        });
      }
    });
  } catch {
    return redirectWithErrors(request, ["A importação falhou antes de gravar os dados. Confirma os valores do ficheiro e tenta novamente."]);
  }

  return NextResponse.redirect(appRedirectUrl(`/atividade?tab=maintenance&importSuccess=${parsedRows.length}`, request));
}
