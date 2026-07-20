import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { hasRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const seedSecret = process.env.ADMIN_SEED_SECRET;

  if (process.env.NODE_ENV === "production") {
    const providedSecret = request.headers.get("x-admin-seed-secret") || "";

    if (!seedSecret || providedSecret !== seedSecret) {
      return NextResponse.json({ error: "Seed indisponível." }, { status: 404 });
    }
  }

  const roles = [
    { key: "admin", name: "Admin", description: "Acesso total à plataforma" },
    { key: "professor", name: "Professor", description: "Ferramentas de aulas e alunos" },
    { key: "recepcao", name: "Recepção", description: "Atendimento, inscrições e marcações" },
    { key: "limpeza", name: "Limpeza", description: "Tarefas de limpeza" },
    { key: "manutencao", name: "Manutenção", description: "Pedidos de manutenção" }
  ];

  for (const role of roles) {
    await prisma.role.upsert({ where: { key: role.key }, update: role, create: role });
  }

  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "ADMIN_EMAIL ou ADMIN_PASSWORD em falta." }, { status: 400 });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: "admin" } });
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL },
    update: { passwordHash, active: true },
    create: {
      name: "Administrador",
      email: process.env.ADMIN_EMAIL,
      phone: "",
      passwordHash,
      active: true
    }
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id }
  });

  return NextResponse.json({ ok: true });
}
