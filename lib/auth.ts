import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const cookieName = "plataforma_session";

function getSecret() {
  return process.env.SESSION_SECRET || "dev-secret-change-me";
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
    maxAge: 60 * 60 * 24 * 7
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
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId: string;
      createdAt: number;
    };

    if (Date.now() - data.createdAt > 60 * 60 * 24 * 7 * 1000) return null;

    return prisma.user.findUnique({
      where: { id: data.userId, active: true },
      include: { roles: { include: { role: true } } }
    });
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
