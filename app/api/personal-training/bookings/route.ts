import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { getCreditBalanceForTeacherStudentTrainingType } from "@/lib/personalTrainingCredits";
import {
  getTrainingTypeKey,
  getTrainingTypeName,
  isExclusiveTrainingType,
  paymentTypeMatchesDuration,
  requiredParticipantsForType,
  trainingDurationOptions
} from "@/lib/personalTrainingRules";
import { dateToWeekday, getPoolMapByKey, isTodayOrFuture, parseDateParam, poolBlockAppliesToDate } from "@/lib/pool";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "professor")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const dateValue = String(formData.get("date") || "");
  const poolMap = getPoolMapByKey(String(formData.get("poolKey") || "piscina_25m"));
  const poolBlockId = String(formData.get("poolBlockId") || "");
  const existingBookingGroupId = String(formData.get("bookingGroupId") || "");
  const studentIds = Array.from(new Set(formData.getAll("studentIds").map(String).filter(Boolean)));
  const trainingTypeKey = String(formData.get("trainingTypeKey") || "");
  const durationMinutes = Number(formData.get("durationMinutes"));
  const requestedStartMinutes = Number(formData.get("startMinutes"));
  const redirectPath = `${poolMap.basePath}?date=${dateValue || ""}`;
  const errorPath = `${redirectPath}&error=1`;
  const bookingDate = parseDateParam(dateValue);

  if (
    !dateValue ||
    !poolBlockId ||
    studentIds.length === 0 ||
    !trainingTypeKey ||
    !trainingDurationOptions.includes(durationMinutes) ||
    !Number.isInteger(requestedStartMinutes) ||
    !isTodayOrFuture(bookingDate)
  ) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  let existingBookingsForEdit: Array<{
    bookingDate: Date;
    bookingGroupId: string;
    creditsUsed: number;
    endMinutes: number;
    paymentTypeId: string | null;
    startMinutes: number;
    studentId: string;
    student: { fullName: string };
    paymentType: { description: string } | null;
    poolBlock: { laneNumber: number; title: string };
  }> = [];

  const [block, paymentTypes] = await Promise.all([
    prisma.poolScheduleBlock.findUnique({ where: { id: poolBlockId } }),
    prisma.personalTrainingPaymentType.findMany({
      where: { active: true },
      orderBy: { credits: "desc" }
    })
  ]);

  if (existingBookingGroupId) {
    existingBookingsForEdit = await prisma.personalTrainingBooking.findMany({
      where: {
        bookingGroupId: existingBookingGroupId,
        teacherId: user.id,
        status: { not: "cancelled" }
      },
      include: { student: true, paymentType: true, poolBlock: true }
    });

    if (existingBookingsForEdit.length === 0 || existingBookingsForEdit.some((booking) => !isTodayOrFuture(booking.bookingDate))) {
      return NextResponse.redirect(appRedirectUrl(errorPath, request));
    }
  }

  const matchingPaymentTypes = paymentTypes.filter(
    (paymentType) =>
      getTrainingTypeKey(paymentType.description) === trainingTypeKey &&
      paymentTypeMatchesDuration(paymentType.description, durationMinutes)
  );
  const paymentType = matchingPaymentTypes[0];
  const trainingTypeName = paymentType ? getTrainingTypeName(paymentType.description) : "";

  if (
    !block ||
    block.poolKey !== poolMap.key ||
    block.type !== "treino" ||
    block.weekday !== dateToWeekday(bookingDate) ||
    !poolBlockAppliesToDate(block, bookingDate) ||
    requestedStartMinutes < block.startMinutes ||
    requestedStartMinutes + durationMinutes > block.endMinutes ||
    requestedStartMinutes % 5 !== 0 ||
    !paymentType
  ) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const requiredParticipants = requiredParticipantsForType(trainingTypeName);

  if (studentIds.length !== requiredParticipants) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const balances = await Promise.all(
    studentIds.map((studentId) => getCreditBalanceForTeacherStudentTrainingType(user.id, studentId, trainingTypeKey))
  );

  const existingCreditsByStudent = new Map(
    existingBookingsForEdit
      .filter((booking) => booking.paymentTypeId === paymentType.id)
      .map((booking) => [booking.studentId, booking.creditsUsed])
  );
  const hasEnoughCredits = balances.every((balance, index) => {
    if (!balance) return false;
    const restoredCredits = existingCreditsByStudent.get(studentIds[index]) || 0;
    return balance.availableCredits + restoredCredits > -2;
  });

  if (!hasEnoughCredits) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const startMinutes = requestedStartMinutes;
  const endMinutes = startMinutes + durationMinutes;
  const bookingDateValue = new Date(`${dateValue}T00:00:00`);

  const overlappingBookings = await prisma.personalTrainingBooking.findMany({
    where: {
      bookingDate: bookingDateValue,
      poolBlockId,
      status: { not: "cancelled" },
      bookingGroupId: existingBookingGroupId ? { not: existingBookingGroupId } : undefined,
      startMinutes: { lt: endMinutes },
      endMinutes: { gt: startMinutes }
    },
    include: { paymentType: true }
  });

  const overlappingGroups = new Set(overlappingBookings.map((booking) => booking.bookingGroupId));
  const sameTeacherOrStudent = overlappingBookings.some(
    (booking) => booking.teacherId === user.id || studentIds.includes(booking.studentId)
  );
  const existingExclusive = overlappingBookings.some((booking) => isExclusiveTrainingType(booking.paymentType?.description));
  const newExclusive = isExclusiveTrainingType(trainingTypeName);
  const exceedsCapacity = overlappingGroups.size >= 2;

  if (sameTeacherOrStudent || existingExclusive || (newExclusive && overlappingGroups.size > 0) || exceedsCapacity) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const bookingGroupId = crypto.randomUUID();

  await prisma.$transaction(async (tx) => {
    if (existingBookingGroupId) {
      const existingBooking = existingBookingsForEdit[0];

      await tx.personalTrainingBooking.updateMany({
        where: {
          bookingGroupId: existingBookingGroupId,
          teacherId: user.id,
          status: { not: "cancelled" }
        },
        data: { status: "cancelled" }
      });

      if (existingBooking) {
        await tx.personalTrainingBookingLog.create({
          data: {
            action: "alteracao_cancelou_anterior",
            bookingGroupId: existingBookingGroupId,
            bookingDate: existingBooking.bookingDate,
            teacherName: user.name,
            studentNames: existingBookingsForEdit.map((booking) => booking.student.fullName).join(", "),
            paymentType: existingBooking.paymentType?.description || null,
            poolBlockTitle: existingBooking.poolBlock.title,
            laneNumber: existingBooking.poolBlock.laneNumber,
            startMinutes: existingBooking.startMinutes,
            endMinutes: existingBooking.endMinutes,
            createdById: user.id,
            createdByName: user.name
          }
        });
      }
    }

    await tx.personalTrainingBooking.createMany({
      data: studentIds.map((studentId) => ({
        bookingGroupId,
        bookingDate: bookingDateValue,
        poolBlockId,
        teacherId: user.id,
        studentId,
        paymentTypeId: paymentType.id,
        startMinutes,
        endMinutes,
        durationMinutes,
        creditsUsed: 1
      }))
    });

    const students = await tx.personalTrainingStudent.findMany({
      where: { id: { in: studentIds } },
      orderBy: { fullName: "asc" }
    });

    await tx.personalTrainingBookingLog.create({
      data: {
        action: existingBookingGroupId ? "alteracao_criou_nova" : "criacao",
        bookingGroupId,
        bookingDate: bookingDateValue,
        teacherName: user.name,
        studentNames: students.map((student) => student.fullName).join(", "),
        paymentType: paymentType.description,
        poolBlockTitle: block.title,
        laneNumber: block.laneNumber,
        startMinutes,
        endMinutes,
        createdById: user.id,
        createdByName: user.name
      }
    });
  });

  return NextResponse.redirect(appRedirectUrl(`${redirectPath}&success=1`, request));
}
