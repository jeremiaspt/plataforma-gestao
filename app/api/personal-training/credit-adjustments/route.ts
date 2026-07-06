import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { getCreditBalanceForTeacherStudentTrainingType } from "@/lib/personalTrainingCredits";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const teacherId = String(formData.get("teacherId") || "");
  const studentId = String(formData.get("studentId") || "");
  const trainingTypeKey = String(formData.get("trainingTypeKey") || "");
  const targetAvailableCredits = Number(formData.get("targetAvailableCredits"));
  const reason = String(formData.get("reason") || "").trim();
  const redirectPath = `/treinos-personalizados/pagamentos?teacherId=${teacherId}&tab=credits`;

  if (!teacherId || !studentId || !trainingTypeKey || !Number.isInteger(targetAvailableCredits)) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&error=1`, request));
  }

  const balance = await getCreditBalanceForTeacherStudentTrainingType(teacherId, studentId, trainingTypeKey);

  if (!balance) {
    return NextResponse.redirect(appRedirectUrl(`${redirectPath}&error=1`, request));
  }

  const deltaCredits = targetAvailableCredits - balance.availableCredits;

  if (deltaCredits !== 0) {
    await prisma.personalTrainingCreditAdjustment.create({
      data: {
        teacherId,
        studentId,
        trainingTypeKey,
        trainingTypeName: balance.trainingTypeName,
        deltaCredits,
        reason,
        createdById: user.id,
        createdByName: user.name
      }
    });
  }

  return NextResponse.redirect(appRedirectUrl(`${redirectPath}&creditSuccess=1`, request));
}
