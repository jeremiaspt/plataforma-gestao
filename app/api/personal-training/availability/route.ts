import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { blockNonAdminDuringMaintenance } from "@/lib/maintenance";
import { parseTimeToMinutes } from "@/lib/pool";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

const redirectPath = "/disponibilidade-tp";

export async function POST(request: Request) {
  const user = await requireUser();
  const isAdmin = hasRole(user, "admin");
  const isProfessor = hasRole(user, "professor");

  if (!isAdmin && !isProfessor) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const maintenanceBlock = await blockNonAdminDuringMaintenance({ user, request, redirectPath });
  if (maintenanceBlock) return maintenanceBlock;

  const formData = await request.formData();
  const action = String(formData.get("action") || "create");

  if (action === "delete") {
    const id = String(formData.get("id") || "");
    if (!id) return NextResponse.redirect(appRedirectUrl(`${redirectPath}?error=1`, request));

    await prisma.personalTrainingAvailability.updateMany({
      where: {
        id,
        ...(isAdmin ? {} : { teacherId: user.id })
      },
      data: { active: false }
    });

    return NextResponse.redirect(appRedirectUrl(`${redirectPath}?success=1`, request));
  }

  const weekday = Number(formData.get("weekday"));
  const startMinutes = parseTimeToMinutes(String(formData.get("startTime") || ""));
  const endMinutes = parseTimeToMinutes(String(formData.get("endTime") || ""));
  const notes = String(formData.get("notes") || "").trim();
  const teacherId = isAdmin && formData.get("teacherId") ? String(formData.get("teacherId")) : user.id;

  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}?error=1`, request));
  }

  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, active: true, roles: { some: { role: { key: "professor" } } } },
    select: { id: true }
  });

  if (!teacher) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}?error=1`, request));
  }

  await prisma.personalTrainingAvailability.create({
    data: {
      endMinutes,
      notes: notes || null,
      startMinutes,
      teacherId,
      weekday
    }
  });

  return NextResponse.redirect(appRedirectUrl(`${redirectPath}?success=1`, request));
}
