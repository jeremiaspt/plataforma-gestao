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
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const superadminEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();
  const isSuperadmin = Boolean(superadminEmail && user.email.toLowerCase() === superadminEmail);

  if (!isSuperadmin) {
    return NextResponse.json({ error: "Operação reservada ao superadmin." }, { status: 403 });
  }

  const [
    payments,
    paymentLogs,
    creditAdjustments,
    bookings,
    bookingLogs,
    personalTrainingAvailabilities,
    personalTrainingTimesheetRules,
    personalTrainingTimesheetRuleItems,
    loginLogs,
    substitutionRequests,
    substitutionItems,
    birthdayParties,
    birthdayPartyMonitors,
    birthdayPartyPaymentLogs,
    lostFoundItems,
    lostFoundItemPhotos,
    lostFoundItemLogs,
    groupClassHourlyRates,
    emailLogs,
    emailSettings,
    systemSettings,
    students,
    paymentTypes,
    poolBlocks,
    teachers
  ] = await Promise.all([
    prisma.personalTrainingPayment.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        student: true,
        paymentType: true,
        createdBy: { select: { id: true, name: true, email: true } }
      }
    }),
    prisma.personalTrainingPaymentLog.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.personalTrainingCreditAdjustment.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.personalTrainingBooking.findMany({
      orderBy: [{ bookingDate: "asc" }, { startMinutes: "asc" }],
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        student: true,
        paymentType: true,
        poolBlock: true
      }
    }),
    prisma.personalTrainingBookingLog.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.personalTrainingAvailability.findMany({
      orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }],
      include: { teacher: { select: { id: true, name: true, email: true } } }
    }),
    prisma.personalTrainingTimesheetRule.findMany({ orderBy: [{ displayOrder: "asc" }, { name: "asc" }] }),
    prisma.personalTrainingTimesheetRuleItem.findMany({ orderBy: [{ ruleId: "asc" }, { paymentTypeId: "asc" }] }),
    prisma.userLoginLog.findMany({
      orderBy: [{ userId: "asc" }, { createdAt: "asc" }],
      include: { user: { select: { id: true, name: true, email: true } } }
    }),
    prisma.groupClassSubstitutionRequest.findMany({
      orderBy: [{ substitutionDate: "asc" }, { createdAt: "asc" }],
      include: {
        absentTeacher: { select: { id: true, name: true, email: true } },
        requestedBy: { select: { id: true, name: true, email: true } }
      }
    }),
    prisma.groupClassSubstitutionItem.findMany({
      orderBy: [{ requestId: "asc" }, { startMinutes: "asc" }],
      include: {
        substituteTeacher: { select: { id: true, name: true, email: true } },
        poolScheduleBlock: true
      }
    }),
    prisma.birthdayParty.findMany({
      orderBy: [{ partyDate: "asc" }, { startMinutes: "asc" }],
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        receptionist: { select: { id: true, name: true, email: true } }
      }
    }),
    prisma.birthdayPartyMonitor.findMany({
      orderBy: [{ partyId: "asc" }, { createdAt: "asc" }],
      include: { teacher: { select: { id: true, name: true, email: true } } }
    }),
    prisma.birthdayPartyPaymentLog.findMany({ orderBy: [{ partyId: "asc" }, { createdAt: "asc" }] }),
    prisma.lostFoundItem.findMany({ orderBy: [{ foundAt: "asc" }, { createdAt: "asc" }] }),
    prisma.lostFoundItemPhoto.findMany({ orderBy: [{ itemId: "asc" }, { createdAt: "asc" }] }),
    prisma.lostFoundItemLog.findMany({ orderBy: [{ itemId: "asc" }, { createdAt: "asc" }] }),
    prisma.groupClassHourlyRate.findMany({ orderBy: [{ displayOrder: "asc" }, { name: "asc" }] }),
    prisma.emailLog.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.emailSettings.findMany({ orderBy: { key: "asc" } }),
    prisma.systemSettings.findMany({ orderBy: { key: "asc" } }),
    prisma.personalTrainingStudent.findMany({ orderBy: { fullName: "asc" } }),
    prisma.personalTrainingPaymentType.findMany({ orderBy: { description: "asc" } }),
    prisma.poolScheduleBlock.findMany({ orderBy: [{ weekday: "asc" }, { laneNumber: "asc" }, { startMinutes: "asc" }] }),
    prisma.user.findMany({
      where: { roles: { some: { role: { key: "professor" } } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true }
    })
  ]);

  const exportedAt = new Date();
  const payload = normalizeForJson({
    exportedAt,
    exportedBy: { id: user.id, name: user.name, email: user.email },
    scope: "personal-training-operational-data",
    note: "Backup dos dados antes da limpeza: alunos, pagamentos TP, créditos manuais, marcações PT, histórico de emails e respetivos logs. Inclui também disponibilidades TP, logins, substituições, festas, configurações, tipos, professores e blocos como contexto.",
    counts: {
      payments: payments.length,
      paymentLogs: paymentLogs.length,
      creditAdjustments: creditAdjustments.length,
      bookings: bookings.length,
      bookingLogs: bookingLogs.length,
      personalTrainingAvailabilities: personalTrainingAvailabilities.length,
      personalTrainingTimesheetRules: personalTrainingTimesheetRules.length,
      personalTrainingTimesheetRuleItems: personalTrainingTimesheetRuleItems.length,
      loginLogs: loginLogs.length,
      substitutionRequests: substitutionRequests.length,
      substitutionItems: substitutionItems.length,
      birthdayParties: birthdayParties.length,
      birthdayPartyMonitors: birthdayPartyMonitors.length,
      birthdayPartyPaymentLogs: birthdayPartyPaymentLogs.length,
      lostFoundItems: lostFoundItems.length,
      lostFoundItemPhotos: lostFoundItemPhotos.length,
      lostFoundItemLogs: lostFoundItemLogs.length,
      groupClassHourlyRates: groupClassHourlyRates.length,
      emailLogs: emailLogs.length,
      emailSettings: emailSettings.length,
      systemSettings: systemSettings.length,
      students: students.length,
      paymentTypes: paymentTypes.length,
      poolBlocks: poolBlocks.length,
      teachers: teachers.length
    },
    data: {
      payments,
      paymentLogs,
      creditAdjustments,
      bookings,
      bookingLogs,
      personalTrainingAvailabilities,
      personalTrainingTimesheetRules,
      personalTrainingTimesheetRuleItems,
      loginLogs,
      substitutionRequests,
      substitutionItems,
      birthdayParties,
      birthdayPartyMonitors,
      birthdayPartyPaymentLogs,
      lostFoundItems,
      lostFoundItemPhotos,
      lostFoundItemLogs,
      groupClassHourlyRates,
      emailLogs,
      emailSettings,
      systemSettings,
      students,
      paymentTypes,
      poolBlocks,
      teachers
    }
  });

  const filename = `backup-treinos-personalizados-${exportedAt.toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
