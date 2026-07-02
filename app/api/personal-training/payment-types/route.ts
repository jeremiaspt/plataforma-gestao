import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

function redirectPath(request: Request, status: "success" | "error") {
  return NextResponse.redirect(appRedirectUrl(`/treinos-personalizados/tipos?${status}=1`, request));
}

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const description = String(formData.get("description") || "").trim();
  const credits = Number(formData.get("credits"));
  const price = Number(formData.get("price"));
  const teacherPrice = Number(formData.get("teacherPrice"));

  if (
    !description ||
    !Number.isInteger(credits) ||
    credits < 1 ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Number.isFinite(teacherPrice) ||
    teacherPrice < 0
  ) {
    return redirectPath(request, "error");
  }

  const exists = await prisma.personalTrainingPaymentType.findUnique({ where: { description } });

  if (exists) {
    return redirectPath(request, "error");
  }

  await prisma.personalTrainingPaymentType.create({
    data: {
      description,
      credits,
      price,
      teacherPrice
    }
  });

  return redirectPath(request, "success");
}
