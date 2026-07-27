import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { blockNonAdminDuringMaintenance } from "@/lib/maintenance";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

const maxPhotoBytes = 2 * 1024 * 1024;
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function parseDateTime(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function photoDataUrl(file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  if (file.size > maxPhotoBytes || !allowedPhotoTypes.has(file.type)) {
    throw new Error("photo");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

export async function POST(request: Request) {
  const user = await requireUser();
  const canCreate = hasRole(user, "admin") || hasRole(user, "recepcao");

  if (!canCreate) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const maintenanceBlock = await blockNonAdminDuringMaintenance({ user, request, redirectPath: "/perdidos-achados" });
  if (maintenanceBlock) return maintenanceBlock;

  const formData = await request.formData();
  const foundAt = parseDateTime(String(formData.get("foundAt") || ""));
  const foundBy = String(formData.get("foundBy") || "").trim();
  const receptionReceiver = String(formData.get("receptionReceiver") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const valuable = formData.get("valuable") === "on";

  if (!foundAt || !foundBy || !receptionReceiver || !description) {
    return NextResponse.redirect(appRedirectUrl("/perdidos-achados?error=required", request));
  }

  try {
    const itemPhotoDataUrl = await photoDataUrl(formData.get("photo"));

    await prisma.lostFoundItem.create({
      data: {
        createdById: user.id,
        createdByName: user.name,
        description,
        foundAt,
        foundBy,
        location: location || null,
        photoDataUrl: itemPhotoDataUrl,
        receptionReceiver,
        valuable,
        logs: {
          create: {
            action: "created",
            actionById: user.id,
            actionByName: user.name,
            details: valuable ? "Item de valor registado." : "Item registado."
          }
        }
      }
    });
  } catch {
    return NextResponse.redirect(appRedirectUrl("/perdidos-achados?error=photo", request));
  }

  return NextResponse.redirect(appRedirectUrl("/perdidos-achados?success=created", request));
}
