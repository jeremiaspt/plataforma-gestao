import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { getCreditBalanceForTeacherStudentType } from "@/lib/personalTrainingCredits";
import {
  isExclusiveTrainingType,
  paymentTypeMatchesDuration,
  requiredParticipantsForType,
  trainingDurationOptions
} from "@/lib/personalTrainingRules";
import { dateToWeekday, isTodayOrFuture, parseDateParam } from "@/lib/pool";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "professor")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const dateValue = String(formData.get("date") || "");
  const poolBlockId = String(formData.get("poolBlockId") || "");
  const studentIds = Array.from(new Set(formData.getAll("studentIds").map(String).filter(Boolean)));
  const paymentTypeId = String(formData.get("paymentTypeId") || "");
  const durationMinutes = Number(formData.get("durationMinutes"));
  const redirectPath = `/piscina-25m?date=${dateValue || ""}`;
  const errorPath = `${redirectPath}&error=1`;
  const bookingDate = parseDateParam(dateValue);

  if (
    !dateValue ||
    !poolBlockId ||
    studentIds.length === 0 ||
    !paymentTypeId ||
    !trainingDurationOptions.includes(durationMinutes) ||
    !isTodayOrFuture(bookingDate)
  ) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const [block, paymentType] = await Promise.all([
    prisma.poolScheduleBlock.findUnique({ where: { id: poolBlockId } }),
    prisma.personalTrainingPaymentType.findFirst({ where: { id: paymentTypeId, active: true } })
  ]);

  if (
    !block ||
    block.type !== "treino" ||
    block.weekday !== dateToWeekday(bookingDate) ||
    block.endMinutes - block.startMinutes < durationMinutes ||
    !paymentType ||
    !paymentTypeMatchesDuration(paymentType.description, durationMinutes)
  ) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const requiredParticipants = requiredParticipantsForType(paymentType.description);

  if (studentIds.length !== requiredParticipants) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const balances = await Promise.all(
    studentIds.map((studentId) => getCreditBalanceForTeacherStudentType(user.id, studentId, paymentTypeId))
  );

  if (balances.some((balance) => !balance?.canBook)) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const startMinutes = block.startMinutes;
  const endMinutes = startMinutes + durationMinutes;
  const bookingDateValue = new Date(`${dateValue}T00:00:00`);

  const overlappingBookings = await prisma.personalTrainingBooking.findMany({
    where: {
      bookingDate: bookingDateValue,
      poolBlockId,
      status: { not: "cancelled" },
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
  const newExclusive = isExclusiveTrainingType(paymentType.description);
  const exceedsCapacity = overlappingGroups.size >= 2;

  if (sameTeacherOrStudent || existingExclusive || (newExclusive && overlappingGroups.size > 0) || exceedsCapacity) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const bookingGroupId = crypto.randomUUID();

  await prisma.personalTrainingBooking.createMany({
    data: studentIds.map((studentId) => ({
      bookingGroupId,
      bookingDate: bookingDateValue,
      poolBlockId,
      teacherId: user.id,
      studentId,
      paymentTypeId,
      startMinutes,
      endMinutes,
      durationMinutes,
      creditsUsed: 1
    }))
  });

  return NextResponse.redirect(appRedirectUrl(`${redirectPath}&success=1`, request));
}
