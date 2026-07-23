import { getClassStudentEmailSettings, parseEmailList, sendResendEmail } from "@/lib/email";
import type { GroupClassOption } from "@/lib/groupClassOptions";
import { formatGroupClassOption } from "@/lib/groupClassOptions";
import { prisma } from "@/lib/prisma";

type StudentPayload = {
  memberNumber: string;
  name: string;
};

type ClassChangeEmailPayload = {
  createdByName: string;
  destinationClass: GroupClassOption;
  originClass: GroupClassOption;
  student: StudentPayload;
};

type ClassEnrollmentEmailPayload = {
  classOption: GroupClassOption;
  createdByName: string;
  student: StudentPayload;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function extractEmail(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

function notificationTo(cc: string[]) {
  return extractEmail(process.env.EMAIL_NOTIFICATION_TO || cc[0] || process.env.EMAIL_FROM || "");
}

async function logEmail({
  error,
  providerId,
  status,
  subject,
  toEmail,
  ccEmails,
  type
}: {
  ccEmails: string;
  error?: string;
  providerId?: string | null;
  status: string;
  subject: string;
  toEmail: string;
  type: string;
}) {
  await prisma.emailLog.create({
    data: {
      type,
      status,
      toEmail,
      ccEmails,
      subject,
      providerId,
      error
    }
  });
}

export async function sendClassChangeEmail(payload: ClassChangeEmailPayload) {
  const settings = await getClassStudentEmailSettings();
  const cc = parseEmailList(settings.ccEmails);
  const teacherEmails = Array.from(new Set([payload.originClass.teacherEmail, payload.destinationClass.teacherEmail].filter(Boolean)));
  const subject = `Troca de turma - ${payload.student.name} (${payload.student.memberNumber})`;
  const to = notificationTo(cc);
  const ccForSend = to === cc[0] ? cc.slice(1) : cc;
  const recipientSummary = `BCC: ${teacherEmails.join(", ")}`;

  if (!settings.enabled) {
    await logEmail({
      type: "class_student_change",
      status: "skipped",
      toEmail: recipientSummary,
      ccEmails: cc.join(", "),
      subject,
      error: "Envio desativado nas configuracoes."
    });
    return;
  }

  if (!to || teacherEmails.length === 0) {
    await logEmail({
      type: "class_student_change",
      status: "failed",
      toEmail: recipientSummary || "-",
      ccEmails: cc.join(", "),
      subject,
      error: "Nao foi possivel identificar destinatarios para o email."
    });
    return;
  }

  const originLabel = formatGroupClassOption(payload.originClass);
  const destinationLabel = formatGroupClassOption(payload.destinationClass);
  const text = [
    "Foi registada uma troca de turma.",
    `Utente: ${payload.student.name} (${payload.student.memberNumber})`,
    `Turma de origem: ${originLabel}`,
    `Turma de destino: ${destinationLabel}`,
    `Registado por: ${payload.createdByName}`
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Troca de turma</h2>
      <p>Foi registada uma troca de turma.</p>
      <table style="border-collapse: collapse;">
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Utente</strong></td><td>${escapeHtml(payload.student.name)} (${escapeHtml(payload.student.memberNumber)})</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Origem</strong></td><td>${escapeHtml(originLabel)}</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Destino</strong></td><td>${escapeHtml(destinationLabel)}</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Registado por</strong></td><td>${escapeHtml(payload.createdByName)}</td></tr>
      </table>
    </div>
  `;

  try {
    const providerId = await sendResendEmail({ to, cc: ccForSend, bcc: teacherEmails, subject, html, text });
    await logEmail({
      type: "class_student_change",
      status: "sent",
      toEmail: recipientSummary,
      ccEmails: cc.join(", "),
      subject,
      providerId
    });
  } catch (error) {
    await logEmail({
      type: "class_student_change",
      status: "failed",
      toEmail: recipientSummary,
      ccEmails: cc.join(", "),
      subject,
      error: error instanceof Error ? error.message : "Erro desconhecido"
    });
  }
}

export async function sendClassEnrollmentEmail(payload: ClassEnrollmentEmailPayload) {
  const settings = await getClassStudentEmailSettings();
  const cc = parseEmailList(settings.ccEmails);
  const subject = `Nova inscricao - ${payload.student.name} (${payload.student.memberNumber})`;
  const classLabel = formatGroupClassOption(payload.classOption);

  if (!settings.enabled) {
    await logEmail({
      type: "class_student_enrollment",
      status: "skipped",
      toEmail: payload.classOption.teacherEmail,
      ccEmails: cc.join(", "),
      subject,
      error: "Envio desativado nas configuracoes."
    });
    return;
  }

  if (!payload.classOption.teacherEmail) {
    await logEmail({
      type: "class_student_enrollment",
      status: "failed",
      toEmail: "-",
      ccEmails: cc.join(", "),
      subject,
      error: "A turma selecionada nao tem email de professor associado."
    });
    return;
  }

  const text = [
    "Foi registada uma nova inscricao.",
    `Utente: ${payload.student.name} (${payload.student.memberNumber})`,
    `Turma: ${classLabel}`,
    `Registado por: ${payload.createdByName}`
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Nova inscricao</h2>
      <p>Foi registada uma nova inscricao.</p>
      <table style="border-collapse: collapse;">
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Utente</strong></td><td>${escapeHtml(payload.student.name)} (${escapeHtml(payload.student.memberNumber)})</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Turma</strong></td><td>${escapeHtml(classLabel)}</td></tr>
        <tr><td style="padding: 4px 10px 4px 0;"><strong>Registado por</strong></td><td>${escapeHtml(payload.createdByName)}</td></tr>
      </table>
    </div>
  `;

  try {
    const providerId = await sendResendEmail({
      to: payload.classOption.teacherEmail,
      cc,
      subject,
      html,
      text
    });
    await logEmail({
      type: "class_student_enrollment",
      status: "sent",
      toEmail: payload.classOption.teacherEmail,
      ccEmails: cc.join(", "),
      subject,
      providerId
    });
  } catch (error) {
    await logEmail({
      type: "class_student_enrollment",
      status: "failed",
      toEmail: payload.classOption.teacherEmail,
      ccEmails: cc.join(", "),
      subject,
      error: error instanceof Error ? error.message : "Erro desconhecido"
    });
  }
}
