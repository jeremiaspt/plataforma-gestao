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
  const selectedDate = String(formData.get("date") || "");
  const redirectPath = `/piscina-25m${selectedDate ? `?date=${selectedDate}` : ""}`;

  await prisma.poolScheduleBlock.delete({ where: { id } });

  return NextResponse.redirect(appRedirectUrl(redirectPath, request));
}
