import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { getTrainingTypeKey, getTrainingTypeName } from "@/lib/personalTrainingRules";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

const confirmationText = "APAGAR PAGAMENTOS TP";

function parseMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month] = value.split("-").map(Number);
  const date = new Date(year, month - 1, 1);

  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const fromMonthValue = String(formData.get("fromMonth") || "");
  const toMonthValue = String(formData.get("toMonth") || fromMonthValue);
  const typedConfirmation = String(formData.get("typedConfirmation") || "").trim();
  const preserveCredits = formData.get("preserveCredits") === "on";
  const redirectPath = "/atividade?tab=maintenance";
  const fromMonth = parseMonth(fromMonthValue);
  const toMonth = parseMonth(toMonthValue);

  if (!fromMonth || !toMonth || fromMonth > toMonth || typedConfirmation !== confirmationText || !preserveCredits) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&paymentDeleteError=1`, request));
  }

  const endExclusive = addMonths(toMonth, 1);
  const payments = await prisma.personalTrainingPayment.findMany({
    where: { createdAt: { gte: fromMonth, lt: endExclusive } },
    include: { paymentType: true }
  });
  const paymentIds = payments.map((payment) => payment.id);

  if (paymentIds.length === 0) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&paymentDeleteSuccess=0`, request));
  }

  const activePayments = payments.filter((payment) => payment.status === "active");

  await prisma.$transaction([
    ...(activePayments.length
      ? [
          prisma.personalTrainingCreditAdjustment.createMany({
            data: activePayments.map((payment) => ({
              teacherId: payment.teacherId,
              studentId: payment.studentId,
              trainingTypeKey: getTrainingTypeKey(payment.paymentType.description),
              trainingTypeName: getTrainingTypeName(payment.paymentType.description),
              deltaCredits: payment.totalCredits,
              reason: `Preservação de créditos ao apagar pagamento de ${fromMonthValue} a ${toMonthValue}`,
              createdById: user.id,
              createdByName: user.name
            }))
          })
        ]
      : []),
    prisma.personalTrainingPaymentLog.deleteMany({ where: { paymentId: { in: paymentIds } } }),
    prisma.personalTrainingPayment.deleteMany({ where: { id: { in: paymentIds } } })
  ]);

  return NextResponse.redirect(appRedirectUrl(`${redirectPath}&paymentDeleteSuccess=${paymentIds.length}`, request));
}
