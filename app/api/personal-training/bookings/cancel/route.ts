import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { blockNonAdminDuringMaintenance } from "@/lib/maintenance";
import { getPoolMapByKey, isTodayOrFuture } from "@/lib/pool";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "professor")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const bookingGroupId = String(formData.get("bookingGroupId") || "");
  const dateValue = String(formData.get("date") || "");
  const poolMap = getPoolMapByKey(String(formData.get("poolKey") || "piscina_25m"));
  const redirectPath = `${poolMap.basePath}?date=${dateValue || ""}`;
  const maintenanceBlock = await blockNonAdminDuringMaintenance({ user, request, redirectPath });

  if (maintenanceBlock) {
    return maintenanceBlock;
  }

  if (!bookingGroupId) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&error=1`, request));
  }

  const bookings = await prisma.personalTrainingBooking.findMany({
    where: {
      bookingGroupId,
      teacherId: user.id,
      status: { not: "cancelled" }
    },
    include: { student: true, paymentType: true, poolBlock: true }
  });

  if (
    bookings.length === 0 ||
    bookings.some((booking) => !isTodayOrFuture(booking.bookingDate) || booking.poolBlock.poolKey !== poolMap.key)
  ) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&error=1`, request));
  }

  await prisma.$transaction(async (tx) => {
    await tx.personalTrainingBooking.updateMany({
      where: {
        bookingGroupId,
        teacherId: user.id,
        status: { not: "cancelled" }
      },
      data: { status: "cancelled" }
    });

    const booking = bookings[0];

    await tx.personalTrainingBookingLog.create({
      data: {
        action: "cancelamento",
        bookingGroupId,
        bookingDate: booking.bookingDate,
        teacherName: user.name,
        studentNames: bookings.map((item) => item.student.fullName).join(", "),
        paymentType: booking.paymentType?.description || null,
        poolBlockTitle: booking.poolBlock.title,
        laneNumber: booking.poolBlock.laneNumber,
        startMinutes: booking.startMinutes,
        endMinutes: booking.endMinutes,
        createdById: user.id,
        createdByName: user.name
      }
    });
  });

  return NextResponse.redirect(appRedirectUrl(`${redirectPath}&success=1`, request));
}
