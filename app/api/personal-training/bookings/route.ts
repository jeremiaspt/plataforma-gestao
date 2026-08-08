import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { getHolidayForDate } from "@/lib/holidays";
import { blockNonAdminDuringMaintenance, getSystemSettings } from "@/lib/maintenance";
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
  const isAdmin = hasRole(user, "admin");
  const isProfessor = hasRole(user, "professor");

  if (!isAdmin && !isProfessor) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const dateValue = String(formData.get("date") || "");
  const poolMap = getPoolMapByKey(String(formData.get("poolKey") || "piscina_25m"));
  const poolBlockId = String(formData.get("poolBlockId") || "");
  const existingBookingGroupId = String(formData.get("bookingGroupId") || "");
  const selectedTeacherId = String(formData.get("teacherId") || "");
  const isExperimentalBooking = isAdmin && String(formData.get("experimentalBooking") || "") === "1" && !existingBookingGroupId;
  const experimentalStudentName = String(formData.get("experimentalStudentName") || "").trim();
  const teacherId = isAdmin && selectedTeacherId ? selectedTeacherId : user.id;
  const studentIds = Array.from(new Set(formData.getAll("studentIds").map(String).filter(Boolean)));
  const trainingTypeKey = String(formData.get("trainingTypeKey") || "");
  const durationMinutes = Number(formData.get("durationMinutes"));
  const requestedStartMinutes = Number(formData.get("startMinutes"));
  const redirectPath = `${poolMap.basePath}?date=${dateValue || ""}`;
  const errorPath = `${redirectPath}&error=1`;
  const bookingDate = parseDateParam(dateValue);
  const maintenanceBlock = await blockNonAdminDuringMaintenance({ user, request, redirectPath });
  const systemSettings = await getSystemSettings();
  const holiday = getHolidayForDate(bookingDate, {
    includeChristmasEveHoliday: systemSettings.includeChristmasEveHoliday,
    includeLisbonMunicipalHolidays: systemSettings.includeLisbonMunicipalHolidays,
    includeNewYearsEveHoliday: systemSettings.includeNewYearsEveHoliday
  });

  if (maintenanceBlock) {
    return maintenanceBlock;
  }

  if (holiday) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&holiday=1`, request));
  }

  if (
    !dateValue ||
    !poolBlockId ||
    (!isExperimentalBooking && studentIds.length === 0) ||
    (isExperimentalBooking && !experimentalStudentName) ||
    (isAdmin && !isExperimentalBooking && selectedTeacherId && selectedTeacherId !== user.id) ||
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
    experimentalStudentName: string | null;
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
  const bookingTeacher = await prisma.user.findFirst({
    where: { id: teacherId, active: true, roles: { some: { role: { key: "professor" } } } },
    select: { id: true, name: true }
  });

  if (!bookingTeacher) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  if (existingBookingGroupId) {
    existingBookingsForEdit = await prisma.personalTrainingBooking.findMany({
      where: {
        bookingGroupId: existingBookingGroupId,
        teacherId,
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

  if (!isExperimentalBooking && studentIds.length !== requiredParticipants) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const balances = isExperimentalBooking
    ? []
    : await Promise.all(studentIds.map((studentId) => getCreditBalanceForTeacherStudentTrainingType(teacherId, studentId, trainingTypeKey)));

  const existingCreditsByStudent = new Map(
    existingBookingsForEdit
      .filter((booking) => booking.paymentTypeId === paymentType.id)
      .map((booking) => [booking.studentId, booking.creditsUsed])
  );
  const hasEnoughCredits = isExperimentalBooking || balances.every((balance, index) => {
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
    (booking) => booking.teacherId === teacherId || (!isExperimentalBooking && studentIds.includes(booking.studentId))
  );
  const existingExclusive = overlappingBookings.some((booking) => isExclusiveTrainingType(booking.paymentType?.description));
  const newExclusive = isExclusiveTrainingType(trainingTypeName);
  const exceedsCapacity = overlappingGroups.size >= 2;

  if (sameTeacherOrStudent || existingExclusive || (newExclusive && overlappingGroups.size > 0) || exceedsCapacity) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const bookingGroupId = crypto.randomUUID();

  try {
    await prisma.$transaction(async (tx) => {
      const currentOverlappingBookings = await tx.personalTrainingBooking.findMany({
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
      const currentOverlappingGroups = new Set(currentOverlappingBookings.map((booking) => booking.bookingGroupId));
      const currentSameTeacherOrStudent = currentOverlappingBookings.some(
        (booking) => booking.teacherId === teacherId || (!isExperimentalBooking && studentIds.includes(booking.studentId))
      );
      const currentExistingExclusive = currentOverlappingBookings.some((booking) => isExclusiveTrainingType(booking.paymentType?.description));
      const currentExceedsCapacity = currentOverlappingGroups.size >= 2;

      if (currentSameTeacherOrStudent || currentExistingExclusive || (newExclusive && currentOverlappingGroups.size > 0) || currentExceedsCapacity) {
        throw new Error("booking_conflict");
      }

      if (existingBookingGroupId) {
        const existingBooking = existingBookingsForEdit[0];

        await tx.personalTrainingBooking.updateMany({
          where: {
            bookingGroupId: existingBookingGroupId,
            teacherId,
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
              teacherName: bookingTeacher.name,
              studentNames: existingBookingsForEdit.map((booking) => booking.experimentalStudentName || booking.student.fullName).join(", "),
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

      const bookingStudentIds = isExperimentalBooking
        ? [
            (
              await tx.personalTrainingStudent.create({
                data: {
                  fullName: experimentalStudentName,
                  memberNumber: `EXP-${crypto.randomUUID()}`
                },
                select: { id: true }
              })
            ).id
          ]
        : studentIds;

      await tx.personalTrainingBooking.createMany({
        data: bookingStudentIds.map((studentId) => ({
          bookingGroupId,
          bookingDate: bookingDateValue,
          poolBlockId,
          teacherId,
          studentId,
          paymentTypeId: paymentType.id,
          experimentalStudentName: isExperimentalBooking ? experimentalStudentName : null,
          isExperimental: isExperimentalBooking,
          startMinutes,
          endMinutes,
          durationMinutes,
          creditsUsed: isExperimentalBooking ? 0 : 1
        }))
      });

      const students = await tx.personalTrainingStudent.findMany({
        where: { id: { in: bookingStudentIds } },
        orderBy: { fullName: "asc" }
      });

      await tx.personalTrainingBookingLog.create({
        data: {
          action: existingBookingGroupId ? "alteracao_criou_nova" : "criacao",
          bookingGroupId,
          bookingDate: bookingDateValue,
          teacherName: bookingTeacher.name,
          studentNames: isExperimentalBooking ? experimentalStudentName : students.map((student) => student.fullName).join(", "),
          paymentType: paymentType.description,
          poolBlockTitle: block.title,
          laneNumber: block.laneNumber,
          startMinutes,
          endMinutes,
          createdById: user.id,
          createdByName: user.name
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  return NextResponse.redirect(appRedirectUrl(`${redirectPath}&success=1`, request));
}
