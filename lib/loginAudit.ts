import { prisma } from "@/lib/prisma";

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

export async function recordLogin(request: Request, userId: string) {
  const userAgent = request.headers.get("user-agent");
  const parsed = parseUserAgent(userAgent);
  const ipAddress =
    firstHeaderValue(request.headers.get("x-forwarded-for")) ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip");
  const city =
    decodeURIComponent(request.headers.get("x-vercel-ip-city") || "") ||
    decodeURIComponent(request.headers.get("cf-ipcity") || "") ||
    null;
  const country =
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("cf-ipcountry") ||
    request.headers.get("x-country-code") ||
    null;

  await prisma.$transaction(async (tx) => {
    await tx.userLoginLog.create({
      data: {
        browser: parsed.browser,
        city,
        country,
        ipAddress,
        platform: parsed.platform,
        userAgent,
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
