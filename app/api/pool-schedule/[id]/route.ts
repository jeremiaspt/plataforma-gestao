import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dayBounds, parseTimeToMinutes, poolBlockTypes, poolLanes } from "@/lib/pool";
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
  const redirectPath = `/piscina-25m${selectedDate ? `?date=${selectedDate}&tab=weekly` : "?tab=weekly"}`;
  const errorPath = `${redirectPath}${redirectPath.includes("?") ? "&" : "?"}error=1`;
  const action = String(formData.get("action") || "save");
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

  if (action !== "delete") {
    const existingBlock = await prisma.poolScheduleBlock.findUnique({ where: { id } });

    if (!existingBlock || !existingBlock.active) {
      return NextResponse.redirect(appRedirectUrl(errorPath, request));
    }

    const laneNumber = Number(formData.get("laneNumber"));
    const title = String(formData.get("title") || "").trim();
    const type = String(formData.get("type") || "outro");
    const notes = String(formData.get("notes") || "").trim();
    const teacherId = String(formData.get("teacherId") || "");
    const startMinutes = parseTimeToMinutes(String(formData.get("startTime") || ""));
    const endMinutes = parseTimeToMinutes(String(formData.get("endTime") || ""));

    if (
      !poolLanes.includes(laneNumber) ||
      !title ||
      !poolBlockTypes.some((blockType) => blockType.key === type) ||
      startMinutes === null ||
      endMinutes === null
    ) {
      return NextResponse.redirect(appRedirectUrl(errorPath, request));
    }

    const bounds = dayBounds(existingBlock.weekday);
    const validTimes =
      startMinutes >= bounds.start &&
      endMinutes <= bounds.end &&
      startMinutes < endMinutes &&
      startMinutes % 5 === 0 &&
      endMinutes % 5 === 0;

    if (!validTimes) {
      return NextResponse.redirect(appRedirectUrl(errorPath, request));
    }

    const selectedTeacher = teacherId
      ? await prisma.user.findFirst({
          where: {
            id: teacherId,
            active: true,
            roles: { some: { role: { key: "professor" } } }
          },
          select: { id: true }
        })
      : null;

    if ((type === "aula" && !selectedTeacher) || (teacherId && !selectedTeacher)) {
      return NextResponse.redirect(appRedirectUrl(errorPath, request));
    }

    const conflict = await prisma.poolScheduleBlock.findFirst({
      where: {
        id: { not: id },
        active: true,
        weekday: existingBlock.weekday,
        laneNumber,
        startMinutes: { lt: endMinutes },
        endMinutes: { gt: startMinutes }
      }
    });

    if (conflict) {
      return NextResponse.redirect(appRedirectUrl(errorPath, request));
    }

    const bookingCount = await prisma.personalTrainingBooking.count({
      where: { poolBlockId: id }
    });

    if (bookingCount > 0) {
      await prisma.$transaction([
        prisma.poolScheduleBlock.update({
          where: { id },
          data: { active: false }
        }),
        prisma.poolScheduleBlock.create({
          data: {
            weekday: existingBlock.weekday,
            laneNumber,
            startMinutes,
            endMinutes,
            title,
            type,
            notes,
            teacherId: selectedTeacher?.id || null,
            createdById: user.id
          }
        })
      ]);
    } else {
      await prisma.poolScheduleBlock.update({
        where: { id },
        data: {
          laneNumber,
          startMinutes,
          endMinutes,
          title,
          type,
          notes,
          teacherId: selectedTeacher?.id || null
        }
      });
    }

    return NextResponse.redirect(appRedirectUrl(redirectPath, request));
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
