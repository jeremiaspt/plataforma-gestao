import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

function redirectPath(request: Request, status: "success" | "error") {
  return NextResponse.redirect(appRedirectUrl(`/configurar-folha-treinos?${status}=1`, request));
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
    await prisma.personalTrainingTimesheetRule.delete({ where: { id } }).catch(() => null);
    return redirectPath(request, "success");
  }

  const name = String(formData.get("name") || "").trim();
  const studentCount = Number(formData.get("studentCount"));
  const displayOrder = Number(formData.get("displayOrder"));
  const active = formData.get("active") === "on";
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

  await prisma.$transaction([
    prisma.personalTrainingTimesheetRule.update({
      where: { id },
      data: { active, displayOrder, name, studentCount }
    }),
    prisma.personalTrainingTimesheetRuleItem.deleteMany({ where: { ruleId: id } }),
    prisma.personalTrainingTimesheetRuleItem.createMany({
      data: paymentTypeIds.map((paymentTypeId) => ({ paymentTypeId, ruleId: id }))
    })
  ]);

  return redirectPath(request, "success");
}
