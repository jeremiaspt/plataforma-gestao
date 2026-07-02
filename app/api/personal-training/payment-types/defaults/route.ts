import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { defaultPersonalTrainingPaymentTypes } from "@/lib/personalTraining";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  for (const paymentType of defaultPersonalTrainingPaymentTypes) {
    await prisma.personalTrainingPaymentType.upsert({
      where: { description: paymentType.description },
      update: { credits: paymentType.credits },
      create: paymentType
    });
  }

  return NextResponse.redirect(appRedirectUrl("/treinos-personalizados/tipos?success=1", request));
}
