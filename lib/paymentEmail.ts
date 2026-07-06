import { Prisma } from "@prisma/client";
import { getPaymentEmailSettings, parseEmailList, sendResendEmail } from "@/lib/email";
import { formatCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";

type PaymentEmailPayload = {
  paymentIds: string[];
  teacherEmail: string;
  teacherName: string;
  students: Array<{
    fullName: string;
    memberNumber: string;
  }>;
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
  const studentSummary = payload.students.map((student) => student.fullName).join(", ");
  const subject = `Pagamento TP lançado - ${studentSummary}`;
  const paymentIdValue = payload.paymentIds.join(",");

  if (!settings.enabled) {
    await prisma.emailLog.create({
      data: {
        type: "personal_training_payment",
        status: "skipped",
        toEmail: payload.teacherEmail,
        ccEmails: cc.join(", "),
        subject,
        paymentId: paymentIdValue,
        error: "Envio desativado nas configuracoes."
      }
    });
    return;
  }

  const text = [
    `Foi lançado um pagamento de treino personalizado.`,
    `Professor: ${payload.teacherName}`,
    `Utentes: ${payload.students.map((student) => `${student.fullName} (${student.memberNumber})`).join(", ")}`,
    `Tipo: ${payload.paymentTypeDescription}`,
    `Quantidade: ${payload.quantity}`,
    `Créditos: ${payload.totalCredits}`,
    `Total professor: ${formatCurrency(payload.teacherTotal)}`,
    `Lançado por: ${payload.createdByName}`,
    `Data: ${payload.createdAt.toLocaleString("pt-PT")}`
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Pagamento TP lançado</h2>
      <p>Foi lançado um pagamento de treino personalizado.</p>
      <table style="border-collapse: collapse;">
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Professor</strong></td><td>${payload.teacherName}</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Utentes</strong></td><td>${payload.students
          .map((student) => `${student.fullName} (${student.memberNumber})`)
          .join("<br />")}</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Tipo</strong></td><td>${payload.paymentTypeDescription}</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Quantidade</strong></td><td>${payload.quantity}</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Créditos</strong></td><td>${payload.totalCredits}</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Total professor</strong></td><td>${formatCurrency(payload.teacherTotal)}</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Lançado por</strong></td><td>${payload.createdByName}</td></tr>
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
        paymentId: paymentIdValue
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
        paymentId: paymentIdValue,
        error: error instanceof Error ? error.message : "Erro desconhecido"
      }
    });
  }
}
