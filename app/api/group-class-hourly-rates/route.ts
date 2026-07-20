import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

function redirectPath(request: Request, status: "success" | "error") {
  return NextResponse.redirect(appRedirectUrl(`/valor-hora-aulas?${status}=1`, request));
}

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const name = String(formData.get("name") || "").trim();
  const hourlyRate = Number(String(formData.get("hourlyRate") || "").replace(",", "."));
  const matchSource = String(formData.get("matchSource") || "title");
  const matchPatterns = String(formData.get("matchPatterns") || "").trim();
  const calculationMode = String(formData.get("calculationMode") || "class_duration");
  const durationFilterValue = String(formData.get("durationFilter") || "");
  const durationFilter = durationFilterValue ? Number(durationFilterValue) : null;
  const displayOrder = Number(formData.get("displayOrder"));

  if (
    !name ||
    !Number.isFinite(hourlyRate) ||
    hourlyRate < 0 ||
    !["title", "apoio_cais"].includes(matchSource) ||
    !["class_duration", "minutes"].includes(calculationMode) ||
    (durationFilter !== null && ![30, 45, 60].includes(durationFilter)) ||
    !Number.isInteger(displayOrder)
  ) {
    return redirectPath(request, "error");
  }

  await prisma.groupClassHourlyRate.create({
    data: {
      name,
      hourlyRate,
      matchSource,
      matchPatterns: matchSource === "title" ? matchPatterns : null,
      calculationMode,
      durationFilter,
      displayOrder
    }
  });

  return redirectPath(request, "success");
}
