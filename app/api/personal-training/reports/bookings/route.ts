import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { formatBillingPeriod, getBillingCycleLabel, getBillingPeriod } from "@/lib/billingCycles";
import { buildExcelTable, excelResponse, formatReportDate, minutesToTime } from "@/lib/excelReport";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await requireUser();
  const roleKeys = user.roles.map((userRole) => userRole.role.key);

  if (!roleKeys.includes("admin")) {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const url = new URL(request.url);
  const teacherId = url.searchParams.get("teacherId") || "";
  const month = url.searchParams.get("month") || undefined;

  if (!teacherId) {
    return NextResponse.json({ error: "Professor em falta." }, { status: 400 });
  }

  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    include: { roles: { include: { role: true } } }
  });

  if (!teacher || !teacher.roles.some((userRole) => userRole.role.key === "professor")) {
    return NextResponse.json({ error: "Professor invalido." }, { status: 404 });
  }

  const period = getBillingPeriod(teacher.billingCycle, month);
  const bookings = await prisma.personalTrainingBooking.findMany({
    where: {
      teacherId,
      bookingDate: {
        gte: period.start,
        lt: period.endExclusive
      }
    },
    orderBy: [{ bookingDate: "asc" }, { startMinutes: "asc" }],
    include: {
      teacher: { select: { name: true } },
      student: true,
      paymentType: true,
      poolBlock: true
    }
  });

  const rows = bookings.map((booking) => ({
    Data: formatReportDate(booking.bookingDate),
    Hora: `${minutesToTime(booking.startMinutes)} - ${minutesToTime(booking.endMinutes)}`,
    Professor: booking.teacher.name,
    Pista: booking.poolBlock.laneNumber,
    Bloco: booking.poolBlock.title,
    "N. utente": booking.student.memberNumber,
    Utente: booking.student.fullName,
    "Tipo de aula": booking.paymentType?.description || "",
    Duracao: `${booking.durationMinutes} min`,
    "Creditos usados": booking.creditsUsed,
    Estado: booking.status
  }));

  const title = `Agendamentos TP - ${teacher.name} - ${formatBillingPeriod(period.start, period.endExclusive)} - ${getBillingCycleLabel(
    teacher.billingCycle
  )}`;
  const content = buildExcelTable(title, rows);
  const filename = `agendamentos-tp-${teacher.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${formatReportDate(period.start).replace(/\//g, "-")}.xls`;

  return excelResponse(filename, content);
}
