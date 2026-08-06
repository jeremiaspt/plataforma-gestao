import { prisma } from "@/lib/prisma";

const paymentNotificationKey = "personal_training_payment";
const substitutionNotificationKey = "group_class_substitution";
const classStudentNotificationKey = "class_student_notifications";
const groupClassScheduleNotificationKey = "group_class_schedule";
const timesheetDocumentsNotificationKey = "timesheet_documents";

export function parseEmailList(value?: string | null) {
  return (value || "")
    .split(/[,\n;]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

export async function getPaymentEmailSettings() {
  return prisma.emailSettings.upsert({
    where: { key: paymentNotificationKey },
    update: {},
    create: {
      key: paymentNotificationKey,
      enabled: true,
      ccEmails: ""
    }
  });
}

export async function getSubstitutionEmailSettings() {
  return prisma.emailSettings.upsert({
    where: { key: substitutionNotificationKey },
    update: {},
    create: {
      key: substitutionNotificationKey,
      enabled: true,
      ccEmails: ""
    }
  });
}

export async function getClassStudentEmailSettings() {
  return prisma.emailSettings.upsert({
    where: { key: classStudentNotificationKey },
    update: {},
    create: {
      key: classStudentNotificationKey,
      enabled: true,
      ccEmails: ""
    }
  });
}

export async function getGroupClassScheduleEmailSettings() {
  return prisma.emailSettings.upsert({
    where: { key: groupClassScheduleNotificationKey },
    update: {},
    create: {
      key: groupClassScheduleNotificationKey,
      enabled: true,
      ccEmails: ""
    }
  });
}

export async function getTimesheetDocumentsEmailSettings() {
  return prisma.emailSettings.upsert({
    where: { key: timesheetDocumentsNotificationKey },
    update: {},
    create: {
      key: timesheetDocumentsNotificationKey,
      enabled: true,
      ccEmails: ""
    }
  });
}

type EmailAttachment = {
  filename: string;
  content: string;
};

export async function sendResendEmail({
  to,
  cc,
  bcc,
  attachments,
  subject,
  html,
  text
}: {
  to: string | string[];
  cc: string[];
  bcc?: string[];
  attachments?: EmailAttachment[];
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY ou EMAIL_FROM em falta.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      cc,
      bcc,
      attachments,
      subject,
      html,
      text
    })
  });

  const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string; error?: string };

  if (!response.ok) {
    throw new Error(data.message || data.error || `Erro Resend ${response.status}`);
  }

  return data.id || null;
}
