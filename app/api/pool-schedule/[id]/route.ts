import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  dayBounds,
  getPoolMapByKey,
  parseDateInput,
  parseTimeToMinutes,
  poolBlockPeriodsOverlap,
  poolBlockTypes,
  poolRecurrenceOptions
} from "@/lib/pool";
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
  const requestedPoolMap = getPoolMapByKey(String(formData.get("poolKey") || "piscina_25m"));
  const redirectPath = `${requestedPoolMap.basePath}${selectedDate ? `?date=${selectedDate}&tab=weekly` : "?tab=weekly"}`;
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
    const recurrenceTypeValue = String(formData.get("recurrenceType") || "recurring");
    const recurrenceType = poolRecurrenceOptions.some((option) => option.key === recurrenceTypeValue)
      ? recurrenceTypeValue
      : "recurring";
    const validFrom = recurrenceType === "period" ? parseDateInput(String(formData.get("validFrom") || "")) : null;
    const validTo = recurrenceType === "period" ? parseDateInput(String(formData.get("validTo") || "")) : null;
    const startMinutes = parseTimeToMinutes(String(formData.get("startTime") || ""));
    const endMinutes = parseTimeToMinutes(String(formData.get("endTime") || ""));

    if (
      !getPoolMapByKey(existingBlock.poolKey).lanes.some((lane) => lane.number === laneNumber) ||
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

    if (recurrenceType === "period" && (!validFrom || !validTo || validFrom > validTo)) {
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

    const conflictCandidates = await prisma.poolScheduleBlock.findMany({
      where: {
        id: { not: id },
        active: true,
        poolKey: existingBlock.poolKey,
        weekday: existingBlock.weekday,
        laneNumber,
        startMinutes: { lt: endMinutes },
        endMinutes: { gt: startMinutes }
      }
    });
    const conflict = conflictCandidates.find((block) =>
      poolBlockPeriodsOverlap({ recurrenceType, validFrom, validTo }, block)
    );

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
            poolKey: existingBlock.poolKey,
            laneNumber,
            startMinutes,
            endMinutes,
            title,
            type,
            notes,
            recurrenceType,
            validFrom,
            validTo,
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
          recurrenceType,
          validFrom,
          validTo,
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
