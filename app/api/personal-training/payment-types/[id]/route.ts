import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

function redirectPath(request: Request, status: "success" | "error") {
  return NextResponse.redirect(appRedirectUrl(`/treinos-personalizados/tipos?${status}=1`, request));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const { id } = await params;
  const formData = await request.formData();
  const action = String(formData.get("action") || "update");

  if (action === "delete") {
    await prisma.personalTrainingPaymentType.delete({ where: { id } });
    return redirectPath(request, "success");
  }

  if (action === "toggle-active") {
    const paymentType = await prisma.personalTrainingPaymentType.findUnique({
      where: { id },
      select: { active: true }
    });

    if (!paymentType) {
      return redirectPath(request, "error");
    }

    await prisma.personalTrainingPaymentType.update({
      where: { id },
      data: { active: !paymentType.active }
    });

    return redirectPath(request, "success");
  }

  const description = String(formData.get("description") || "").trim();
  const credits = Number(formData.get("credits"));

  if (!description || !Number.isInteger(credits) || credits < 1) {
    return redirectPath(request, "error");
  }

  const duplicate = await prisma.personalTrainingPaymentType.findFirst({
    where: {
      description,
      NOT: { id }
    }
  });

  if (duplicate) {
    return redirectPath(request, "error");
  }

  await prisma.personalTrainingPaymentType.update({
    where: { id },
    data: {
      description,
      credits
    }
  });

  return redirectPath(request, "success");
}
