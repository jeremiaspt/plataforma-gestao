import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { getCreditBalanceForTeacherStudent } from "@/lib/personalTrainingCredits";
import { isExclusiveTrainingType, paymentTypeMatchesDuration, trainingDurationOptions } from "@/lib/personalTrainingRules";
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
  const studentId = String(formData.get("studentId") || "");
  const paymentTypeId = String(formData.get("paymentTypeId") || "");
  const durationMinutes = Number(formData.get("durationMinutes"));
  const redirectPath = `/piscina-25m?date=${dateValue || ""}`;
  const errorPath = `${redirectPath}&error=1`;

  const bookingDate = parseDateParam(dateValue);

  if (
    !dateValue ||
    !poolBlockId ||
    !studentId ||
    !paymentTypeId ||
    !trainingDurationOptions.includes(durationMinutes) ||
    !isTodayOrFuture(bookingDate)
  ) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const [block, paymentType, balance] = await Promise.all([
    prisma.poolScheduleBlock.findUnique({ where: { id: poolBlockId } }),
    prisma.personalTrainingPaymentType.findFirst({ where: { id: paymentTypeId, active: true } }),
    getCreditBalanceForTeacherStudent(user.id, studentId)
  ]);

  if (
    !block ||
    block.type !== "treino" ||
    block.weekday !== dateToWeekday(bookingDate) ||
    block.endMinutes - block.startMinutes < durationMinutes ||
    !paymentType ||
    !paymentTypeMatchesDuration(paymentType.description, durationMinutes) ||
    !balance ||
    !balance.canBook
  ) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const startMinutes = block.startMinutes;
  const endMinutes = startMinutes + durationMinutes;

  const overlappingBookings = await prisma.personalTrainingBooking.findMany({
    where: {
      bookingDate: new Date(`${dateValue}T00:00:00`),
      poolBlockId,
      status: { not: "cancelled" },
      startMinutes: { lt: endMinutes },
      endMinutes: { gt: startMinutes }
    },
    include: { paymentType: true }
  });

  const sameTeacherOrStudent = overlappingBookings.some(
    (booking) => booking.teacherId === user.id || booking.studentId === studentId
  );
  const existingExclusive = overlappingBookings.some((booking) => isExclusiveTrainingType(booking.paymentType?.description));
  const newExclusive = isExclusiveTrainingType(paymentType.description);
  const exceedsCapacity = overlappingBookings.length >= 2;

  if (sameTeacherOrStudent || existingExclusive || (newExclusive && overlappingBookings.length > 0) || exceedsCapacity) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  await prisma.personalTrainingBooking.create({
    data: {
      bookingDate: new Date(`${dateValue}T00:00:00`),
      poolBlockId,
      teacherId: user.id,
      studentId,
      paymentTypeId,
      startMinutes,
      endMinutes,
      durationMinutes,
      creditsUsed: 1
    }
  });

  return NextResponse.redirect(appRedirectUrl(`${redirectPath}&success=1`, request));
}
