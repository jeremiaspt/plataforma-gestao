import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const roles = [
  { key: "admin", name: "Admin", description: "Acesso total à plataforma" },
  { key: "professor", name: "Professor", description: "Ferramentas de aulas e alunos" },
  { key: "recepcao", name: "Recepção", description: "Atendimento, inscrições e marcações" },
  { key: "limpeza", name: "Limpeza", description: "Tarefas de limpeza" },
  { key: "manutencao", name: "Manutenção", description: "Pedidos de manutenção" }
];

const permissions = [
  { key: "users.manage", name: "Gerir utilizadores" },
  { key: "dashboard.view", name: "Ver dashboard" },
  { key: "classes.view", name: "Ver aulas" },
  { key: "frontdesk.manage", name: "Gerir recepção" },
  { key: "cleaning.manage", name: "Gerir limpeza" },
  { key: "maintenance.manage", name: "Gerir manutenção" }
];

async function main() {
  for (const role of roles) {
    await prisma.role.upsert({
      where: { key: role.key },
      update: role,
      create: role
    });
  }

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: permission,
      create: permission
    });
  }

  const allPermissions = await prisma.permission.findMany();
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: "admin" } });

  for (const permission of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permission.id
        }
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: permission.id
      }
    });
  }

  const adminEmail = process.env.ADMIN_EMAIL || "admin@exemplo.pt";
  const adminPassword = process.env.ADMIN_PASSWORD || "Alterar123!";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { name: "Administrador", passwordHash, active: true },
    create: {
      name: "Administrador",
      email: adminEmail,
      phone: "",
      passwordHash,
      active: true
    }
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: adminRole.id
      }
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
