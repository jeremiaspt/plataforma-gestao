import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const user = await requireUser();
  const isAdmin = hasRole(user, "admin");
  const isReception = hasRole(user, "recepcao");

  if (!isAdmin && !isReception) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const paymentId = String(formData.get("paymentId") || "");
  const teacherId = String(formData.get("teacherId") || "");
  const month = String(formData.get("month") || "");
  const reason = String(formData.get("reason") || "").trim();
  const basePath = `/treinos-personalizados/pagamentos?teacherId=${teacherId}&tab=payments${month ? `&month=${month}` : ""}`;

  if (!paymentId) {
    return NextResponse.redirect(appRedirectUrl(`${basePath}&error=cancel`, request));
  }

  const payment = await prisma.personalTrainingPayment.findUnique({
    where: { id: paymentId },
    include: {
      teacher: { select: { name: true } },
      student: true,
      paymentType: true,
      createdBy: { select: { name: true } }
    }
  });

  if (!payment || payment.status === "cancelled") {
    return NextResponse.redirect(appRedirectUrl(`${basePath}&error=cancel`, request));
  }

  if (!isAdmin && payment.createdById !== user.id) {
    return NextResponse.redirect(appRedirectUrl(`${basePath}&error=cancel_permission`, request));
  }

  await prisma.$transaction([
    prisma.personalTrainingPayment.update({
      where: { id: payment.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledById: user.id,
        cancelledByName: user.name,
        cancelReason: reason || null
      }
    }),
    prisma.personalTrainingPaymentLog.create({
      data: {
        paymentId: payment.id,
        teacherId: payment.teacherId,
        studentId: payment.studentId,
        action: "cancelled",
        teacherName: payment.teacher.name,
        studentName: payment.student.fullName,
        studentMemberNumber: payment.student.memberNumber,
        paymentType: payment.paymentType.description,
        quantity: payment.quantity,
        totalCredits: payment.totalCredits,
        totalPrice: payment.totalPrice,
        teacherTotal: payment.teacherTotal,
        createdByName: payment.createdBy?.name || null,
        actionById: user.id,
        actionByName: user.name,
        reason: reason || null
      }
    })
  ]);

  return NextResponse.redirect(appRedirectUrl(`${basePath}&paymentCancelSuccess=1`, request));
}
