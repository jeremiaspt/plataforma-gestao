import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { deleteCloudinaryPhoto } from "@/lib/cloudinary";
import { blockNonAdminDuringMaintenance } from "@/lib/maintenance";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

function redirectToList(request: Request, status: "success" | "error", message: string) {
  const params = new URLSearchParams({ [status]: message });
  return NextResponse.redirect(appRedirectUrl(`/perdidos-achados?${params.toString()}`, request));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const isAdmin = hasRole(user, "admin");
  const isReception = hasRole(user, "recepcao");

  if (!isAdmin && !isReception) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const maintenanceBlock = await blockNonAdminDuringMaintenance({ user, request, redirectPath: "/perdidos-achados" });
  if (maintenanceBlock) return maintenanceBlock;

  const { id } = await params;
  const formData = await request.formData();
  const action = String(formData.get("action") || "");
  const item = await prisma.lostFoundItem.findUnique({ where: { id } });

  if (!item) {
    return redirectToList(request, "error", "not-found");
  }

  if (action === "delete") {
    if (!isAdmin) {
      return redirectToList(request, "error", "invalid-action");
    }

    await prisma.lostFoundItem.delete({ where: { id } });
    await deleteCloudinaryPhoto(item.photoPublicId).catch(() => null);

    return redirectToList(request, "success", "deleted");
  }

  if (action === "deliver-user") {
    const deliveredToUserName = String(formData.get("deliveredToUserName") || "").trim();

    if (!deliveredToUserName || item.status === "delivered_user" || item.status === "closed_director") {
      return redirectToList(request, "error", "invalid-action");
    }

    await prisma.lostFoundItem.update({
      where: { id },
      data: {
        deliveredToUserAt: new Date(),
        deliveredToUserName,
        status: "delivered_user",
        updatedById: user.id,
        updatedByName: user.name,
        logs: {
          create: {
            action: "delivered_user",
            actionById: user.id,
            actionByName: user.name,
            details: `Entregue ao utente: ${deliveredToUserName}`
          }
        }
      }
    });

    return redirectToList(request, "success", "delivered-user");
  }

  if (action === "deliver-director") {
    if (item.status !== "in_reception") {
      return redirectToList(request, "error", "invalid-action");
    }

    await prisma.lostFoundItem.update({
      where: { id },
      data: {
        deliveredToDirectorAt: new Date(),
        status: "delivered_director",
        updatedById: user.id,
        updatedByName: user.name,
        logs: {
          create: {
            action: "delivered_director",
            actionById: user.id,
            actionByName: user.name,
            details: "Entregue ao diretor."
          }
        }
      }
    });

    return redirectToList(request, "success", "delivered-director");
  }

  if (action === "close-director") {
    const reason = String(formData.get("directorCloseReason") || "").trim();

    if (!isAdmin || item.status !== "delivered_director" || !reason) {
      return redirectToList(request, "error", "invalid-action");
    }

    await prisma.lostFoundItem.update({
      where: { id },
      data: {
        directorClosedAt: new Date(),
        directorCloseReason: reason,
        status: "closed_director",
        updatedById: user.id,
        updatedByName: user.name,
        logs: {
          create: {
            action: "closed_director",
            actionById: user.id,
            actionByName: user.name,
            details: reason
          }
        }
      }
    });

    return redirectToList(request, "success", "closed-director");
  }

  return redirectToList(request, "error", "invalid-action");
}
