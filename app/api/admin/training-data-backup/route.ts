import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function normalizeForJson(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === "object") {
    if ("toNumber" in value && typeof value.toNumber === "function") {
      return value.toString();
    }

    if (Array.isArray(value)) {
      return value.map(normalizeForJson);
    }

    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, normalizeForJson(nestedValue)]));
  }

  return value;
}

export async function GET() {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const superadminEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
  const isSuperadmin = Boolean(superadminEmail && user.email.toLowerCase() === superadminEmail);

  if (!isSuperadmin) {
    return NextResponse.json({ error: "Operacao reservada ao superadmin." }, { status: 403 });
  }

  const [
    users,
    roles,
    permissions,
    userRoles,
    rolePermissions,
    userLoginLogs,
    passwordResetTokens,
    poolScheduleBlocks,
    groupClassSubstitutionRequests,
    groupClassSubstitutionItems,
    groupClassHourlyRates,
    birthdayParties,
    birthdayPartyMonitors,
    birthdayPartyPaymentLogs,
    lostFoundItems,
    lostFoundItemPhotos,
    lostFoundItemLogs,
    personalTrainingPaymentTypes,
    personalTrainingTimesheetRules,
    personalTrainingTimesheetRuleItems,
    personalTrainingStudents,
    personalTrainingPayments,
    personalTrainingPaymentLogs,
    personalTrainingCreditAdjustments,
    personalTrainingBookings,
    personalTrainingAvailabilities,
    personalTrainingBookingLogs,
    emailSettings,
    systemSettings,
    emailLogs
  ] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.role.findMany({ orderBy: { key: "asc" } }),
    prisma.permission.findMany({ orderBy: { key: "asc" } }),
    prisma.userRole.findMany({ orderBy: [{ userId: "asc" }, { roleId: "asc" }] }),
    prisma.rolePermission.findMany({ orderBy: [{ roleId: "asc" }, { permissionId: "asc" }] }),
    prisma.userLoginLog.findMany({ orderBy: [{ userId: "asc" }, { createdAt: "asc" }] }),
    prisma.passwordResetToken.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.poolScheduleBlock.findMany({ orderBy: [{ poolKey: "asc" }, { weekday: "asc" }, { laneNumber: "asc" }, { startMinutes: "asc" }] }),
    prisma.groupClassSubstitutionRequest.findMany({ orderBy: [{ substitutionDate: "asc" }, { createdAt: "asc" }] }),
    prisma.groupClassSubstitutionItem.findMany({ orderBy: [{ requestId: "asc" }, { startMinutes: "asc" }] }),
    prisma.groupClassHourlyRate.findMany({ orderBy: [{ displayOrder: "asc" }, { name: "asc" }] }),
    prisma.birthdayParty.findMany({ orderBy: [{ partyDate: "asc" }, { startMinutes: "asc" }] }),
    prisma.birthdayPartyMonitor.findMany({ orderBy: [{ partyId: "asc" }, { createdAt: "asc" }] }),
    prisma.birthdayPartyPaymentLog.findMany({ orderBy: [{ partyId: "asc" }, { createdAt: "asc" }] }),
    prisma.lostFoundItem.findMany({ orderBy: [{ foundAt: "asc" }, { createdAt: "asc" }] }),
    prisma.lostFoundItemPhoto.findMany({ orderBy: [{ itemId: "asc" }, { createdAt: "asc" }] }),
    prisma.lostFoundItemLog.findMany({ orderBy: [{ itemId: "asc" }, { createdAt: "asc" }] }),
    prisma.personalTrainingPaymentType.findMany({ orderBy: { description: "asc" } }),
    prisma.personalTrainingTimesheetRule.findMany({ orderBy: [{ displayOrder: "asc" }, { name: "asc" }] }),
    prisma.personalTrainingTimesheetRuleItem.findMany({ orderBy: [{ ruleId: "asc" }, { paymentTypeId: "asc" }] }),
    prisma.personalTrainingStudent.findMany({ orderBy: { fullName: "asc" } }),
    prisma.personalTrainingPayment.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.personalTrainingPaymentLog.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.personalTrainingCreditAdjustment.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.personalTrainingBooking.findMany({ orderBy: [{ bookingDate: "asc" }, { startMinutes: "asc" }] }),
    prisma.personalTrainingAvailability.findMany({ orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }] }),
    prisma.personalTrainingBookingLog.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.emailSettings.findMany({ orderBy: { key: "asc" } }),
    prisma.systemSettings.findMany({ orderBy: { key: "asc" } }),
    prisma.emailLog.findMany({ orderBy: { createdAt: "asc" } })
  ]);

  const exportedAt = new Date();
  const data = {
    users,
    roles,
    permissions,
    userRoles,
    rolePermissions,
    userLoginLogs,
    passwordResetTokens,
    poolScheduleBlocks,
    groupClassSubstitutionRequests,
    groupClassSubstitutionItems,
    groupClassHourlyRates,
    birthdayParties,
    birthdayPartyMonitors,
    birthdayPartyPaymentLogs,
    lostFoundItems,
    lostFoundItemPhotos,
    lostFoundItemLogs,
    personalTrainingPaymentTypes,
    personalTrainingTimesheetRules,
    personalTrainingTimesheetRuleItems,
    personalTrainingStudents,
    personalTrainingPayments,
    personalTrainingPaymentLogs,
    personalTrainingCreditAdjustments,
    personalTrainingBookings,
    personalTrainingAvailabilities,
    personalTrainingBookingLogs,
    emailSettings,
    systemSettings,
    emailLogs
  };
  const counts = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value.length]));
  const payload = normalizeForJson({
    exportedAt,
    exportedBy: { id: user.id, name: user.name, email: user.email },
    schemaVersion: 2,
    scope: "platform-full-backup",
    note: "Backup total da plataforma para reposicao ou migracao completa da base de dados.",
    counts,
    data
  });

  const filename = `backup-plataforma-gestao-${exportedAt.toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
