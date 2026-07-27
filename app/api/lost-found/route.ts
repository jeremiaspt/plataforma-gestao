import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { uploadLostFoundPhoto } from "@/lib/cloudinary";
import { blockNonAdminDuringMaintenance } from "@/lib/maintenance";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

function parseDateTime(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
  const description = String(formData.get("description") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const valuable = formData.get("valuable") === "on";

  if (!foundAt || !foundBy || !location || !description) {
    return NextResponse.redirect(appRedirectUrl("/perdidos-achados?error=required", request));
  }

  try {
    const uploadedPhoto = await uploadLostFoundPhoto(formData.get("photo"));

    await prisma.lostFoundItem.create({
      data: {
        createdById: user.id,
        createdByName: user.name,
        description,
        foundAt,
        foundBy,
        location,
        photoPublicId: uploadedPhoto?.publicId || null,
        photoUrl: uploadedPhoto?.url || null,
        receptionReceiver: user.name,
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
  } catch (error) {
    const errorCode = error instanceof Error && error.message === "cloudinary_config" ? "cloudinary" : "photo";
    return NextResponse.redirect(appRedirectUrl(`/perdidos-achados?error=${errorCode}`, request));
  }

  return NextResponse.redirect(appRedirectUrl("/perdidos-achados?success=created", request));
}
