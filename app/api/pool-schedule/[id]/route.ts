import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const { id } = await params;
  const formData = await request.formData();
  const selectedDate = String(formData.get("date") || "");
  const redirectPath = `/piscina-25m${selectedDate ? `?date=${selectedDate}` : ""}`;
  const errorPath = `${redirectPath}${redirectPath.includes("?") ? "&" : "?"}error=1`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeFutureBookings = await prisma.personalTrainingBooking.count({
    where: {
      poolBlockId: id,
      bookingDate: { gte: today },
      status: { not: "cancelled" }
    }
  });

  if (activeFutureBookings > 0) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const bookingCount = await prisma.personalTrainingBooking.count({
    where: { poolBlockId: id }
  });

  if (bookingCount > 0) {
    await prisma.poolScheduleBlock.update({
      where: { id },
      data: { active: false }
    });
  } else {
    await prisma.poolScheduleBlock.delete({ where: { id } });
  }

  return NextResponse.redirect(appRedirectUrl(redirectPath, request));
}
