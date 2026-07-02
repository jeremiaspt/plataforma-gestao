import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { decimalToNumber } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin") && !hasRole(user, "recepcao")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const teacherId = String(formData.get("teacherId") || "");
  const existingStudentId = String(formData.get("existingStudentId") || "");
  const memberNumber = String(formData.get("memberNumber") || "").trim();
  const fullName = String(formData.get("fullName") || "").trim();
  const paymentTypeId = String(formData.get("paymentTypeId") || "");
  const quantity = Number(formData.get("quantity"));
  const basePath = `/treinos-personalizados/pagamentos?teacherId=${teacherId}`;
  const errorPath = `${basePath}&error=1`;

  if (!teacherId || !paymentTypeId || !Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const [teacher, paymentType] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: teacherId,
        active: true,
        roles: { some: { role: { key: "professor" } } }
      }
    }),
    prisma.personalTrainingPaymentType.findFirst({
      where: { id: paymentTypeId, active: true }
    })
  ]);

  if (!teacher || !paymentType) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  let studentId = existingStudentId;

  if (studentId) {
    const student = await prisma.personalTrainingStudent.findUnique({ where: { id: studentId } });

    if (!student) {
      return NextResponse.redirect(appRedirectUrl(errorPath, request));
    }
  } else {
    if (!memberNumber || !fullName) {
      return NextResponse.redirect(appRedirectUrl(errorPath, request));
    }

    const student = await prisma.personalTrainingStudent.upsert({
      where: { memberNumber },
      update: { fullName },
      create: {
        memberNumber,
        fullName
      }
    });

    studentId = student.id;
  }

  const creditsPerUnit = paymentType.credits;
  const totalCredits = creditsPerUnit * quantity;
  const pricePerUnit = decimalToNumber(paymentType.price);
  const teacherPricePerUnit = decimalToNumber(paymentType.teacherPrice);
  const totalPrice = pricePerUnit * quantity;
  const teacherTotal = teacherPricePerUnit * quantity;

  await prisma.personalTrainingPayment.create({
    data: {
      teacherId,
      studentId,
      paymentTypeId,
      quantity,
      creditsPerUnit,
      totalCredits,
      pricePerUnit,
      totalPrice,
      teacherPricePerUnit,
      teacherTotal,
      createdById: user.id
    }
  });

  return NextResponse.redirect(appRedirectUrl(`${basePath}&success=1`, request));
}
