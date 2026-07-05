import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { isBillingCycleKey } from "@/lib/billingCycles";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await requireUser();

  if (!hasRole(currentUser, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const { id } = await params;
  const formData = await request.formData();
  const action = String(formData.get("action") || "update");

  if (action === "delete") {
    if (id !== currentUser.id) {
      await prisma.user.delete({ where: { id } });
    }

    return NextResponse.redirect(appRedirectUrl("/utilizadores", request));
  }

  if (action === "toggle-active") {
    if (id !== currentUser.id) {
      const user = await prisma.user.findUnique({ where: { id }, select: { active: true } });

      if (user) {
        await prisma.user.update({
          where: { id },
          data: { active: !user.active }
        });
      }
    }

    return NextResponse.redirect(appRedirectUrl("/utilizadores", request));
  }

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const phone = String(formData.get("phone") || "").trim();
  const billingCycle = String(formData.get("billingCycle") || "calendar_month");
  const roleKeys = formData.getAll("roles").map(String);

  if (!name || !email || roleKeys.length === 0 || !isBillingCycleKey(billingCycle)) {
    return NextResponse.redirect(appRedirectUrl("/utilizadores", request));
  }

  const roles = await prisma.role.findMany({ where: { key: { in: roleKeys } } });

  await prisma.user.update({
    where: { id },
    data: {
      name,
      email,
      phone,
      billingCycle,
      roles: {
        deleteMany: {},
        create: roles.map((role) => ({
          role: { connect: { id: role.id } }
        }))
      }
    }
  });

  return NextResponse.redirect(appRedirectUrl("/utilizadores", request));
}
