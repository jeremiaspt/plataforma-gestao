import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/auth";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const password = String(formData.get("password") || "");

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user && user.active && (await bcrypt.compare(password, user.passwordHash));

  if (!valid) {
    return NextResponse.redirect(appRedirectUrl("/login?error=1", request));
  }

  await setSession(user.id);
  return NextResponse.redirect(appRedirectUrl("/dashboard", request));
}
