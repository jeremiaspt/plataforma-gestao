import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { parseDateInput, requiredBirthdayMonitors, slotByKey, weekendDatesForMonth } from "@/lib/birthdayParties";
import { blockNonAdminDuringMaintenance } from "@/lib/maintenance";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

function redirectPath(request: Request, month: string, status: "success" | "error", message?: string) {
  const params = new URLSearchParams({ month, [status]: "1" });
  if (message) params.set("message", message);
  return NextResponse.redirect(appRedirectUrl(`/festas-aniversario?${params.toString()}`, request));
}

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const month = String(formData.get("month") || "");
  const maintenanceBlock = await blockNonAdminDuringMaintenance({ user, request, redirectPath: `/festas-aniversario?month=${month}` });
  if (maintenanceBlock) return maintenanceBlock;

  const partyDateValue = String(formData.get("partyDate") || "");
  const partyDate = parseDateInput(partyDateValue);
  const slotKey = String(formData.get("slotKey") || "");
  const slot = slotByKey(slotKey);
  const responsibleName = String(formData.get("responsibleName") || "").trim();
  const responsibleContact = String(formData.get("responsibleContact") || "").trim();
  const responsibleEmail = String(formData.get("responsibleEmail") || "").trim();
  const ageGroup = String(formData.get("ageGroup") || "");
  const childCount = Number(formData.get("childCount") || 0);
  const receptionistId = String(formData.get("receptionistId") || "");
  const monitorIds = Array.from(new Set(formData.getAll("monitorId").map(String).filter(Boolean)));

  if (!partyDate || !slot || !responsibleName || !responsibleContact || !responsibleEmail || !ageGroup || !Number.isInteger(childCount) || childCount < 1 || !receptionistId) {
    return redirectPath(request, month, "error", "Preenche todos os campos obrigatorios da festa.");
  }

  const validWeekendDates = new Set(weekendDatesForMonth(month).map((date) => date.toDateString()));
  if (!validWeekendDates.has(partyDate.toDateString())) {
    return redirectPath(request, month, "error", "A data tem de ser um sabado ou domingo do mes selecionado.");
  }

  const monitorRequirement = requiredBirthdayMonitors(ageGroup, childCount);
  if (monitorIds.length < monitorRequirement) {
    return redirectPath(request, month, "error", `Esta festa necessita de ${monitorRequirement} monitores.`);
  }

  const [receptionist, monitors] = await Promise.all([
    prisma.user.findFirst({
      where: { id: receptionistId, active: true, roles: { some: { role: { key: "recepcao" } } } },
      select: { id: true }
    }),
    prisma.user.findMany({
      where: { id: { in: monitorIds }, active: true, roles: { some: { role: { key: "professor" } } } },
      select: { id: true }
    })
  ]);

  if (!receptionist) {
    return redirectPath(request, month, "error", "Seleciona um recepcionista valido.");
  }

  if (monitors.length !== monitorIds.length) {
    return redirectPath(request, month, "error", "Um ou mais monitores selecionados nao sao professores ativos.");
  }

  try {
    await prisma.birthdayParty.create({
      data: {
        ageGroup,
        childCount,
        createdById: user.id,
        endMinutes: slot.endMinutes,
        monitorRequirement,
        monitors: { createMany: { data: monitorIds.map((teacherId) => ({ teacherId })) } },
        partyDate,
        receptionistId,
        responsibleContact,
        responsibleEmail,
        responsibleName,
        slotKey,
        startMinutes: slot.startMinutes
      }
    });

    return redirectPath(request, month, "success");
  } catch {
    return redirectPath(request, month, "error", "Ja existe uma festa marcada nesse dia e horario.");
  }
}
