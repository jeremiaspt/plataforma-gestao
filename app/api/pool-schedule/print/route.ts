import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { generatePoolSchedulePrintPdf } from "@/lib/poolSchedulePrintPdf";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const url = new URL(request.url);
  const modeValue = url.searchParams.get("mode");
  const mode = modeValue === "day" ? "day" : "week";
  const weekday = Number(url.searchParams.get("weekday") || "1");
  const weekStart = url.searchParams.get("weekStart") || undefined;
  const result = await generatePoolSchedulePrintPdf({ mode, weekday, weekStart });

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Content-Type": "application/pdf"
    }
  });
}
