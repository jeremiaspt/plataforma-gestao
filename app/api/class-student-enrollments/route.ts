import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { sendClassEnrollmentEmail } from "@/lib/classStudentEmail";
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
  const basePath = "/novas-inscricoes";

  if (!canCreate) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const maintenanceBlock = await blockNonAdminDuringMaintenance({ user, request, redirectPath: basePath });
  if (maintenanceBlock) {
    return maintenanceBlock;
  }

  const formData = await request.formData();
  const classKey = String(formData.get("classKey") || "");
  const memberNumber = String(formData.get("memberNumber") || "").trim();
  const studentName = String(formData.get("studentName") || "").trim();

  if (!classKey || !memberNumber || !studentName) {
    return redirectPath(request, basePath, "error", "Preenche o numero de utente, nome e turma.");
  }

  const options = await getGroupClassOptions();
  const classOption = findGroupClassOption(options, classKey);

  if (!classOption) {
    return redirectPath(request, basePath, "error", "A turma selecionada ja nao esta disponivel.");
  }

  await sendClassEnrollmentEmail({
    classOption,
    createdByName: user.name,
    student: {
      memberNumber,
      name: studentName
    }
  });

  return redirectPath(request, basePath, "success");
}
