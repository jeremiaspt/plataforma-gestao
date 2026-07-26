import { prisma } from "@/lib/prisma";

type AccessMetadata = {
  browser: string | null;
  city: string | null;
  country: string | null;
  ipAddress: string | null;
  platform: string | null;
  userAgent: string | null;
};

const accessRefreshMs = 12 * 60 * 60 * 1000;

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function parseUserAgent(userAgent: string | null) {
  const value = userAgent || "";
  const browser =
    value.includes("Edg/")
      ? "Edge"
      : value.includes("Chrome/")
        ? "Chrome"
        : value.includes("Firefox/")
          ? "Firefox"
          : value.includes("Safari/")
            ? "Safari"
            : value
              ? "Outro"
              : null;
  const platform =
    value.includes("Windows")
      ? "Windows"
      : value.includes("Android")
        ? "Android"
        : value.includes("iPhone") || value.includes("iPad")
          ? "iOS"
          : value.includes("Mac OS")
            ? "macOS"
            : value.includes("Linux")
              ? "Linux"
              : value
                ? "Outra"
                : null;

  return { browser, platform };
}

function headerValue(headers: Headers, key: string) {
  return headers.get(key);
}

function buildAccessMetadata(headers: Headers): AccessMetadata {
  const userAgent = headerValue(headers, "user-agent");
  const parsed = parseUserAgent(userAgent);
  const ipAddress =
    firstHeaderValue(headerValue(headers, "x-forwarded-for")) ||
    headerValue(headers, "x-real-ip") ||
    headerValue(headers, "cf-connecting-ip");
  const city =
    decodeURIComponent(headerValue(headers, "x-vercel-ip-city") || "") ||
    decodeURIComponent(headerValue(headers, "cf-ipcity") || "") ||
    null;
  const country =
    headerValue(headers, "x-vercel-ip-country") ||
    headerValue(headers, "cf-ipcountry") ||
    headerValue(headers, "x-country-code") ||
    null;

  return {
    browser: parsed.browser,
    city,
    country,
    ipAddress,
    platform: parsed.platform,
    userAgent
  };
}

function accessChanged(previous: AccessMetadata | null, next: AccessMetadata) {
  if (!previous) return true;

  return (
    previous.browser !== next.browser ||
    previous.city !== next.city ||
    previous.country !== next.country ||
    previous.ipAddress !== next.ipAddress ||
    previous.platform !== next.platform ||
    previous.userAgent !== next.userAgent
  );
}

export async function recordUserAccess(headers: Headers, userId: string, options: { force?: boolean } = {}) {
  const metadata = buildAccessMetadata(headers);
  const latestLog = await prisma.userLoginLog.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      browser: true,
      city: true,
      country: true,
      createdAt: true,
      ipAddress: true,
      platform: true,
      userAgent: true
    }
  });
  const latestMetadata = latestLog
    ? {
        browser: latestLog.browser,
        city: latestLog.city,
        country: latestLog.country,
        ipAddress: latestLog.ipAddress,
        platform: latestLog.platform,
        userAgent: latestLog.userAgent
      }
    : null;
  const shouldCreate =
    options.force ||
    !latestLog ||
    accessChanged(latestMetadata, metadata) ||
    Date.now() - latestLog.createdAt.getTime() >= accessRefreshMs;

  if (!shouldCreate) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.userLoginLog.create({
      data: {
        browser: metadata.browser,
        city: metadata.city,
        country: metadata.country,
        ipAddress: metadata.ipAddress,
        platform: metadata.platform,
        userAgent: metadata.userAgent,
        userId
      }
    });

    const logsToKeep = await tx.userLoginLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
      take: 10
    });

    await tx.userLoginLog.deleteMany({
      where: {
        userId,
        id: { notIn: logsToKeep.map((log) => log.id) }
      }
    });
  });
}

export async function recordLogin(request: Request, userId: string) {
  await recordUserAccess(request.headers, userId, { force: true });
}
