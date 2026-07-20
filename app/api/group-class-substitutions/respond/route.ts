import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { blockNonAdminDuringMaintenance } from "@/lib/maintenance";
import { dateToInputValue } from "@/lib/pool";
import { prisma } from "@/lib/prisma";
import { sendSubstitutionResponseEmail } from "@/lib/substitutionEmail";
import { appRedirectUrl } from "@/lib/url";

function redirectPath(request: Request, status: "success" | "error", dateValue: string, tab = "gerir") {
  const params = new URLSearchParams({ tab, [status]: "1" });

  if (dateValue) {
    params.set("date", dateValue);
  }

  return NextResponse.redirect(appRedirectUrl(`/substituicoes?${params.toString()}`, request));
}

function requestStatusFromItems(items: Array<{ status: string }>) {
  if (items.some((item) => item.status === "rejected")) return "rejected";
  if (items.length > 0 && items.every((item) => item.status === "approved")) return "approved";
  return "pending";
}

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "professor") && !hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const itemId = String(formData.get("itemId") || "");
  const action = String(formData.get("action") || "");
  const dateValue = String(formData.get("date") || "");
  const maintenanceBlock = await blockNonAdminDuringMaintenance({ user, request, redirectPath: `/substituicoes?date=${dateValue}` });

  if (maintenanceBlock) {
    return maintenanceBlock;
  }

  if (!itemId || (action !== "approved" && action !== "rejected")) {
    return redirectPath(request, "error", dateValue);
  }

  const item = await prisma.groupClassSubstitutionItem.findUnique({
    where: { id: itemId },
    include: {
      request: {
        include: {
          absentTeacher: { select: { email: true, name: true } },
          items: true
        }
      },
      substituteTeacher: { select: { name: true } }
    }
  });

  if (!item || item.request.status === "cancelled" || item.status !== "pending") {
    return redirectPath(request, "error", dateValue);
  }

  if (item.substituteTeacherId !== user.id) {
    return redirectPath(request, "error", dateValue || dateToInputValue(item.request.substitutionDate));
  }

  const updatedItems = item.request.items.map((requestItem) => (requestItem.id === item.id ? { ...requestItem, status: action } : requestItem));
  const nextRequestStatus = requestStatusFromItems(updatedItems);

  await prisma.$transaction([
    prisma.groupClassSubstitutionItem.update({
      where: { id: item.id },
      data: { status: action }
    }),
    prisma.groupClassSubstitutionRequest.update({
      where: { id: item.requestId },
      data: { status: nextRequestStatus }
    })
  ]);

  const actionUrl = appRedirectUrl(
    `/substituicoes?tab=gerir&date=${dateToInputValue(item.request.substitutionDate)}`,
    request
  ).toString();

  await sendSubstitutionResponseEmail({
    requestId: item.requestId,
    absentTeacherEmail: item.request.absentTeacher.email,
    absentTeacherName: item.request.absentTeacher.name,
    substituteTeacherName: item.substituteTeacher.name,
    substitutionDate: item.request.substitutionDate,
    items: [item],
    response: action,
    actionUrl
  });

  return redirectPath(request, "success", dateValue || dateToInputValue(item.request.substitutionDate));
}
