import { NextResponse } from "next/server";
import { hasRole, requireUser } from "@/lib/auth";
import { emailProviderAvailability, type EmailProvider } from "@/lib/email";
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
  const paymentProvider = String(formData.get("paymentProvider") || "resend").toLowerCase().trim() as EmailProvider;
  const substitutionEnabled = formData.get("substitutionEnabled") === "on";
  const substitutionCcEmails = String(formData.get("substitutionCcEmails") || "").trim();
  const substitutionProvider = String(formData.get("substitutionProvider") || "resend").toLowerCase().trim() as EmailProvider;
  const classStudentEnabled = formData.get("classStudentEnabled") === "on";
  const classStudentCcEmails = String(formData.get("classStudentCcEmails") || "").trim();
  const classStudentProvider = String(formData.get("classStudentProvider") || "resend").toLowerCase().trim() as EmailProvider;
  const groupClassScheduleEnabled = formData.get("groupClassScheduleEnabled") === "on";
  const groupClassScheduleCcEmails = String(formData.get("groupClassScheduleCcEmails") || "").trim();
  const groupClassScheduleProvider = String(formData.get("groupClassScheduleProvider") || "resend").toLowerCase().trim() as EmailProvider;
  const timesheetDocumentsEnabled = formData.get("timesheetDocumentsEnabled") === "on";
  const timesheetDocumentsCcEmails = String(formData.get("timesheetDocumentsCcEmails") || "").trim();
  const timesheetDocumentsProvider = String(formData.get("timesheetDocumentsProvider") || "resend").toLowerCase().trim() as EmailProvider;
  const passwordResetProvider = String(formData.get("passwordResetProvider") || "resend").toLowerCase().trim() as EmailProvider;
  const availability = emailProviderAvailability();
  const selectedProviders = [paymentProvider, substitutionProvider, classStudentProvider, groupClassScheduleProvider, timesheetDocumentsProvider, passwordResetProvider];

  if (selectedProviders.some((provider) => (provider !== "resend" && provider !== "brevo") || !availability[provider])) {
    return NextResponse.redirect(appRedirectUrl("/configuracoes-email?tab=settings&error=1", request));
  }

  try {
    await prisma.$transaction([
      prisma.emailSettings.upsert({
        where: { key: "password_reset" },
        update: {
          provider: passwordResetProvider
        },
        create: {
          key: "password_reset",
          enabled: true,
          ccEmails: "",
          provider: passwordResetProvider
        }
      }),
      prisma.emailSettings.upsert({
        where: { key: "personal_training_payment" },
        update: {
          enabled: paymentEnabled,
          ccEmails: paymentCcEmails,
          provider: paymentProvider
        },
        create: {
          key: "personal_training_payment",
          enabled: paymentEnabled,
          ccEmails: paymentCcEmails,
          provider: paymentProvider
        }
      }),
      prisma.emailSettings.upsert({
        where: { key: "group_class_substitution" },
        update: {
          enabled: substitutionEnabled,
          ccEmails: substitutionCcEmails,
          provider: substitutionProvider
        },
        create: {
          key: "group_class_substitution",
          enabled: substitutionEnabled,
          ccEmails: substitutionCcEmails,
          provider: substitutionProvider
        }
      }),
      prisma.emailSettings.upsert({
        where: { key: "class_student_notifications" },
        update: {
          enabled: classStudentEnabled,
          ccEmails: classStudentCcEmails,
          provider: classStudentProvider
        },
        create: {
          key: "class_student_notifications",
          enabled: classStudentEnabled,
          ccEmails: classStudentCcEmails,
          provider: classStudentProvider
        }
      }),
      prisma.emailSettings.upsert({
        where: { key: "group_class_schedule" },
        update: {
          enabled: groupClassScheduleEnabled,
          ccEmails: groupClassScheduleCcEmails,
          provider: groupClassScheduleProvider
        },
        create: {
          key: "group_class_schedule",
          enabled: groupClassScheduleEnabled,
          ccEmails: groupClassScheduleCcEmails,
          provider: groupClassScheduleProvider
        }
      }),
      prisma.emailSettings.upsert({
        where: { key: "timesheet_documents" },
        update: {
          enabled: timesheetDocumentsEnabled,
          ccEmails: timesheetDocumentsCcEmails,
          provider: timesheetDocumentsProvider
        },
        create: {
          key: "timesheet_documents",
          enabled: timesheetDocumentsEnabled,
          ccEmails: timesheetDocumentsCcEmails,
          provider: timesheetDocumentsProvider
        }
      })
    ]);

    return NextResponse.redirect(appRedirectUrl("/configuracoes-email?tab=settings&success=1", request));
  } catch {
    return NextResponse.redirect(appRedirectUrl("/configuracoes-email?tab=settings&error=1", request));
  }
}
