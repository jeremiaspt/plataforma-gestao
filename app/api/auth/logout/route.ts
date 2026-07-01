import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  await clearSession();
  return NextResponse.redirect(appRedirectUrl("/login", request));
}
