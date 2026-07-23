import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { requiredBirthdayMonitors } from "@/lib/birthdayParties";
import { blockNonAdminDuringMaintenance } from "@/lib/maintenance";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

function redirectPath(request: Request, month: string, status: "success" | "error", message?: string) {
  const params = new URLSearchParams({ month, [status]: "1" });
  if (message) params.set("message", message);
  return NextResponse.redirect(appRedirectUrl(`/festas-aniversario?${params.toString()}`, request));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const isAdmin = hasRole(user, "admin");
  const isReception = hasRole(user, "recepcao");

  if (!isAdmin && !isReception) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const month = String(formData.get("month") || "");
  const action = String(formData.get("action") || "");
  const maintenanceBlock = await blockNonAdminDuringMaintenance({ user, request, redirectPath: `/festas-aniversario?month=${month}` });
  if (maintenanceBlock) return maintenanceBlock;

  const party = await prisma.birthdayParty.findUnique({ where: { id }, include: { monitors: true } });
  if (!party) {
    return redirectPath(request, month, "error", "A festa selecionada ja nao existe.");
  }

  if (action === "payment") {
    const paymentStatus = String(formData.get("paymentStatus") || "") === "paid" ? "paid" : "not_paid";

    if (paymentStatus !== party.paymentStatus) {
      await prisma.$transaction([
        prisma.birthdayParty.update({
          where: { id },
          data: { paymentStatus }
        }),
        prisma.birthdayPartyPaymentLog.create({
          data: {
            changedById: user.id,
            changedByName: user.name,
            newStatus: paymentStatus,
            partyId: id,
            previousStatus: party.paymentStatus
          }
        })
      ]);
    }

    return redirectPath(request, month, "success");
  }

  if (!isAdmin) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  if (action === "delete") {
    await prisma.birthdayParty.delete({ where: { id } });
    return redirectPath(request, month, "success");
  }

  const responsibleName = String(formData.get("responsibleName") || "").trim();
  const responsibleContact = String(formData.get("responsibleContact") || "").trim();
  const responsibleEmail = String(formData.get("responsibleEmail") || "").trim();
  const ageGroup = String(formData.get("ageGroup") || "");
  const childCount = Number(formData.get("childCount") || 0);
  const receptionistId = String(formData.get("receptionistId") || "");
  const rawMonitorIds = formData.getAll("monitorId").map(String).filter(Boolean);
  const monitorIds = Array.from(new Set(rawMonitorIds));

  if (!responsibleName || !responsibleContact || !responsibleEmail || !ageGroup || !Number.isInteger(childCount) || childCount < 1) {
    return redirectPath(request, month, "error", "Preenche todos os campos obrigatorios da festa.");
  }

  const monitorRequirement = requiredBirthdayMonitors(ageGroup, childCount);

  if (rawMonitorIds.length !== monitorIds.length) {
    return redirectPath(request, month, "error", "Nao podes selecionar o mesmo professor em mais do que um campo de monitor.");
  }

  const [receptionist, monitors] = await Promise.all([
    receptionistId
      ? prisma.user.findFirst({
          where: { id: receptionistId, active: true, roles: { some: { role: { key: "recepcao" } } } },
          select: { id: true }
        })
      : Promise.resolve(null),
    prisma.user.findMany({
      where: { id: { in: monitorIds }, active: true, roles: { some: { role: { key: "professor" } } } },
      select: { id: true }
    })
  ]);

  if ((receptionistId && !receptionist) || monitors.length !== monitorIds.length) {
    return redirectPath(request, month, "error", "Seleciona recepcionista e monitores validos.");
  }

  await prisma.$transaction([
    prisma.birthdayParty.update({
      where: { id },
      data: {
        ageGroup,
        childCount,
        monitorRequirement,
        receptionistId: receptionist?.id || null,
        responsibleContact,
        responsibleEmail,
        responsibleName
      }
    }),
    prisma.birthdayPartyMonitor.deleteMany({ where: { partyId: id } }),
    prisma.birthdayPartyMonitor.createMany({ data: monitorIds.map((teacherId) => ({ partyId: id, teacherId })) })
  ]);

  return redirectPath(request, month, "success");
}
