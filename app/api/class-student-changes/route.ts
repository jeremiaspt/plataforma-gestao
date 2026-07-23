import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { sendClassChangeEmail } from "@/lib/classStudentEmail";
import { findGroupClassOption, getGroupClassOptions } from "@/lib/groupClassOptions";
import { blockNonAdminDuringMaintenance } from "@/lib/maintenance";
import { appRedirectUrl } from "@/lib/url";

function redirectPath(request: Request, path: string, status: "success" | "error", message?: string) {
  const params = new URLSearchParams({ [status]: "1" });
  if (message) params.set("message", message);
  return NextResponse.redirect(appRedirectUrl(`${path}?${params.toString()}`, request));
}

export async function POST(request: Request) {
  const user = await requireUser();
  const canCreate = hasRole(user, "admin") || hasRole(user, "recepcao");
  const basePath = "/troca-de-turma";

  if (!canCreate) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const maintenanceBlock = await blockNonAdminDuringMaintenance({ user, request, redirectPath: basePath });
  if (maintenanceBlock) {
    return maintenanceBlock;
  }

  const formData = await request.formData();
  const originClassKey = String(formData.get("originClassKey") || "");
  const destinationClassKey = String(formData.get("destinationClassKey") || "");
  const memberNumber = String(formData.get("memberNumber") || "").trim();
  const studentName = String(formData.get("studentName") || "").trim();

  if (!originClassKey || !destinationClassKey || !memberNumber || !studentName) {
    return redirectPath(request, basePath, "error", "Preenche o numero de utente, nome e as turmas de origem e destino.");
  }

  if (originClassKey === destinationClassKey) {
    return redirectPath(request, basePath, "error", "A turma de origem e a turma de destino nao podem ser a mesma.");
  }

  const options = await getGroupClassOptions();
  const originClass = findGroupClassOption(options, originClassKey);
  const destinationClass = findGroupClassOption(options, destinationClassKey);

  if (!originClass || !destinationClass) {
    return redirectPath(request, basePath, "error", "Uma das turmas selecionadas ja nao esta disponivel.");
  }

  await sendClassChangeEmail({
    createdByName: user.name,
    destinationClass,
    originClass,
    student: {
      memberNumber,
      name: studentName
    }
  });

  return redirectPath(request, basePath, "success");
}
