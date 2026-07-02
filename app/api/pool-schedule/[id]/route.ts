import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const { id } = await params;
  const formData = await request.formData();
  const weekday = Number(formData.get("weekday"));
  const redirectPath = `/piscina-25m?day=${Number.isInteger(weekday) ? weekday : 1}`;

  await prisma.poolScheduleBlock.delete({ where: { id } });

  return NextResponse.redirect(appRedirectUrl(redirectPath, request));
}
