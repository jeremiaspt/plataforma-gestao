import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { hashPasswordResetToken } from "@/lib/passwordResetEmail";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const formData = await request.formData();
  const token = String(formData.get("token") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const errorPath = `/redefinir-password?token=${encodeURIComponent(token)}&error=1`;

  if (!token || newPassword.length < 8 || newPassword !== confirmPassword) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const tokenHash = hashPasswordResetToken(token);
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!resetToken || !resetToken.user.active || resetToken.usedAt || resetToken.expiresAt.getTime() <= Date.now()) {
    return NextResponse.redirect(appRedirectUrl(errorPath, request));
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash }
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() }
    }),
    prisma.passwordResetToken.deleteMany({
      where: {
        userId: resetToken.userId,
        id: { not: resetToken.id },
        usedAt: null
      }
    })
  ]);

  return NextResponse.redirect(appRedirectUrl("/redefinir-password?success=1", request));
}
