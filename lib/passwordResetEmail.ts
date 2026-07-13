import crypto from "node:crypto";
import { sendResendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export function createPasswordResetToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashPasswordResetToken(token)
  };
}

export function hashPasswordResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function sendPasswordResetEmail({
  to,
  userName,
  resetUrl
}: {
  to: string;
  userName: string;
  resetUrl: string;
}) {
  const subject = "Recuperação de password";
  const text = [
    `Olá ${userName},`,
    "",
    "Foi pedido um link para recuperar a password da Plataforma de Gestão.",
    "Este link é válido durante 1 hora:",
    resetUrl,
    "",
    "Se não pediste esta recuperação, podes ignorar este email."
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Recuperação de password</h2>
      <p>Olá ${userName},</p>
      <p>Foi pedido um link para recuperar a password da Plataforma de Gestão.</p>
      <p><a href="${resetUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;padding:10px 14px;border-radius:6px;text-decoration:none;font-weight:bold;">Definir nova password</a></p>
      <p>Este link é válido durante 1 hora.</p>
      <p>Se não pediste esta recuperação, podes ignorar este email.</p>
    </div>
  `;

  try {
    const providerId = await sendResendEmail({
      to,
      cc: [],
      subject,
      html,
      text
    });

    await prisma.emailLog.create({
      data: {
        type: "password_reset",
        status: "sent",
        toEmail: to,
        subject,
        providerId
      }
    });
  } catch (error) {
    await prisma.emailLog.create({
      data: {
        type: "password_reset",
        status: "failed",
        toEmail: to,
        subject,
        error: error instanceof Error ? error.message : "Erro desconhecido"
      }
    });

    throw error;
  }
}
