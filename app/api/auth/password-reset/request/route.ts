import { NextResponse } from "next/server";
import { createPasswordResetToken, sendPasswordResetEmail } from "@/lib/passwordResetEmail";
import { prisma } from "@/lib/prisma";
import { getClientIp, isRateLimited } from "@/lib/rateLimit";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const successPath = "/recuperar-password?sent=1";
  const rateLimitKey = `password-reset:${getClientIp(request)}:${email || "unknown"}`;

  if (isRateLimited(rateLimitKey, 5, 60 * 60 * 1000)) {
    return NextResponse.redirect(appRedirectUrl(successPath, request));
  }

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;

  if (!user || !user.active) {
    return NextResponse.redirect(appRedirectUrl(successPath, request));
  }

  const { token, tokenHash } = createPasswordResetToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const resetUrl = appRedirectUrl(`/redefinir-password?token=${token}`, request).toString();

  await prisma.passwordResetToken.deleteMany({
    where: {
      userId: user.id,
      usedAt: null
    }
  });

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt
    }
  });

  try {
    await sendPasswordResetEmail({
      to: user.email,
      userName: user.name,
      resetUrl
    });
  } catch {
    return NextResponse.redirect(appRedirectUrl("/recuperar-password?error=1", request));
  }

  return NextResponse.redirect(appRedirectUrl(successPath, request));
}
