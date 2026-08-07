import crypto from "node:crypto";
import { sendTransactionalEmail } from "@/lib/email";
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  const subject = "Recuperacao de password";
  const previewText = "Recuperacao de password da gestao.gcp.ad";
  const safeUserName = escapeHtml(userName);
  const safeResetUrl = escapeHtml(resetUrl);
  const text = [
    previewText,
    "",
    `Ola ${userName},`,
    "",
    "Foi pedido um link para recuperar a password da gestao.gcp.ad - gestao operacional.",
    "Copia este endereco e cola no browser para definires uma nova password:",
    resetUrl,
    "",
    "Este link e valido durante 1 hora.",
    "Se nao pediste esta recuperacao, podes ignorar este email."
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${previewText}</div>
      <h2>Recuperacao de password</h2>
      <p>Ola ${safeUserName},</p>
      <p>Foi pedido um link para recuperar a password da gestao.gcp.ad - gestao operacional.</p>
      <p>Copia este endereco e cola no browser para definires uma nova password:</p>
      <p style="word-break:break-all;background:#f3f7fb;border:1px solid #cbd8e6;border-radius:6px;padding:10px 12px;color:#0f2a44;">${safeResetUrl}</p>
      <p>Este link e valido durante 1 hora.</p>
      <p>Se nao pediste esta recuperacao, podes ignorar este email.</p>
    </div>
  `;

  try {
    const providerId = await sendTransactionalEmail({
      to,
      cc: [],
      subject,
      html,
      text,
      disableTracking: true
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
