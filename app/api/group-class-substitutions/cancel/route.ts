import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { blockNonAdminDuringMaintenance } from "@/lib/maintenance";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

function redirectPath(request: Request, status: "success" | "error", dateValue: string, teacherId?: string, tab?: string) {
  const params = new URLSearchParams({ [status]: "1" });

  if (tab) {
    params.set("tab", tab);
  }

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
  const requestId = String(formData.get("requestId") || "");
  const dateValue = String(formData.get("date") || "");
  const teacherId = String(formData.get("teacherId") || "");
  const tab = String(formData.get("tab") || "");
  const statusFilter = String(formData.get("status") || "");
  const reason = String(formData.get("reason") || "").trim();
  const maintenanceBlock = await blockNonAdminDuringMaintenance({ user, request, redirectPath: `/substituicoes?date=${dateValue}` });

  if (maintenanceBlock) {
    return maintenanceBlock;
  }

  const substitutionRequest = await prisma.groupClassSubstitutionRequest.findUnique({
    where: { id: requestId },
    select: { absentTeacherId: true, status: true }
  });

  if (!substitutionRequest || substitutionRequest.status === "cancelled" || !reason) {
    return redirectPath(request, "error", dateValue, teacherId, tab);
  }

  if (!isAdmin && substitutionRequest.absentTeacherId !== user.id) {
    return redirectPath(request, "error", dateValue, teacherId, tab);
  }

  await prisma.$transaction([
    prisma.groupClassSubstitutionRequest.update({
      where: { id: requestId },
      data: {
        cancelReason: reason,
        cancelledAt: new Date(),
        cancelledById: user.id,
        cancelledByName: user.name,
        status: "cancelled"
      }
    }),
    prisma.groupClassSubstitutionItem.updateMany({
      where: { requestId },
      data: { status: "cancelled" }
    })
  ]);

  const params = new URLSearchParams({ success: "1" });

  if (tab) params.set("tab", tab);
  if (dateValue) params.set("date", dateValue);
  if (teacherId) params.set("teacherId", teacherId);
  if (statusFilter) params.set("status", statusFilter);

  return NextResponse.redirect(appRedirectUrl(`/substituicoes?${params.toString()}`, request));
}
