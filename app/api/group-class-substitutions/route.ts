import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { blockNonAdminDuringMaintenance } from "@/lib/maintenance";
import { dateToWeekday, overlapsExistingBlock, parseDateInput, poolBlockAppliesToDate } from "@/lib/pool";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

function redirectPath(request: Request, status: "success" | "error", dateValue: string, teacherId?: string) {
  const params = new URLSearchParams({ [status]: "1" });

  if (dateValue) {
    params.set("date", dateValue);
  }

  if (teacherId) {
    params.set("teacherId", teacherId);
  }

  return NextResponse.redirect(appRedirectUrl(`/substituicoes?${params.toString()}`, request));
}

export async function POST(request: Request) {
  const user = await requireUser();
  const isAdmin = hasRole(user, "admin");
  const isProfessor = hasRole(user, "professor");

  if (!isAdmin && !isProfessor) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const dateValue = String(formData.get("date") || "");
  const selectedTeacherId = String(formData.get("teacherId") || "");
  const absentTeacherId = isAdmin ? selectedTeacherId : user.id;
  const substitutionDate = parseDateInput(dateValue);
  const selectedBlockIds = Array.from(new Set(formData.getAll("poolBlockId").map(String).filter(Boolean)));
  const maintenanceBlock = await blockNonAdminDuringMaintenance({ user, request, redirectPath: `/substituicoes?date=${dateValue}` });

  if (maintenanceBlock) {
    return maintenanceBlock;
  }

  if (!substitutionDate || !absentTeacherId || selectedBlockIds.length === 0) {
    return redirectPath(request, "error", dateValue, selectedTeacherId);
  }

  const absentTeacher = await prisma.user.findFirst({
    where: {
      id: absentTeacherId,
      active: true,
      roles: { some: { role: { key: "professor" } } }
    },
    select: { id: true }
  });

  if (!absentTeacher) {
    return redirectPath(request, "error", dateValue, selectedTeacherId);
  }

  const weekday = dateToWeekday(substitutionDate);
  const blocks = await prisma.poolScheduleBlock.findMany({
    where: {
      id: { in: selectedBlockIds },
      active: true,
      teacherId: absentTeacherId,
      type: "aula",
      weekday
    }
  });

  if (blocks.length !== selectedBlockIds.length || blocks.some((block) => !poolBlockAppliesToDate(block, substitutionDate))) {
    return redirectPath(request, "error", dateValue, selectedTeacherId);
  }

  const substituteIds = Array.from(
    new Set(blocks.map((block) => String(formData.get(`substituteTeacherId_${block.id}`) || "")).filter(Boolean))
  );
  const substitutes = await prisma.user.findMany({
    where: {
      id: { in: substituteIds },
      active: true,
      roles: { some: { role: { key: "professor" } } }
    },
    select: { id: true }
  });
  const validSubstituteIds = new Set(substitutes.map((teacher) => teacher.id));

  const substituteBlocks = await prisma.poolScheduleBlock.findMany({
    where: {
      active: true,
      teacherId: { in: substituteIds },
      type: "aula",
      weekday
    }
  });

  const items = [];

  for (const block of blocks) {
    const substituteTeacherId = String(formData.get(`substituteTeacherId_${block.id}`) || "");
    const accumulation = formData.get(`accumulation_${block.id}`) === "on";

    if (!substituteTeacherId || substituteTeacherId === absentTeacherId || !validSubstituteIds.has(substituteTeacherId)) {
      return redirectPath(request, "error", dateValue, selectedTeacherId);
    }

    const substituteHasConflict = substituteBlocks.some(
      (candidate) =>
        candidate.teacherId === substituteTeacherId &&
        poolBlockAppliesToDate(candidate, substitutionDate) &&
        overlapsExistingBlock({
          startMinutes: block.startMinutes,
          endMinutes: block.endMinutes,
          existingStart: candidate.startMinutes,
          existingEnd: candidate.endMinutes
        })
    );

    if (substituteHasConflict && !accumulation) {
      return redirectPath(request, "error", dateValue, selectedTeacherId);
    }

    items.push({
      accumulation,
      endMinutes: block.endMinutes,
      laneNumber: block.laneNumber,
      notes: block.notes,
      poolKey: block.poolKey,
      poolScheduleBlockId: block.id,
      startMinutes: block.startMinutes,
      status: isAdmin ? "approved" : "pending",
      substituteTeacherId,
      title: block.title
    });
  }

  await prisma.groupClassSubstitutionRequest.create({
    data: {
      absentTeacherId,
      requestedById: user.id,
      status: isAdmin ? "approved" : "pending",
      substitutionDate,
      items: { createMany: { data: items } }
    }
  });

  return redirectPath(request, "success", dateValue, selectedTeacherId);
}
