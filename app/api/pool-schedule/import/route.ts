import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dayBounds, poolWeekdays } from "@/lib/pool";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const targetWeekday = Number(formData.get("targetWeekday"));
  const sourceWeekday = Number(formData.get("sourceWeekday"));
  const selectedDate = String(formData.get("date") || "");
  const confirmed = formData.get("confirmImportDay") === "on";
  const redirectPath = `/piscina-25m${selectedDate ? `?date=${selectedDate}&tab=weekly` : "?tab=weekly"}`;
  const errorPath = `${redirectPath}&error=1`;

  if (
    !confirmed ||
    sourceWeekday === targetWeekday ||
    !poolWeekdays.some((day) => day.key === sourceWeekday) ||
    !poolWeekdays.some((day) => day.key === targetWeekday)
  ) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const sourceBlocks = await prisma.poolScheduleBlock.findMany({
    where: { weekday: sourceWeekday, active: true },
    orderBy: [{ laneNumber: "asc" }, { startMinutes: "asc" }]
  });

  if (sourceBlocks.length === 0) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const bounds = dayBounds(targetWeekday);
  const blocksFitTargetDay = sourceBlocks.every(
    (block) => block.startMinutes >= bounds.start && block.endMinutes <= bounds.end
  );

  if (!blocksFitTargetDay) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const targetBlocks = await prisma.poolScheduleBlock.findMany({
    where: { weekday: targetWeekday, active: true },
    select: { laneNumber: true, startMinutes: true, endMinutes: true }
  });

  const hasConflict = sourceBlocks.some((sourceBlock) =>
    targetBlocks.some(
      (targetBlock) =>
        targetBlock.laneNumber === sourceBlock.laneNumber &&
        sourceBlock.startMinutes < targetBlock.endMinutes &&
        sourceBlock.endMinutes > targetBlock.startMinutes
    )
  );

  if (hasConflict) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  await prisma.poolScheduleBlock.createMany({
    data: sourceBlocks.map((block) => ({
      weekday: targetWeekday,
      laneNumber: block.laneNumber,
      startMinutes: block.startMinutes,
      endMinutes: block.endMinutes,
      title: block.title,
      type: block.type,
      notes: block.notes,
      active: true,
      recurrenceType: block.recurrenceType,
      validFrom: block.validFrom,
      validTo: block.validTo,
      teacherId: block.teacherId,
      createdById: user.id
    }))
  });

  return NextResponse.redirect(appRedirectUrl(redirectPath, request));
}
