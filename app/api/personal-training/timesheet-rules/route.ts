import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

function redirectPath(request: Request, status: "success" | "error") {
  return NextResponse.redirect(appRedirectUrl(`/configurar-folha-treinos?${status}=1`, request));
}

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const name = String(formData.get("name") || "").trim();
  const studentCount = Number(formData.get("studentCount"));
  const displayOrder = Number(formData.get("displayOrder"));
  const paymentTypeIds = Array.from(new Set(formData.getAll("paymentTypeId").map(String).filter(Boolean)));

  if (!name || !Number.isInteger(studentCount) || studentCount < 1 || studentCount > 10 || !Number.isInteger(displayOrder) || paymentTypeIds.length === 0) {
    return redirectPath(request, "error");
  }

  const paymentTypes = await prisma.personalTrainingPaymentType.findMany({
    where: { id: { in: paymentTypeIds } },
    select: { id: true }
  });

  if (paymentTypes.length !== paymentTypeIds.length) {
    return redirectPath(request, "error");
  }

  await prisma.personalTrainingTimesheetRule.create({
    data: {
      name,
      studentCount,
      displayOrder,
      items: {
        createMany: {
          data: paymentTypeIds.map((paymentTypeId) => ({ paymentTypeId }))
        }
      }
    }
  });

  return redirectPath(request, "success");
}
