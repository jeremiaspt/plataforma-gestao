import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const user = await requireUser();
  const formData = await request.formData();
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  const validCurrentPassword = dbUser && (await bcrypt.compare(currentPassword, dbUser.passwordHash));
  const validNewPassword = newPassword.length >= 8 && newPassword === confirmPassword;

  if (!validCurrentPassword || !validNewPassword) {
    return NextResponse.redirect(appRedirectUrl("/conta?error=1", request));
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash }
  });

  return NextResponse.redirect(appRedirectUrl("/conta?success=1", request));
}
