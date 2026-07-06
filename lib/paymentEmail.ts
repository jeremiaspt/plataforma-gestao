import { Prisma } from "@prisma/client";
import { getPaymentEmailSettings, parseEmailList, sendResendEmail } from "@/lib/email";
import { formatCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";

type PaymentEmailPayload = {
  paymentId: string;
  teacherEmail: string;
  teacherName: string;
  studentFullName: string;
  studentMemberNumber: string;
  paymentTypeDescription: string;
  quantity: number;
  totalCredits: number;
  teacherTotal: Prisma.Decimal | number;
  createdByName: string;
  createdAt: Date;
};

export async function sendPaymentNotificationEmail(payload: PaymentEmailPayload) {
  const settings = await getPaymentEmailSettings();
  const cc = parseEmailList(settings.ccEmails);
  const subject = `Pagamento TP lancado - ${payload.studentFullName}`;

  if (!settings.enabled) {
    await prisma.emailLog.create({
      data: {
        type: "personal_training_payment",
        status: "skipped",
        toEmail: payload.teacherEmail,
        ccEmails: cc.join(", "),
        subject,
        paymentId: payload.paymentId,
        error: "Envio desativado nas configuracoes."
      }
    });
    return;
  }

  const text = [
    `Foi lancado um pagamento de treino personalizado.`,
    `Professor: ${payload.teacherName}`,
    `Utente: ${payload.studentFullName} (${payload.studentMemberNumber})`,
    `Tipo: ${payload.paymentTypeDescription}`,
    `Quantidade: ${payload.quantity}`,
    `Creditos: ${payload.totalCredits}`,
    `Total professor: ${formatCurrency(payload.teacherTotal)}`,
    `Lancado por: ${payload.createdByName}`,
    `Data: ${payload.createdAt.toLocaleString("pt-PT")}`
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Pagamento TP lancado</h2>
      <p>Foi lancado um pagamento de treino personalizado.</p>
      <table style="border-collapse: collapse;">
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Professor</strong></td><td>${payload.teacherName}</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Utente</strong></td><td>${payload.studentFullName} (${payload.studentMemberNumber})</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Tipo</strong></td><td>${payload.paymentTypeDescription}</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Quantidade</strong></td><td>${payload.quantity}</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Creditos</strong></td><td>${payload.totalCredits}</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Total professor</strong></td><td>${formatCurrency(payload.teacherTotal)}</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Lancado por</strong></td><td>${payload.createdByName}</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Data</strong></td><td>${payload.createdAt.toLocaleString("pt-PT")}</td></tr>
      </table>
    </div>
  `;

  try {
    const providerId = await sendResendEmail({
      to: payload.teacherEmail,
      cc,
      subject,
      html,
      text
    });

    await prisma.emailLog.create({
      data: {
        type: "personal_training_payment",
        status: "sent",
        toEmail: payload.teacherEmail,
        ccEmails: cc.join(", "),
        subject,
        providerId,
        paymentId: payload.paymentId
      }
    });
  } catch (error) {
    await prisma.emailLog.create({
      data: {
        type: "personal_training_payment",
        status: "failed",
        toEmail: payload.teacherEmail,
        ccEmails: cc.join(", "),
        subject,
        paymentId: payload.paymentId,
        error: error instanceof Error ? error.message : "Erro desconhecido"
      }
    });
  }
}
