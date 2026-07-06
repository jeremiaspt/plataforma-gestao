import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const enabled = formData.get("enabled") === "on";
  const ccEmails = String(formData.get("ccEmails") || "").trim();

  try {
    await prisma.emailSettings.upsert({
      where: { key: "personal_training_payment" },
      update: {
        enabled,
        ccEmails
      },
      create: {
        key: "personal_training_payment",
        enabled,
        ccEmails
      }
    });

    return NextResponse.redirect(appRedirectUrl("/configuracoes-email?tab=settings&success=1", request));
  } catch {
    return NextResponse.redirect(appRedirectUrl("/configuracoes-email?tab=settings&error=1", request));
  }
}
