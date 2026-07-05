import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { isTodayOrFuture } from "@/lib/pool";
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
  const redirectPath = `/piscina-25m?date=${dateValue || ""}`;

  if (!bookingGroupId) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&error=1`, request));
  }

  const bookings = await prisma.personalTrainingBooking.findMany({
    where: {
      bookingGroupId,
      teacherId: user.id,
      status: { not: "cancelled" }
    }
  });

  if (bookings.length === 0 || bookings.some((booking) => !isTodayOrFuture(booking.bookingDate))) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&error=1`, request));
  }

  await prisma.personalTrainingBooking.updateMany({
    where: {
      bookingGroupId,
      teacherId: user.id,
      status: { not: "cancelled" }
    },
    data: { status: "cancelled" }
  });

  return NextResponse.redirect(appRedirectUrl(`${redirectPath}&success=1`, request));
}
