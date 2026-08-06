import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { sendTimesheetDocumentsEmail } from "@/lib/timesheetDocumentEmail";
import { appRedirectUrl } from "@/lib/url";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const teacherId = String(formData.get("teacherId") || "");
  const month = String(formData.get("month") || "");
  const documentTypeValue = String(formData.get("documentType") || "both");
  const documentType = documentTypeValue === "group" || documentTypeValue === "personal" || documentTypeValue === "both" ? documentTypeValue : "both";

  if (!teacherId || !month) {
    return NextResponse.redirect(appRedirectUrl("/envio-folhas?error=1", request));
  }

  const result = await sendTimesheetDocumentsEmail({ documentType, month, teacherId });
  const params = new URLSearchParams({
    month,
    teacherId,
    [result.ok ? "success" : "error"]: "1"
  });

  return NextResponse.redirect(appRedirectUrl(`/envio-folhas?${params.toString()}`, request));
}
