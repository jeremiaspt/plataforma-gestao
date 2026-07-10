import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

const confirmationText = "REPOR BACKUP TP";

type BackupPayload = {
  scope?: string;
  data?: {
    payments?: Record<string, unknown>[];
    paymentLogs?: Record<string, unknown>[];
    creditAdjustments?: Record<string, unknown>[];
    bookings?: Record<string, unknown>[];
    bookingLogs?: Record<string, unknown>[];
    emailLogs?: Record<string, unknown>[];
    students?: Record<string, unknown>[];
  };
};

function dateValue(value: unknown) {
  return value ? new Date(String(value)) : null;
}

function studentData(student: Record<string, unknown>) {
  return {
    id: String(student.id),
    memberNumber: String(student.memberNumber),
    fullName: String(student.fullName),
    createdAt: dateValue(student.createdAt) || new Date(),
    updatedAt: dateValue(student.updatedAt) || new Date()
  };
}

function paymentData(payment: Record<string, unknown>) {
  return {
    id: String(payment.id),
    teacherId: String(payment.teacherId),
    studentId: String(payment.studentId),
    paymentTypeId: String(payment.paymentTypeId),
    quantity: Number(payment.quantity),
    creditsPerUnit: Number(payment.creditsPerUnit),
    totalCredits: Number(payment.totalCredits),
    pricePerUnit: String(payment.pricePerUnit),
    totalPrice: String(payment.totalPrice),
    teacherPricePerUnit: String(payment.teacherPricePerUnit),
    teacherTotal: String(payment.teacherTotal),
    createdById: payment.createdById ? String(payment.createdById) : null,
    status: String(payment.status || "active"),
    cancelledAt: dateValue(payment.cancelledAt),
    cancelledById: payment.cancelledById ? String(payment.cancelledById) : null,
    cancelledByName: payment.cancelledByName ? String(payment.cancelledByName) : null,
    cancelReason: payment.cancelReason ? String(payment.cancelReason) : null,
    createdAt: dateValue(payment.createdAt) || new Date(),
    updatedAt: dateValue(payment.updatedAt) || new Date()
  };
}

function paymentLogData(log: Record<string, unknown>) {
  return {
    id: String(log.id),
    paymentId: String(log.paymentId),
    teacherId: String(log.teacherId),
    studentId: String(log.studentId),
    action: String(log.action),
    teacherName: String(log.teacherName),
    studentName: String(log.studentName),
    studentMemberNumber: String(log.studentMemberNumber),
    paymentType: String(log.paymentType),
    quantity: Number(log.quantity),
    totalCredits: Number(log.totalCredits),
    totalPrice: String(log.totalPrice),
    teacherTotal: String(log.teacherTotal),
    createdByName: log.createdByName ? String(log.createdByName) : null,
    actionById: log.actionById ? String(log.actionById) : null,
    actionByName: String(log.actionByName),
    reason: log.reason ? String(log.reason) : null,
    createdAt: dateValue(log.createdAt) || new Date()
  };
}

function creditAdjustmentData(adjustment: Record<string, unknown>) {
  return {
    id: String(adjustment.id),
    teacherId: String(adjustment.teacherId),
    studentId: String(adjustment.studentId),
    trainingTypeKey: String(adjustment.trainingTypeKey),
    trainingTypeName: String(adjustment.trainingTypeName),
    deltaCredits: Number(adjustment.deltaCredits),
    reason: adjustment.reason ? String(adjustment.reason) : null,
    createdById: adjustment.createdById ? String(adjustment.createdById) : null,
    createdByName: String(adjustment.createdByName),
    createdAt: dateValue(adjustment.createdAt) || new Date()
  };
}

function bookingData(booking: Record<string, unknown>) {
  return {
    id: String(booking.id),
    bookingGroupId: String(booking.bookingGroupId),
    bookingDate: dateValue(booking.bookingDate) || new Date(),
    poolBlockId: String(booking.poolBlockId),
    teacherId: String(booking.teacherId),
    studentId: String(booking.studentId),
    paymentTypeId: booking.paymentTypeId ? String(booking.paymentTypeId) : null,
    startMinutes: Number(booking.startMinutes),
    endMinutes: Number(booking.endMinutes),
    durationMinutes: Number(booking.durationMinutes),
    creditsUsed: Number(booking.creditsUsed || 1),
    status: String(booking.status || "scheduled"),
    createdAt: dateValue(booking.createdAt) || new Date(),
    updatedAt: dateValue(booking.updatedAt) || new Date()
  };
}

