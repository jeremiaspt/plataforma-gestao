import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const { id } = await params;

  try {
    await prisma.printMapColorRule.delete({ where: { id } });
    return NextResponse.redirect(appRedirectUrl("/impressao-mapa?tab=colors&success=1", request));
  } catch {
    return NextResponse.redirect(appRedirectUrl("/impressao-mapa?tab=colors&error=1", request));
  }
}
