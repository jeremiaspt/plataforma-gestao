import { NextResponse } from "next/server";
import { hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

const settingsKey = "system";

export async function getSystemSettings() {
  const settings = await prisma.systemSettings.findUnique({
    where: { key: settingsKey }
  });

  if (settings) {
    return settings;
  }

  return prisma.systemSettings.create({
    data: {
      key: settingsKey,
      maintenanceMode: true,
      includeLisbonMunicipalHolidays: false
    }
  });
}

export async function setSystemSettings({
  includeLisbonMunicipalHolidays,
  maintenanceMode
}: {
  includeLisbonMunicipalHolidays: boolean;
  maintenanceMode: boolean;
}) {
  return prisma.systemSettings.upsert({
    where: { key: settingsKey },
    update: { includeLisbonMunicipalHolidays, maintenanceMode },
    create: {
      key: settingsKey,
      includeLisbonMunicipalHolidays,
      maintenanceMode
    }
  });
}

export async function blockNonAdminDuringMaintenance({
  user,
  request,
  redirectPath
}: {
  user: Parameters<typeof hasRole>[0];
  request: Request;
  redirectPath: string;
}) {
  if (hasRole(user, "admin")) {
    return null;
  }

  const settings = await getSystemSettings();

  if (!settings.maintenanceMode) {
    return null;
  }

  const separator = redirectPath.includes("?") ? "&" : "?";
  return NextResponse.redirect(appRedirectUrl(`${redirectPath}${separator}maintenance=1`, request));
}
