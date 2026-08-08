import { prisma } from "@/lib/prisma";

const paymentNotificationKey = "personal_training_payment";
const substitutionNotificationKey = "group_class_substitution";
const classStudentNotificationKey = "class_student_notifications";
const groupClassScheduleNotificationKey = "group_class_schedule";
const timesheetDocumentsNotificationKey = "timesheet_documents";
const passwordResetNotificationKey = "password_reset";
export type EmailProvider = "resend" | "brevo";
export const emailNotificationKeys = [
  passwordResetNotificationKey,
  paymentNotificationKey,
  substitutionNotificationKey,
  classStudentNotificationKey,
  groupClassScheduleNotificationKey,
  timesheetDocumentsNotificationKey
] as const;

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
      ccEmails: "",
      provider: "resend"
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
      ccEmails: "",
      provider: "resend"
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
      ccEmails: "",
      provider: "resend"
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
      ccEmails: "",
      provider: "resend"
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
      ccEmails: "",
      provider: "resend"
    }
  });
}

export async function getPasswordResetEmailSettings() {
  return prisma.emailSettings.upsert({
    where: { key: passwordResetNotificationKey },
    update: {},
    create: {
      key: passwordResetNotificationKey,
      enabled: true,
      ccEmails: "",
      provider: "resend"
    }
  });
}

export function emailProviderAvailability() {
  return {
    brevo: Boolean(process.env.BREVO_API_KEY && (process.env.BREVO_EMAIL_FROM || process.env.EMAIL_FROM)),
    resend: Boolean(process.env.RESEND_API_KEY && (process.env.RESEND_EMAIL_FROM || process.env.EMAIL_FROM))
  };
}

function configuredDefaultEmailProvider(): EmailProvider {
  const provider = (process.env.EMAIL_PROVIDER || "").toLowerCase().trim();
  const availability = emailProviderAvailability();

  if ((provider === "resend" || provider === "brevo") && availability[provider]) {
    return provider;
  }

  if (availability.resend) return "resend";
  return "brevo";
}

function isEmailProvider(value?: string | null): value is EmailProvider {
  return value === "resend" || value === "brevo";
}

export function normalizeEmailProvider(value?: string | null): EmailProvider {
  return isEmailProvider(value) ? value : configuredDefaultEmailProvider();
}

export function resolveAvailableEmailProvider(value?: string | null): EmailProvider {
  const requestedProvider = normalizeEmailProvider(value);
  const availability = emailProviderAvailability();

  if (availability[requestedProvider]) {
    return requestedProvider;
  }

  return configuredDefaultEmailProvider();
}

export async function selectedEmailProviderForType(emailType?: string): Promise<EmailProvider> {
  if (!emailType) {
    return configuredDefaultEmailProvider();
  }

  const settings = await prisma.emailSettings.findUnique({ where: { key: emailType }, select: { provider: true } }).catch(() => null);
  return resolveAvailableEmailProvider(settings?.provider);
}

export async function configuredEmailProviders() {
  const settings = await prisma.emailSettings.findMany({
    where: { key: { in: [...emailNotificationKeys] } },
    select: { provider: true }
  });
  const providers = new Set<EmailProvider>();

  if (settings.length < emailNotificationKeys.length) {
    providers.add(configuredDefaultEmailProvider());
  }

  for (const setting of settings) {
    providers.add(resolveAvailableEmailProvider(setting.provider));
  }

  if (providers.size === 0) {
    providers.add(configuredDefaultEmailProvider());
  }

  return Array.from(providers);
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
  emailType?: string;
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
  const from = process.env.BREVO_EMAIL_FROM || process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("BREVO_API_KEY ou BREVO_EMAIL_FROM em falta.");
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
    htmlContent: html
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

  const shouldDisableTracking = disableTracking ?? true;

  if (shouldDisableTracking) {
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
  const from = process.env.RESEND_EMAIL_FROM || process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY ou RESEND_EMAIL_FROM em falta.");
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

export function emailProviderLimit(provider: EmailProvider) {
  return provider === "brevo" ? 300 : 100;
}

export async function sendTransactionalEmail(payload: SendEmailPayload) {
  const provider = await selectedEmailProviderForType(payload.emailType);
  const providerId = provider === "brevo" ? await sendBrevoEmail(payload) : await sendResendEmailProvider(payload);

  return { provider, providerId };
}

export const sendResendEmail = sendTransactionalEmail;
