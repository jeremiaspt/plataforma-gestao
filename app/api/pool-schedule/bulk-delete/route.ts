import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { poolWeekdays } from "@/lib/pool";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const weekday = Number(formData.get("weekday"));
  const selectedDate = String(formData.get("date") || "");
  const confirmed = formData.get("confirmDeleteDay") === "on";
  const redirectPath = `/piscina-25m${selectedDate ? `?date=${selectedDate}&tab=weekly` : "?tab=weekly"}`;
  const errorPath = `${redirectPath}&error=1`;

  if (!confirmed || !poolWeekdays.some((day) => day.key === weekday)) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const blocks = await prisma.poolScheduleBlock.findMany({
    where: { weekday, active: true },
    select: { id: true }
  });
  const blockIds = blocks.map((block) => block.id);

  if (blockIds.length === 0) {
    return NextResponse.redirect(appRedirectUrl(redirectPath, request));
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeFutureBookings = await prisma.personalTrainingBooking.count({
    where: {
      poolBlockId: { in: blockIds },
      bookingDate: { gte: today },
      status: { not: "cancelled" }
    }
  });

  if (activeFutureBookings > 0) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const bookingCounts = await prisma.personalTrainingBooking.groupBy({
    by: ["poolBlockId"],
    where: { poolBlockId: { in: blockIds } },
    _count: { poolBlockId: true }
  });
  const blocksWithHistory = new Set(bookingCounts.map((booking) => booking.poolBlockId));
  const idsToArchive = blockIds.filter((id) => blocksWithHistory.has(id));
  const idsToDelete = blockIds.filter((id) => !blocksWithHistory.has(id));

  await prisma.$transaction([
    ...(idsToArchive.length
      ? [
          prisma.poolScheduleBlock.updateMany({
            where: { id: { in: idsToArchive } },
            data: { active: false }
          })
        ]
      : []),
    ...(idsToDelete.length
      ? [
          prisma.poolScheduleBlock.deleteMany({
            where: { id: { in: idsToDelete } }
          })
        ]
      : [])
  ]);

  return NextResponse.redirect(appRedirectUrl(redirectPath, request));
}
