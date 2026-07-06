import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { decimalToNumber } from "@/lib/money";
import { requiredParticipantsForType } from "@/lib/personalTrainingRules";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin") && !hasRole(user, "recepcao")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const teacherId = String(formData.get("teacherId") || "");
  const existingStudentIds = formData.getAll("existingStudentId").map((value) => String(value || ""));
  const memberNumbers = formData.getAll("memberNumber").map((value) => String(value || "").trim());
  const fullNames = formData.getAll("fullName").map((value) => String(value || "").trim());
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

  const requiredParticipants = requiredParticipantsForType(paymentType.description);
  const studentIds: string[] = [];

  for (let index = 0; index < requiredParticipants; index += 1) {
    const existingStudentId = existingStudentIds[index] || "";
    const memberNumber = memberNumbers[index] || "";
    const fullName = fullNames[index] || "";

    if (existingStudentId) {
      const student = await prisma.personalTrainingStudent.findUnique({ where: { id: existingStudentId } });

      if (!student) {
        return NextResponse.redirect(appRedirectUrl(errorPath, request));
      }

      studentIds.push(student.id);
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

      studentIds.push(student.id);
    }
  }

  if (new Set(studentIds).size !== studentIds.length) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const creditsPerUnit = paymentType.credits;
  const totalCredits = creditsPerUnit * quantity;
  const pricePerUnit = decimalToNumber(paymentType.price);
  const teacherPricePerUnit = decimalToNumber(paymentType.teacherPrice);
  const totalPrice = pricePerUnit * quantity;
  const teacherTotal = teacherPricePerUnit * quantity;

  await prisma.$transaction(
    studentIds.map((studentId) =>
      prisma.personalTrainingPayment.create({
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
      })
    )
  );

  return NextResponse.redirect(appRedirectUrl(`${basePath}&success=1`, request));
}
