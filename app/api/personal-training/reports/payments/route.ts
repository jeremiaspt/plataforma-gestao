import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { formatBillingPeriod, getBillingCycleLabel, getBillingPeriod } from "@/lib/billingCycles";
import { buildExcelTable, excelResponse, formatReportDate, formatReportDateTime } from "@/lib/excelReport";
import { formatCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await requireUser();
  const roleKeys = user.roles.map((userRole) => userRole.role.key);

  if (!roleKeys.includes("admin")) {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const url = new URL(request.url);
  const teacherId = url.searchParams.get("teacherId") || "";
  const month = url.searchParams.get("month") || undefined;

  if (!teacherId) {
    return NextResponse.json({ error: "Professor em falta." }, { status: 400 });
  }

  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    include: { roles: { include: { role: true } } }
  });

  if (!teacher || !teacher.roles.some((userRole) => userRole.role.key === "professor")) {
    return NextResponse.json({ error: "Professor invalido." }, { status: 404 });
  }

  const period = getBillingPeriod(teacher.billingCycle, month);
  const payments = await prisma.personalTrainingPayment.findMany({
    where: {
      teacherId,
      createdAt: {
        gte: period.start,
        lt: period.endExclusive
      }
    },
    orderBy: { createdAt: "asc" },
    include: {
      teacher: { select: { name: true } },
      student: true,
      paymentType: true,
      createdBy: { select: { name: true } }
    }
  });

  const rows = payments.map((payment) => ({
    Data: formatReportDateTime(payment.createdAt),
    Professor: payment.teacher.name,
    "N. utente": payment.student.memberNumber,
    Utente: payment.student.fullName,
    "Tipo de aula": payment.paymentType.description,
    Quantidade: payment.quantity,
    "Creditos por unidade": payment.creditsPerUnit,
    "Creditos totais": payment.totalCredits,
    "Valor unitario utente": formatCurrency(payment.pricePerUnit),
    "Total utente": formatCurrency(payment.totalPrice),
    "Valor unitario professor": formatCurrency(payment.teacherPricePerUnit),
    "Total professor": formatCurrency(payment.teacherTotal),
    "Lancado por": payment.createdBy?.name || ""
  }));

  const title = `Pagamentos TP - ${teacher.name} - ${formatBillingPeriod(period.start, period.endExclusive)} - ${getBillingCycleLabel(
    teacher.billingCycle
  )}`;
  const content = buildExcelTable(title, rows);
  const filename = `pagamentos-tp-${teacher.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${formatReportDate(period.start).replace(/\//g, "-")}.xls`;

  return excelResponse(filename, content);
}
