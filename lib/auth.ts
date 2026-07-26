import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { recordUserAccess } from "@/lib/loginAudit";
import { prisma } from "@/lib/prisma";

const cookieName = "plataforma_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;
const sessionMaxAgeMs = sessionMaxAgeSeconds * 1000;

function getSecret() {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET em falta.");
  }

  return "dev-secret-change-me";
}

function sign(value: string) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("hex");
}

export function createSessionToken(userId: string) {
  const payload = Buffer.from(JSON.stringify({ userId, createdAt: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export async function setSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expectedSignature = sign(payload);
  const providedSignature = Buffer.from(signature, "hex");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "hex");

  if (
    providedSignature.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(providedSignature, expectedSignatureBuffer)
  ) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId: string;
      createdAt: number;
    };

    if (Date.now() - data.createdAt > sessionMaxAgeMs) return null;

    const user = await prisma.user.findUnique({
      where: { id: data.userId, active: true },
      include: { roles: { include: { role: true } } }
    });

    if (user) {
      const requestHeaders = await headers();
      await recordUserAccess(requestHeaders, user.id).catch(() => null);
    }

    return user;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export function hasRole(user: Awaited<ReturnType<typeof getSessionUser>>, roleKey: string) {
  return Boolean(user?.roles.some((userRole) => userRole.role.key === roleKey));
}
