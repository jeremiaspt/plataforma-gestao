import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { setSystemSettings } from "@/lib/maintenance";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const maintenanceMode = formData.get("maintenanceMode") === "on";
  const includeLisbonMunicipalHolidays = formData.get("includeLisbonMunicipalHolidays") === "on";
  const includeChristmasEveHoliday = formData.get("includeChristmasEveHoliday") === "on";
  const includeNewYearsEveHoliday = formData.get("includeNewYearsEveHoliday") === "on";
  const excludeDockSupportOverlapWithClasses = formData.get("excludeDockSupportOverlapWithClasses") === "on";

  try {
    await setSystemSettings({
      excludeDockSupportOverlapWithClasses,
      includeChristmasEveHoliday,
      includeLisbonMunicipalHolidays,
      includeNewYearsEveHoliday,
      maintenanceMode
    });
    return NextResponse.redirect(appRedirectUrl("/configuracoes-sistema?success=1", request));
  } catch {
    return NextResponse.redirect(appRedirectUrl("/configuracoes-sistema?error=1", request));
  }
}
