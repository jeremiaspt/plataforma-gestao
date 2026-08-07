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

type SendEmailPayload = {
  to: string | string[];
  cc: string[];
  bcc?: string[];
  attachments?: EmailAttachment[];
  disableTracking?: boolean;
  subject: string;
  html: string;
  text: string;
};

function emailArray(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);
}

function parseSender(value: string) {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);

  if (match) {
    return {
      email: match[2].trim(),
      name: match[1].replace(/^"|"$/g, "").trim() || undefined
    };
  }

  return { email: value.trim() };
}

function brevoRecipients(value: string | string[] | undefined) {
  return emailArray(value).map((email) => ({ email }));
}

async function sendBrevoEmail({
  to,
  cc,
  bcc,
  attachments,
  disableTracking,
  subject,
  html,
  text
}: SendEmailPayload) {
  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("BREVO_API_KEY ou EMAIL_FROM em falta.");
  }

  const toRecipients = brevoRecipients(to);
  const ccRecipients = brevoRecipients(cc);
  const bccRecipients = brevoRecipients(bcc);
  const attachmentItems = attachments?.filter((attachment) => attachment.filename && attachment.content).map((attachment) => ({
    content: attachment.content,
    name: attachment.filename
  }));

  if (toRecipients.length === 0) {
    throw new Error("Destinatario em falta.");
  }

  const body: Record<string, unknown> = {
    sender: parseSender(from),
    to: toRecipients,
    subject,
    htmlContent: html,
    textContent: text
  };

  if (ccRecipients.length > 0) {
    body.cc = ccRecipients;
  }

  if (bccRecipients.length > 0) {
    body.bcc = bccRecipients;
  }

  if (attachmentItems && attachmentItems.length > 0) {
    body.attachment = attachmentItems;
  }

  if (disableTracking) {
    body.headers = {
      "X-Mailin-Track": "0",
      "X-Mailin-Track-Click": "0",
      "X-Mailin-Track-Clicks": "0",
      "X-Mailin-Track-Open": "0",
      "X-Mailin-Track-Opens": "0"
    };
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = (await response.json().catch(() => ({}))) as {
    code?: string;
    message?: string;
    messageId?: string;
    messageIds?: string[];
  };

  if (!response.ok) {
    throw new Error(data.message || data.code || `Erro Brevo ${response.status}`);
  }

  return data.messageId || data.messageIds?.[0] || null;
}

async function sendResendEmailProvider({
  to,
  cc,
  bcc,
  attachments,
  subject,
  html,
  text
}: SendEmailPayload) {
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

function selectedEmailProvider() {
  const provider = (process.env.EMAIL_PROVIDER || "").toLowerCase().trim();

  if (provider === "brevo" || provider === "resend") {
    return provider;
  }

  return process.env.BREVO_API_KEY ? "brevo" : "resend";
}

export async function sendTransactionalEmail(payload: SendEmailPayload) {
  return selectedEmailProvider() === "brevo" ? sendBrevoEmail(payload) : sendResendEmailProvider(payload);
}

export const sendResendEmail = sendTransactionalEmail;
