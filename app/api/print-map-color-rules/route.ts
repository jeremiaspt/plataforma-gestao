import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { printMapPalette } from "@/lib/printMapColors";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

function validColorKey(value: string) {
  return printMapPalette.some((item) => item.key === value) ? value : printMapPalette[0].key;
}

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const action = String(formData.get("action") || "create");

  try {
    if (action === "update") {
      const ids = formData.getAll("ruleId").map((item) => String(item));
      await prisma.$transaction(
        ids.map((id) =>
          prisma.printMapColorRule.update({
            where: { id },
            data: {
              active: formData.get(`active_${id}`) === "on",
              colorKey: validColorKey(String(formData.get(`colorKey_${id}`) || "")),
              displayOrder: Number(formData.get(`displayOrder_${id}`) || 0),
              matchPatterns: String(formData.get(`matchPatterns_${id}`) || "").trim(),
              name: String(formData.get(`name_${id}`) || "").trim() || "Regra sem nome"
            }
          })
        )
      );
    } else {
      const name = String(formData.get("name") || "").trim();
      const matchPatterns = String(formData.get("matchPatterns") || "").trim();

      if (!name || !matchPatterns) {
        return NextResponse.redirect(appRedirectUrl("/impressao-mapa?tab=colors&error=1", request));
      }

      await prisma.printMapColorRule.create({
        data: {
          colorKey: validColorKey(String(formData.get("colorKey") || "")),
          displayOrder: Number(formData.get("displayOrder") || 0),
          matchPatterns,
          name
        }
      });
    }

    return NextResponse.redirect(appRedirectUrl("/impressao-mapa?tab=colors&success=1", request));
  } catch {
    return NextResponse.redirect(appRedirectUrl("/impressao-mapa?tab=colors&error=1", request));
  }
}
