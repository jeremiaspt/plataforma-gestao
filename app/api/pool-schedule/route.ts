import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  dayBounds,
  parseDateInput,
  parseTimeToMinutes,
  poolBlockPeriodsOverlap,
  poolBlockTypes,
  getPoolMapByKey,
  poolRecurrenceOptions,
  poolWeekdays
} from "@/lib/pool";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const weekday = Number(formData.get("weekday"));
  const poolMap = getPoolMapByKey(String(formData.get("poolKey") || "piscina_25m"));
  const laneNumber = Number(formData.get("laneNumber"));
  const selectedDate = String(formData.get("date") || "");
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
  const redirectPath = `${poolMap.basePath}${selectedDate ? `?date=${selectedDate}` : ""}`;
  const errorPath = `${redirectPath}${redirectPath.includes("?") ? "&" : "?"}error=1`;

  if (
    !poolWeekdays.some((day) => day.key === weekday) ||
    !poolMap.lanes.some((lane) => lane.number === laneNumber) ||
    !title ||
    !poolBlockTypes.some((blockType) => blockType.key === type) ||
    startMinutes === null ||
    endMinutes === null
  ) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const bounds = dayBounds(weekday);
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
      active: true,
      weekday,
      poolKey: poolMap.key,
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

  await prisma.poolScheduleBlock.create({
    data: {
      weekday,
      poolKey: poolMap.key,
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
  });

  return NextResponse.redirect(appRedirectUrl(redirectPath, request));
}
