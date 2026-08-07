import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

const confirmationTexts = new Set(["REPOR BACKUP TP", "REPOR BACKUP PLATAFORMA"]);

type BackupData = Record<string, Record<string, unknown>[] | undefined>;

type BackupPayload = {
  scope?: string;
  data?: BackupData;
};

function parseDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function shouldParseDateField(field: string) {
  return field.endsWith("At") || field.endsWith("Date") || field === "validFrom" || field === "validTo" || field === "expiresAt" || field === "usedAt";
}

function cleanRows(rows: Record<string, unknown>[] | undefined, fields: readonly string[]): Record<string, any>[] {
  return (rows || []).map((row) =>
    Object.fromEntries(
      fields.map((field) => {
        const value = row[field];
        return [field, shouldParseDateField(field) ? parseDate(value) : value ?? null];
      })
    )
  );
}

function createMany(rows: Record<string, any>[], query: (data: any[]) => Prisma.PrismaPromise<unknown>) {
  return rows.length ? [query(rows)] : [];
}

const fields = {
  users: ["id", "name", "email", "phone", "passwordHash", "active", "billingCycle", "createdAt", "updatedAt"],
  roles: ["id", "key", "name", "description"],
  permissions: ["id", "key", "name", "description"],
  userRoles: ["userId", "roleId"],
  rolePermissions: ["roleId", "permissionId"],
  userLoginLogs: ["id", "userId", "ipAddress", "platform", "browser", "city", "country", "userAgent", "createdAt"],
  passwordResetTokens: ["id", "userId", "tokenHash", "expiresAt", "usedAt", "createdAt"],
  poolScheduleBlocks: [
    "id",
    "poolKey",
    "weekday",
    "laneNumber",
    "startMinutes",
    "endMinutes",
    "title",
    "type",
    "notes",
    "active",
    "recurrenceType",
    "validFrom",
    "validTo",
    "teacherId",
    "createdById",
    "createdAt",
    "updatedAt"
  ],
  groupClassSubstitutionRequests: [
    "id",
    "absentTeacherId",
    "requestedById",
    "substitutionDate",
    "status",
    "cancelledAt",
    "cancelledById",
    "cancelledByName",
    "cancelReason",
    "createdAt",
    "updatedAt"
  ],
  groupClassSubstitutionItems: [
    "id",
    "requestId",
    "poolScheduleBlockId",
    "substituteTeacherId",
    "status",
    "accumulation",
    "substitutionMode",
    "poolKey",
    "laneNumber",
    "title",
    "notes",
    "startMinutes",
    "endMinutes",
    "createdAt",
    "updatedAt"
  ],
  groupClassHourlyRates: [
    "id",
    "name",
    "hourlyRate",
    "matchSource",
    "matchPatterns",
    "calculationMode",
    "durationFilter",
    "weekendOnly",
    "countByFortyFiveMinutes",
    "displayOrder",
    "active",
    "createdAt",
    "updatedAt"
  ],
  birthdayParties: [
    "id",
    "partyDate",
    "slotKey",
    "startMinutes",
    "endMinutes",
    "responsibleName",
    "responsibleContact",
    "responsibleEmail",
    "ageGroup",
    "childCount",
    "monitorRequirement",
    "paymentStatus",
    "receptionistId",
    "createdById",
    "createdAt",
    "updatedAt"
  ],
  birthdayPartyMonitors: ["id", "partyId", "teacherId", "createdAt"],
  birthdayPartyPaymentLogs: ["id", "partyId", "previousStatus", "newStatus", "changedById", "changedByName", "createdAt"],
  lostFoundItems: [
    "id",
    "foundAt",
    "foundBy",
    "receptionReceiver",
    "description",
    "location",
    "valuable",
    "photoDataUrl",
    "photoUrl",
    "photoPublicId",
    "status",
    "deliveredToUserName",
    "deliveredToUserAt",
    "deliveredToDirectorAt",
    "directorClosedAt",
    "directorCloseReason",
    "createdById",
    "createdByName",
    "updatedById",
    "updatedByName",
    "createdAt",
    "updatedAt"
  ],
  lostFoundItemPhotos: ["id", "itemId", "url", "publicId", "createdAt"],
  lostFoundItemLogs: ["id", "itemId", "action", "actionById", "actionByName", "details", "createdAt"],
  personalTrainingPaymentTypes: ["id", "description", "credits", "price", "teacherPrice", "active", "createdAt", "updatedAt"],
  personalTrainingTimesheetRules: ["id", "name", "studentCount", "displayOrder", "active", "createdAt", "updatedAt"],
  personalTrainingTimesheetRuleItems: ["ruleId", "paymentTypeId"],
  personalTrainingStudents: ["id", "memberNumber", "fullName", "createdAt", "updatedAt"],
  personalTrainingPayments: [
    "id",
    "teacherId",
    "studentId",
    "paymentTypeId",
    "quantity",
    "creditsPerUnit",
    "totalCredits",
    "pricePerUnit",
    "totalPrice",
    "teacherPricePerUnit",
    "teacherTotal",
    "createdById",
    "status",
    "cancelledAt",
    "cancelledById",
    "cancelledByName",
    "cancelReason",
    "createdAt",
    "updatedAt"
  ],
  personalTrainingPaymentLogs: [
    "id",
    "paymentId",
    "teacherId",
    "studentId",
    "action",
    "teacherName",
    "studentName",
    "studentMemberNumber",
    "paymentType",
    "quantity",
    "totalCredits",
    "totalPrice",
    "teacherTotal",
    "createdByName",
    "actionById",
    "actionByName",
    "reason",
    "createdAt"
  ],
  personalTrainingCreditAdjustments: [
    "id",
    "teacherId",
    "studentId",
    "trainingTypeKey",
    "trainingTypeName",
    "deltaCredits",
    "reason",
    "createdById",
    "createdByName",
    "createdAt"
  ],
  personalTrainingBookings: [
    "id",
    "bookingGroupId",
    "bookingDate",
    "poolBlockId",
    "teacherId",
    "studentId",
    "paymentTypeId",
    "isExperimental",
    "experimentalStudentName",
    "startMinutes",
    "endMinutes",
    "durationMinutes",
    "creditsUsed",
    "status",
    "createdAt",
    "updatedAt"
  ],
  personalTrainingAvailabilities: ["id", "teacherId", "weekday", "startMinutes", "endMinutes", "notes", "active", "createdAt", "updatedAt"],
  personalTrainingBookingLogs: [
    "id",
    "action",
    "bookingGroupId",
    "bookingDate",
    "teacherName",
    "studentNames",
    "paymentType",
    "poolBlockTitle",
    "laneNumber",
    "startMinutes",
    "endMinutes",
    "createdById",
    "createdByName",
    "createdAt"
  ],
  emailSettings: ["id", "key", "enabled", "ccEmails", "updatedAt", "createdAt"],
  systemSettings: [
    "id",
    "key",
    "maintenanceMode",
    "includeLisbonMunicipalHolidays",
    "includeChristmasEveHoliday",
    "includeNewYearsEveHoliday",
    "excludeDockSupportOverlapWithClasses",
    "updatedAt",
    "createdAt"
  ],
  emailLogs: ["id", "type", "status", "toEmail", "ccEmails", "subject", "providerId", "error", "paymentId", "createdAt"]
} as const;

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const superadminEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
  const isSuperadmin = Boolean(superadminEmail && user.email.toLowerCase() === superadminEmail);

  if (!isSuperadmin) {
    return NextResponse.redirect(appRedirectUrl("/atividade?tab=maintenance&restoreUnauthorized=1", request));
  }

  const formData = await request.formData();
  const file = formData.get("backupFile");
  const typedConfirmation = String(formData.get("restoreConfirmation") || "").trim();
  const redirectPath = "/atividade?tab=maintenance";

  if (!(file instanceof File) || !confirmationTexts.has(typedConfirmation)) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&restoreError=1`, request));
  }

  const payload = JSON.parse(await file.text()) as BackupPayload;

  if (payload.scope !== "platform-full-backup" || !payload.data) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&restoreError=1`, request));
  }

  const data = payload.data;
  const rows = {
    users: cleanRows(data.users, fields.users),
    roles: cleanRows(data.roles, fields.roles),
    permissions: cleanRows(data.permissions, fields.permissions),
    userRoles: cleanRows(data.userRoles, fields.userRoles),
    rolePermissions: cleanRows(data.rolePermissions, fields.rolePermissions),
    userLoginLogs: cleanRows(data.userLoginLogs, fields.userLoginLogs),
    passwordResetTokens: cleanRows(data.passwordResetTokens, fields.passwordResetTokens),
    poolScheduleBlocks: cleanRows(data.poolScheduleBlocks, fields.poolScheduleBlocks),
    groupClassSubstitutionRequests: cleanRows(data.groupClassSubstitutionRequests, fields.groupClassSubstitutionRequests),
    groupClassSubstitutionItems: cleanRows(data.groupClassSubstitutionItems, fields.groupClassSubstitutionItems),
    groupClassHourlyRates: cleanRows(data.groupClassHourlyRates, fields.groupClassHourlyRates),
    birthdayParties: cleanRows(data.birthdayParties, fields.birthdayParties),
    birthdayPartyMonitors: cleanRows(data.birthdayPartyMonitors, fields.birthdayPartyMonitors),
    birthdayPartyPaymentLogs: cleanRows(data.birthdayPartyPaymentLogs, fields.birthdayPartyPaymentLogs),
    lostFoundItems: cleanRows(data.lostFoundItems, fields.lostFoundItems),
    lostFoundItemPhotos: cleanRows(data.lostFoundItemPhotos, fields.lostFoundItemPhotos),
    lostFoundItemLogs: cleanRows(data.lostFoundItemLogs, fields.lostFoundItemLogs),
    personalTrainingPaymentTypes: cleanRows(data.personalTrainingPaymentTypes, fields.personalTrainingPaymentTypes),
    personalTrainingTimesheetRules: cleanRows(data.personalTrainingTimesheetRules, fields.personalTrainingTimesheetRules),
    personalTrainingTimesheetRuleItems: cleanRows(data.personalTrainingTimesheetRuleItems, fields.personalTrainingTimesheetRuleItems),
    personalTrainingStudents: cleanRows(data.personalTrainingStudents, fields.personalTrainingStudents),
    personalTrainingPayments: cleanRows(data.personalTrainingPayments, fields.personalTrainingPayments),
    personalTrainingPaymentLogs: cleanRows(data.personalTrainingPaymentLogs, fields.personalTrainingPaymentLogs),
    personalTrainingCreditAdjustments: cleanRows(data.personalTrainingCreditAdjustments, fields.personalTrainingCreditAdjustments),
    personalTrainingBookings: cleanRows(data.personalTrainingBookings, fields.personalTrainingBookings),
    personalTrainingAvailabilities: cleanRows(data.personalTrainingAvailabilities, fields.personalTrainingAvailabilities),
    personalTrainingBookingLogs: cleanRows(data.personalTrainingBookingLogs, fields.personalTrainingBookingLogs),
    emailSettings: cleanRows(data.emailSettings, fields.emailSettings),
    systemSettings: cleanRows(data.systemSettings, fields.systemSettings),
    emailLogs: cleanRows(data.emailLogs, fields.emailLogs)
  };

  await prisma.$transaction([
    prisma.emailLog.deleteMany({}),
    prisma.passwordResetToken.deleteMany({}),
    prisma.userLoginLog.deleteMany({}),
    prisma.lostFoundItemLog.deleteMany({}),
    prisma.lostFoundItemPhoto.deleteMany({}),
    prisma.lostFoundItem.deleteMany({}),
    prisma.birthdayPartyPaymentLog.deleteMany({}),
    prisma.birthdayPartyMonitor.deleteMany({}),
    prisma.birthdayParty.deleteMany({}),
    prisma.groupClassSubstitutionItem.deleteMany({}),
    prisma.groupClassSubstitutionRequest.deleteMany({}),
    prisma.personalTrainingBookingLog.deleteMany({}),
    prisma.personalTrainingBooking.deleteMany({}),
    prisma.personalTrainingCreditAdjustment.deleteMany({}),
    prisma.personalTrainingPaymentLog.deleteMany({}),
    prisma.personalTrainingPayment.deleteMany({}),
    prisma.personalTrainingAvailability.deleteMany({}),
    prisma.personalTrainingTimesheetRuleItem.deleteMany({}),
    prisma.personalTrainingTimesheetRule.deleteMany({}),
    prisma.poolScheduleBlock.deleteMany({}),
    prisma.groupClassHourlyRate.deleteMany({}),
    prisma.personalTrainingPaymentType.deleteMany({}),
    prisma.personalTrainingStudent.deleteMany({}),
    prisma.emailSettings.deleteMany({}),
    prisma.systemSettings.deleteMany({}),
    prisma.userRole.deleteMany({}),
    prisma.rolePermission.deleteMany({}),
    prisma.user.deleteMany({}),
    prisma.permission.deleteMany({}),
    prisma.role.deleteMany({}),
    ...createMany(rows.roles, (items) => prisma.role.createMany({ data: items })),
    ...createMany(rows.permissions, (items) => prisma.permission.createMany({ data: items })),
    ...createMany(rows.users, (items) => prisma.user.createMany({ data: items })),
    ...createMany(rows.userRoles, (items) => prisma.userRole.createMany({ data: items })),
    ...createMany(rows.rolePermissions, (items) => prisma.rolePermission.createMany({ data: items })),
    ...createMany(rows.emailSettings, (items) => prisma.emailSettings.createMany({ data: items })),
    ...createMany(rows.systemSettings, (items) => prisma.systemSettings.createMany({ data: items })),
    ...createMany(rows.personalTrainingPaymentTypes, (items) => prisma.personalTrainingPaymentType.createMany({ data: items })),
    ...createMany(rows.personalTrainingStudents, (items) => prisma.personalTrainingStudent.createMany({ data: items })),
    ...createMany(rows.groupClassHourlyRates, (items) => prisma.groupClassHourlyRate.createMany({ data: items })),
    ...createMany(rows.poolScheduleBlocks, (items) => prisma.poolScheduleBlock.createMany({ data: items })),
    ...createMany(rows.personalTrainingTimesheetRules, (items) => prisma.personalTrainingTimesheetRule.createMany({ data: items })),
    ...createMany(rows.personalTrainingTimesheetRuleItems, (items) => prisma.personalTrainingTimesheetRuleItem.createMany({ data: items })),
    ...createMany(rows.personalTrainingAvailabilities, (items) => prisma.personalTrainingAvailability.createMany({ data: items })),
    ...createMany(rows.personalTrainingPayments, (items) => prisma.personalTrainingPayment.createMany({ data: items })),
    ...createMany(rows.personalTrainingPaymentLogs, (items) => prisma.personalTrainingPaymentLog.createMany({ data: items })),
    ...createMany(rows.personalTrainingCreditAdjustments, (items) => prisma.personalTrainingCreditAdjustment.createMany({ data: items })),
    ...createMany(rows.personalTrainingBookings, (items) => prisma.personalTrainingBooking.createMany({ data: items })),
    ...createMany(rows.personalTrainingBookingLogs, (items) => prisma.personalTrainingBookingLog.createMany({ data: items })),
    ...createMany(rows.groupClassSubstitutionRequests, (items) => prisma.groupClassSubstitutionRequest.createMany({ data: items })),
    ...createMany(rows.groupClassSubstitutionItems, (items) => prisma.groupClassSubstitutionItem.createMany({ data: items })),
    ...createMany(rows.birthdayParties, (items) => prisma.birthdayParty.createMany({ data: items })),
    ...createMany(rows.birthdayPartyMonitors, (items) => prisma.birthdayPartyMonitor.createMany({ data: items })),
    ...createMany(rows.birthdayPartyPaymentLogs, (items) => prisma.birthdayPartyPaymentLog.createMany({ data: items })),
    ...createMany(rows.lostFoundItems, (items) => prisma.lostFoundItem.createMany({ data: items })),
    ...createMany(rows.lostFoundItemPhotos, (items) => prisma.lostFoundItemPhoto.createMany({ data: items })),
    ...createMany(rows.lostFoundItemLogs, (items) => prisma.lostFoundItemLog.createMany({ data: items })),
    ...createMany(rows.userLoginLogs, (items) => prisma.userLoginLog.createMany({ data: items })),
    ...createMany(rows.passwordResetTokens, (items) => prisma.passwordResetToken.createMany({ data: items })),
    ...createMany(rows.emailLogs, (items) => prisma.emailLog.createMany({ data: items }))
  ]);

  return NextResponse.redirect(appRedirectUrl(`${redirectPath}&restoreSuccess=1`, request));
}