function bookingLogData(log: Record<string, unknown>) {
  return {
    id: String(log.id),
    action: String(log.action),
    bookingGroupId: String(log.bookingGroupId),
    bookingDate: dateValue(log.bookingDate) || new Date(),
    teacherName: String(log.teacherName),
    studentNames: String(log.studentNames),
    paymentType: log.paymentType ? String(log.paymentType) : null,
    poolBlockTitle: String(log.poolBlockTitle),
    laneNumber: Number(log.laneNumber),
    startMinutes: Number(log.startMinutes),
    endMinutes: Number(log.endMinutes),
    createdById: log.createdById ? String(log.createdById) : null,
    createdByName: String(log.createdByName),
    createdAt: dateValue(log.createdAt) || new Date()
  };
}

function emailLogData(log: Record<string, unknown>) {
  return {
    id: String(log.id),
    type: String(log.type),
    status: String(log.status),
    toEmail: String(log.toEmail),
    ccEmails: log.ccEmails ? String(log.ccEmails) : null,
    subject: String(log.subject),
    providerId: log.providerId ? String(log.providerId) : null,
    error: log.error ? String(log.error) : null,
    paymentId: log.paymentId ? String(log.paymentId) : null,
    createdAt: dateValue(log.createdAt) || new Date()
  };
}

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const file = formData.get("backupFile");
  const typedConfirmation = String(formData.get("restoreConfirmation") || "").trim();
  const redirectPath = "/atividade?tab=maintenance";

  if (!(file instanceof File) || typedConfirmation !== confirmationText) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&restoreError=1`, request));
  }

  const payload = JSON.parse(await file.text()) as BackupPayload;

  if (payload.scope !== "personal-training-operational-data" || !payload.data) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&restoreError=1`, request));
  }

  const students = payload.data.students || [];
  const payments = payload.data.payments || [];
  const paymentLogs = payload.data.paymentLogs || [];
  const creditAdjustments = payload.data.creditAdjustments || [];
  const bookings = payload.data.bookings || [];
  const bookingLogs = payload.data.bookingLogs || [];
  const emailLogs = payload.data.emailLogs || [];

  await prisma.$transaction([
    prisma.emailLog.deleteMany({}),
    prisma.personalTrainingBookingLog.deleteMany({}),
    prisma.personalTrainingBooking.deleteMany({}),
    prisma.personalTrainingCreditAdjustment.deleteMany({}),
    prisma.personalTrainingPaymentLog.deleteMany({}),
    prisma.personalTrainingPayment.deleteMany({}),
    prisma.personalTrainingStudent.deleteMany({}),
    ...(students.length ? [prisma.personalTrainingStudent.createMany({ data: students.map(studentData), skipDuplicates: true })] : []),
    ...(payments.length ? [prisma.personalTrainingPayment.createMany({ data: payments.map(paymentData) })] : []),
    ...(paymentLogs.length ? [prisma.personalTrainingPaymentLog.createMany({ data: paymentLogs.map(paymentLogData) })] : []),
    ...(creditAdjustments.length
      ? [prisma.personalTrainingCreditAdjustment.createMany({ data: creditAdjustments.map(creditAdjustmentData) })]
      : []),
    ...(bookings.length ? [prisma.personalTrainingBooking.createMany({ data: bookings.map(bookingData) })] : []),
    ...(bookingLogs.length ? [prisma.personalTrainingBookingLog.createMany({ data: bookingLogs.map(bookingLogData) })] : []),
    ...(emailLogs.length ? [prisma.emailLog.createMany({ data: emailLogs.map(emailLogData) })] : [])
  ]);

  return NextResponse.redirect(appRedirectUrl(`${redirectPath}&restoreSuccess=1`, request));
}
