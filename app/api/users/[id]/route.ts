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
  const protectedEmail = process.env.SUPERADMIN_EMAIL?.toLowerCase().trim();

  async function isProtectedSuperadmin(userId: string) {
    if (!protectedEmail) {
      return false;
    }

    const protectedUser = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    return protectedUser?.email.toLowerCase() === protectedEmail;
  }

  if (action === "delete") {
    if (await isProtectedSuperadmin(id)) {
      return NextResponse.redirect(appRedirectUrl("/utilizadores?protected=1", request));
    }

    if (id !== currentUser.id) {
      const [teacherPayments, teacherBookings] = await Promise.all([
        prisma.personalTrainingPayment.count({ where: { teacherId: id } }),
        prisma.personalTrainingBooking.count({ where: { teacherId: id } })
      ]);

      if (teacherPayments > 0 || teacherBookings > 0) {
        await prisma.user.update({
          where: { id },
          data: { active: false }
        });
      } else {
        await prisma.user.delete({ where: { id } }).catch(async () => {
          await prisma.user.update({
            where: { id },
            data: { active: false }
          });
        });
      }
    }

    return NextResponse.redirect(appRedirectUrl("/utilizadores", request));
  }

  if (action === "toggle-active") {
    if (await isProtectedSuperadmin(id)) {
      return NextResponse.redirect(appRedirectUrl("/utilizadores?protected=1", request));
    }

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

  const existingUser = await prisma.user.findUnique({ where: { id }, select: { email: true } });

  if (protectedEmail && existingUser?.email.toLowerCase() === protectedEmail && email !== protectedEmail) {
    return NextResponse.redirect(appRedirectUrl("/utilizadores?protected=1", request));
  }

  const roles = await prisma.role.findMany({ where: { key: { in: roleKeys } } });

  try {
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
  } catch {
    return NextResponse.redirect(appRedirectUrl("/utilizadores?error=1", request));
  }

  return NextResponse.redirect(appRedirectUrl("/utilizadores", request));
}
