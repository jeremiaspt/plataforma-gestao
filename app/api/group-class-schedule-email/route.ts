import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { sendGroupClassScheduleEmail } from "@/lib/groupClassScheduleEmail";
import { dateToInputValue, parseDateParam } from "@/lib/pool";
import { appRedirectUrl } from "@/lib/url";

function startOfWeek(date: Date) {
  const start = new Date(date);
  const weekday = start.getDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  start.setDate(start.getDate() + offset);
  start.setHours(0, 0, 0, 0);
  return start;
}

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const teacherId = String(formData.get("teacherId") || "");
  const weekValue = String(formData.get("week") || "");
  const weekStart = startOfWeek(parseDateParam(weekValue));
  const redirectPath = `/aulas-grupo?tab=professor&teacherId=${teacherId}&week=${dateToInputValue(weekStart)}`;

  if (!teacherId) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&emailError=1`, request));
  }

  const result = await sendGroupClassScheduleEmail({ teacherId, weekStart });

  return NextResponse.redirect(appRedirectUrl(`${redirectPath}&${result.ok ? "emailSuccess" : "emailError"}=1`, request));
}
