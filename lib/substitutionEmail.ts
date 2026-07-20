import { getSubstitutionEmailSettings, parseEmailList, sendResendEmail } from "@/lib/email";
import { formatMinutes, getPoolMapByKey } from "@/lib/pool";
import { prisma } from "@/lib/prisma";

type SubstitutionEmailItem = {
  title: string;
  poolKey: string;
  laneNumber: number;
  startMinutes: number;
  endMinutes: number;
  accumulation: boolean;
};

type SubstitutionRequestEmailPayload = {
  requestId: string;
  absentTeacherName: string;
  substituteTeacherEmail: string;
  substituteTeacherName: string;
  substitutionDate: Date;
  items: SubstitutionEmailItem[];
  actionUrl: string;
};

type SubstitutionResponseEmailPayload = {
  requestId: string;
  absentTeacherEmail: string;
  absentTeacherName: string;
  substituteTeacherName: string;
  substitutionDate: Date;
  items: SubstitutionEmailItem[];
  response: "approved" | "rejected";
  actionUrl: string;
};

function formatDate(date: Date) {
  return date.toLocaleDateString("pt-PT");
}

function itemLabel(item: SubstitutionEmailItem) {
  const poolMap = getPoolMapByKey(item.poolKey);
  const lane = poolMap.lanes.find((laneItem) => laneItem.number === item.laneNumber);
  return `${formatMinutes(item.startMinutes)} - ${formatMinutes(item.endMinutes)} · ${item.title} · ${poolMap.eyebrow} · ${
    lane?.label || `${poolMap.laneFieldLabel} ${item.laneNumber}`
  }${item.accumulation ? " · Acumulação" : ""}`;
}

async function logEmail({
  type,
  status,
  toEmail,
  ccEmails,
  subject,
  providerId,
  error,
  requestId
}: {
  type: string;
  status: string;
  toEmail: string;
  ccEmails: string;
  subject: string;
  providerId?: string | null;
  error?: string;
  requestId: string;
}) {
  await prisma.emailLog.create({
    data: {
      type,
      status,
      toEmail,
      ccEmails,
      subject,
      providerId,
      paymentId: requestId,
      error
    }
  });
}

export async function sendSubstitutionRequestEmail(payload: SubstitutionRequestEmailPayload) {
  const settings = await getSubstitutionEmailSettings();
  const cc = parseEmailList(settings.ccEmails);
  const subject = `Pedido de substituição - ${formatDate(payload.substitutionDate)}`;

  if (!settings.enabled) {
    await logEmail({
      type: "group_class_substitution_request",
      status: "skipped",
      toEmail: payload.substituteTeacherEmail,
      ccEmails: cc.join(", "),
      subject,
      requestId: payload.requestId,
      error: "Envio desativado nas configurações."
    });
    return;
  }

  const itemLines = payload.items.map(itemLabel);
  const text = [
    `Olá ${payload.substituteTeacherName},`,
    "",
    `${payload.absentTeacherName} pediu substituição para ${formatDate(payload.substitutionDate)}.`,
    "",
    ...itemLines.map((line) => `- ${line}`),
    "",
    `Podes aceitar ou rejeitar aqui: ${payload.actionUrl}`
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Pedido de substituição</h2>
      <p>Olá ${payload.substituteTeacherName},</p>
      <p><strong>${payload.absentTeacherName}</strong> pediu substituição para <strong>${formatDate(payload.substitutionDate)}</strong>.</p>
      <ul>${itemLines.map((line) => `<li>${line}</li>`).join("")}</ul>
      <p><a href="${payload.actionUrl}" style="display:inline-block;padding:10px 14px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px;">Ver pedido</a></p>
    </div>
  `;

  try {
    const providerId = await sendResendEmail({
      to: payload.substituteTeacherEmail,
      cc,
      subject,
      html,
      text
    });

    await logEmail({
      type: "group_class_substitution_request",
      status: "sent",
      toEmail: payload.substituteTeacherEmail,
      ccEmails: cc.join(", "),
      subject,
      providerId,
      requestId: payload.requestId
    });
  } catch (error) {
    await logEmail({
      type: "group_class_substitution_request",
      status: "failed",
      toEmail: payload.substituteTeacherEmail,
      ccEmails: cc.join(", "),
      subject,
      requestId: payload.requestId,
      error: error instanceof Error ? error.message : "Erro desconhecido"
    });
  }
}

export async function sendSubstitutionResponseEmail(payload: SubstitutionResponseEmailPayload) {
  const settings = await getSubstitutionEmailSettings();
  const cc = parseEmailList(settings.ccEmails);
  const responseLabel = payload.response === "approved" ? "aceitou" : "rejeitou";
  const subject = `Substituição ${payload.response === "approved" ? "aceite" : "rejeitada"} - ${formatDate(payload.substitutionDate)}`;

  if (!settings.enabled) {
    await logEmail({
      type: "group_class_substitution_response",
      status: "skipped",
      toEmail: payload.absentTeacherEmail,
      ccEmails: cc.join(", "),
      subject,
      requestId: payload.requestId,
      error: "Envio desativado nas configurações."
    });
    return;
  }

  const itemLines = payload.items.map(itemLabel);
  const text = [
    `Olá ${payload.absentTeacherName},`,
    "",
    `${payload.substituteTeacherName} ${responseLabel} a substituição de ${formatDate(payload.substitutionDate)}.`,
    "",
    ...itemLines.map((line) => `- ${line}`),
    "",
    `Consulta o pedido aqui: ${payload.actionUrl}`
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Substituição ${payload.response === "approved" ? "aceite" : "rejeitada"}</h2>
      <p>Olá ${payload.absentTeacherName},</p>
      <p><strong>${payload.substituteTeacherName}</strong> ${responseLabel} a substituição de <strong>${formatDate(payload.substitutionDate)}</strong>.</p>
      <ul>${itemLines.map((line) => `<li>${line}</li>`).join("")}</ul>
      <p><a href="${payload.actionUrl}" style="display:inline-block;padding:10px 14px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px;">Ver pedido</a></p>
    </div>
  `;

  try {
    const providerId = await sendResendEmail({
      to: payload.absentTeacherEmail,
      cc,
      subject,
      html,
      text
    });

    await logEmail({
      type: "group_class_substitution_response",
      status: "sent",
      toEmail: payload.absentTeacherEmail,
      ccEmails: cc.join(", "),
      subject,
      providerId,
      requestId: payload.requestId
    });
  } catch (error) {
    await logEmail({
      type: "group_class_substitution_response",
      status: "failed",
      toEmail: payload.absentTeacherEmail,
      ccEmails: cc.join(", "),
      subject,
      requestId: payload.requestId,
      error: error instanceof Error ? error.message : "Erro desconhecido"
    });
  }
}
