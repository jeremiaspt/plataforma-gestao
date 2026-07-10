import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

const confirmationText = "LIMPAR TREINOS PERSONALIZADOS";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const backupConfirmed = formData.get("backupConfirmed") === "on";
  const typedConfirmation = String(formData.get("typedConfirmation") || "").trim();
  const redirectPath = "/atividade?tab=maintenance";

  if (!backupConfirmed || typedConfirmation !== confirmationText) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&resetError=1`, request));
  }

  await prisma.$transaction([
    prisma.emailLog.deleteMany({}),
    prisma.personalTrainingBookingLog.deleteMany({}),
    prisma.personalTrainingBooking.deleteMany({}),
    prisma.personalTrainingCreditAdjustment.deleteMany({}),
    prisma.personalTrainingPaymentLog.deleteMany({}),
    prisma.personalTrainingPayment.deleteMany({}),
    prisma.personalTrainingStudent.deleteMany({})
  ]);

  return NextResponse.redirect(appRedirectUrl(`${redirectPath}&resetSuccess=1`, request));
}
