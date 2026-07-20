import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

function redirectPath(request: Request, status: "success" | "error") {
  return NextResponse.redirect(appRedirectUrl(`/valor-hora-aulas?${status}=1`, request));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const { id } = await params;
  const formData = await request.formData();
  const action = String(formData.get("action") || "save");

  if (action === "delete") {
    await prisma.groupClassHourlyRate.delete({ where: { id } });
    return redirectPath(request, "success");
  }

  const name = String(formData.get("name") || "").trim();
  const hourlyRate = Number(String(formData.get("hourlyRate") || "").replace(",", "."));
  const matchSource = String(formData.get("matchSource") || "title");
  const matchPatterns = String(formData.get("matchPatterns") || "").trim();
  const calculationMode = String(formData.get("calculationMode") || "class_duration");
  const displayOrder = Number(formData.get("displayOrder"));
  const active = formData.get("active") === "on";

  if (
    !name ||
    !Number.isFinite(hourlyRate) ||
    hourlyRate < 0 ||
    !["title", "apoio_cais"].includes(matchSource) ||
    !["class_duration", "minutes"].includes(calculationMode) ||
    !Number.isInteger(displayOrder)
  ) {
    return redirectPath(request, "error");
  }

  await prisma.groupClassHourlyRate.update({
    where: { id },
    data: {
      active,
      calculationMode,
      displayOrder,
      hourlyRate,
      matchPatterns: matchSource === "title" ? matchPatterns : null,
      matchSource,
      name
    }
  });

  return redirectPath(request, "success");
}
