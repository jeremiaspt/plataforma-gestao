import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST() {
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

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: "admin" } });
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "Alterar123!", 12);

  const admin = await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL || "admin@exemplo.pt" },
    update: { passwordHash, active: true },
    create: {
      name: "Administrador",
      email: process.env.ADMIN_EMAIL || "admin@exemplo.pt",
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
