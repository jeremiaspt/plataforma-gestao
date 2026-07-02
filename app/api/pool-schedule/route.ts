import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dayBounds, parseTimeToMinutes, poolBlockTypes, poolLanes, poolWeekdays } from "@/lib/pool";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const weekday = Number(formData.get("weekday"));
  const laneNumber = Number(formData.get("laneNumber"));
  const title = String(formData.get("title") || "").trim();
  const type = String(formData.get("type") || "outro");
  const notes = String(formData.get("notes") || "").trim();
  const startMinutes = parseTimeToMinutes(String(formData.get("startTime") || ""));
  const endMinutes = parseTimeToMinutes(String(formData.get("endTime") || ""));
  const redirectPath = `/piscina-25m?day=${Number.isInteger(weekday) ? weekday : 1}`;
  const errorPath = `${redirectPath}&error=1`;

  if (
    !poolWeekdays.some((day) => day.key === weekday) ||
    !poolLanes.includes(laneNumber) ||
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

  const conflict = await prisma.poolScheduleBlock.findFirst({
    where: {
      weekday,
      laneNumber,
      startMinutes: { lt: endMinutes },
      endMinutes: { gt: startMinutes }
    }
  });

  if (conflict) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  await prisma.poolScheduleBlock.create({
    data: {
      weekday,
      laneNumber,
      startMinutes,
      endMinutes,
      title,
      type,
      notes,
      createdById: user.id
    }
  });

  return NextResponse.redirect(appRedirectUrl(redirectPath, request));
}
