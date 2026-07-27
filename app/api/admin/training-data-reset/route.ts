import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

const confirmationTexts = new Set(["LIMPAR TREINOS PERSONALIZADOS", "LIMPAR DADOS OPERACIONAIS"]);
const resetTargetValues = [
  "personalTraining",
  "emailLogs",
  "loginLogs",
  "substitutions",
  "birthdayParties",
  "lostFound",
  "availability"
] as const;

type ResetTarget = (typeof resetTargetValues)[number];

const resetTargets = new Set<ResetTarget>(resetTargetValues);

function getSelectedTargets(formData: FormData) {
  const resetMode = String(formData.get("resetMode") || "selective");

  if (resetMode === "total") {
    return new Set<ResetTarget>(resetTargetValues);
  }

  const selected = formData
    .getAll("resetTargets")
    .map((value) => String(value))
    .filter((value): value is ResetTarget => resetTargets.has(value as ResetTarget));

  return new Set<ResetTarget>(selected);
}

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const superadminEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
  const isSuperadmin = Boolean(superadminEmail && user.email.toLowerCase() === superadminEmail);

  if (!isSuperadmin) {
    return NextResponse.redirect(appRedirectUrl("/atividade?tab=maintenance&resetUnauthorized=1", request));
  }

  const formData = await request.formData();
  const backupConfirmed = formData.get("backupConfirmed") === "on";
  const typedConfirmation = String(formData.get("typedConfirmation") || "").trim();
  const redirectPath = "/atividade?tab=maintenance";

  if (!backupConfirmed || !confirmationTexts.has(typedConfirmation)) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&resetError=1`, request));
  }

  const selectedTargets = getSelectedTargets(formData);

  if (selectedTargets.size === 0) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&resetError=1`, request));
  }

  const operations: Prisma.PrismaPromise<unknown>[] = [];

  if (selectedTargets.has("emailLogs")) {
    operations.push(prisma.emailLog.deleteMany({}));
  }

  if (selectedTargets.has("loginLogs")) {
    operations.push(prisma.userLoginLog.deleteMany({}));
  }

  if (selectedTargets.has("birthdayParties")) {
    operations.push(
      prisma.birthdayPartyPaymentLog.deleteMany({}),
      prisma.birthdayPartyMonitor.deleteMany({}),
      prisma.birthdayParty.deleteMany({})
    );
  }

  if (selectedTargets.has("lostFound")) {
    operations.push(prisma.lostFoundItemLog.deleteMany({}), prisma.lostFoundItemPhoto.deleteMany({}), prisma.lostFoundItem.deleteMany({}));
  }

  if (selectedTargets.has("substitutions")) {
    operations.push(
      prisma.groupClassSubstitutionItem.deleteMany({}),
      prisma.groupClassSubstitutionRequest.deleteMany({})
    );
  }

  if (selectedTargets.has("availability")) {
    operations.push(prisma.personalTrainingAvailability.deleteMany({}));
  }

  if (selectedTargets.has("personalTraining")) {
    operations.push(
      prisma.personalTrainingBookingLog.deleteMany({}),
      prisma.personalTrainingBooking.deleteMany({}),
      prisma.personalTrainingCreditAdjustment.deleteMany({}),
      prisma.personalTrainingPaymentLog.deleteMany({}),
      prisma.personalTrainingPayment.deleteMany({}),
      prisma.personalTrainingStudent.deleteMany({})
    );
  }

  await prisma.$transaction(operations);

  return NextResponse.redirect(appRedirectUrl(`${redirectPath}&resetSuccess=1`, request));
}
