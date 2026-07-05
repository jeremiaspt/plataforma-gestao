import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const currentUser = await requireUser();

  if (!hasRole(currentUser, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const phone = String(formData.get("phone") || "").trim();
  const password = String(formData.get("password") || "");
  const roleKeys = formData.getAll("roles").map(String);

  if (!name || !email || password.length < 8 || roleKeys.length === 0) {
    return NextResponse.redirect(appRedirectUrl("/utilizadores", request));
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const roles = await prisma.role.findMany({ where: { key: { in: roleKeys } } });

  await prisma.user.create({
    data: {
      name,
      email,
      phone,
      billingCycle: "calendar_month",
      passwordHash,
      roles: {
        create: roles.map((role) => ({
          role: { connect: { id: role.id } }
        }))
      }
    }
  });

  return NextResponse.redirect(appRedirectUrl("/utilizadores", request));
}
