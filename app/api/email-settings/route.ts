import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { emailProviderAvailability, setEmailProvider } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { appRedirectUrl } from "@/lib/url";

export async function POST(request: Request) {
  const user = await requireUser();

  if (!hasRole(user, "admin")) {
    return NextResponse.redirect(appRedirectUrl("/dashboard", request));
  }

  const formData = await request.formData();
  const paymentEnabled = formData.get("paymentEnabled") === "on";
  const paymentCcEmails = String(formData.get("paymentCcEmails") || "").trim();
  const substitutionEnabled = formData.get("substitutionEnabled") === "on";
  const substitutionCcEmails = String(formData.get("substitutionCcEmails") || "").trim();
  const classStudentEnabled = formData.get("classStudentEnabled") === "on";
  const classStudentCcEmails = String(formData.get("classStudentCcEmails") || "").trim();
  const groupClassScheduleEnabled = formData.get("groupClassScheduleEnabled") === "on";
  const groupClassScheduleCcEmails = String(formData.get("groupClassScheduleCcEmails") || "").trim();
  const timesheetDocumentsEnabled = formData.get("timesheetDocumentsEnabled") === "on";
  const timesheetDocumentsCcEmails = String(formData.get("timesheetDocumentsCcEmails") || "").trim();
  const selectedProvider = String(formData.get("emailProvider") || "").toLowerCase().trim();
  const availability = emailProviderAvailability();

  if ((selectedProvider !== "resend" && selectedProvider !== "brevo") || !availability[selectedProvider]) {
    return NextResponse.redirect(appRedirectUrl("/configuracoes-email?tab=settings&error=1", request));
  }

  try {
    await prisma.$transaction([
      setEmailProvider(selectedProvider),
      prisma.emailSettings.upsert({
        where: { key: "personal_training_payment" },
        update: {
          enabled: paymentEnabled,
          ccEmails: paymentCcEmails
        },
        create: {
          key: "personal_training_payment",
          enabled: paymentEnabled,
          ccEmails: paymentCcEmails
        }
      }),
      prisma.emailSettings.upsert({
        where: { key: "group_class_substitution" },
        update: {
          enabled: substitutionEnabled,
          ccEmails: substitutionCcEmails
        },
        create: {
          key: "group_class_substitution",
          enabled: substitutionEnabled,
          ccEmails: substitutionCcEmails
        }
      }),
      prisma.emailSettings.upsert({
        where: { key: "class_student_notifications" },
        update: {
          enabled: classStudentEnabled,
          ccEmails: classStudentCcEmails
        },
        create: {
          key: "class_student_notifications",
          enabled: classStudentEnabled,
          ccEmails: classStudentCcEmails
        }
      }),
      prisma.emailSettings.upsert({
        where: { key: "group_class_schedule" },
        update: {
          enabled: groupClassScheduleEnabled,
          ccEmails: groupClassScheduleCcEmails
        },
        create: {
          key: "group_class_schedule",
          enabled: groupClassScheduleEnabled,
          ccEmails: groupClassScheduleCcEmails
        }
      }),
      prisma.emailSettings.upsert({
        where: { key: "timesheet_documents" },
        update: {
          enabled: timesheetDocumentsEnabled,
          ccEmails: timesheetDocumentsCcEmails
        },
        create: {
          key: "timesheet_documents",
          enabled: timesheetDocumentsEnabled,
          ccEmails: timesheetDocumentsCcEmails
        }
      })
    ]);

    return NextResponse.redirect(appRedirectUrl("/configuracoes-email?tab=settings&success=1", request));
  } catch {
    return NextResponse.redirect(appRedirectUrl("/configuracoes-email?tab=settings&error=1", request));
  }
}
