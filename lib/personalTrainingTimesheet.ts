import { getBillingPeriod } from "@/lib/billingCycles";
import { decimalToNumber } from "@/lib/money";
import { dateToInputValue } from "@/lib/pool";
import { prisma } from "@/lib/prisma";
import { getPaidLessonsForPaymentType } from "@/lib/personalTrainingRules";

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function eachPeriodDate(start: Date, endExclusive: Date) {
  const dates: Date[] = [];

  for (let date = new Date(start); date < endExclusive; date = addDays(date, 1)) {
    dates.push(new Date(date));
  }

  return dates;
}

export async function calculatePersonalTrainingTimesheet({ month, teacherId }: { month?: string; teacherId: string }) {
  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { id: true, name: true, billingCycle: true }
  });

  if (!teacher) {
    return null;
  }

  const period = getBillingPeriod(teacher.billingCycle, month);
  const [rules, payments] = await Promise.all([
    prisma.personalTrainingTimesheetRule.findMany({
      where: { active: true },
      include: { items: { include: { paymentType: true } } },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    }),
    prisma.personalTrainingPayment.findMany({
      where: {
        teacherId,
        status: "active",
        createdAt: { gte: period.start, lt: period.endExclusive }
      },
      include: {
        paymentType: true,
        student: { select: { fullName: true, memberNumber: true } }
      },
      orderBy: [{ createdAt: "asc" }]
    })
  ]);

  const rows = rules.map((rule) => {
    const sortedItems = [...rule.items].sort((left, right) => left.paymentType.description.localeCompare(right.paymentType.description, "pt"));
    const firstPaymentType = sortedItems[0]?.paymentType;
    const firstPaidLessons = firstPaymentType ? getPaidLessonsForPaymentType(firstPaymentType.description, firstPaymentType.credits) : 0;
    const valuePerStudent = firstPaymentType && firstPaidLessons > 0 ? decimalToNumber(firstPaymentType.teacherPrice) / firstPaidLessons : 0;

    return {
      id: rule.id,
      name: rule.name,
      studentCount: rule.studentCount,
      dayLessons: new Map<string, number>(),
      paymentTypeIds: new Set(rule.items.map((item) => item.paymentTypeId)),
      totalLessons: 0,
      totalValue: 0,
      valuePerStudent
    };
  });
  const unmatched: Array<{ date: string; student: string; paymentType: string; lessons: number; value: number }> = [];

  for (const payment of payments) {
    const dateValue = dateToInputValue(payment.createdAt);
    const row = rows.find((candidate) => candidate.paymentTypeIds.has(payment.paymentTypeId));
    const teacherTotal = decimalToNumber(payment.teacherTotal);

    if (!row) {
      const paidLessons = getPaidLessonsForPaymentType(payment.paymentType.description, payment.creditsPerUnit) * payment.quantity;

      unmatched.push({
        date: dateValue,
        student: `${payment.student.fullName} - ${payment.student.memberNumber}`,
        paymentType: payment.paymentType.description,
        lessons: paidLessons,
        value: teacherTotal
      });
      continue;
    }

    const paidLessons = getPaidLessonsForPaymentType(payment.paymentType.description, payment.creditsPerUnit) * payment.quantity;
    const lessonCount = paidLessons / row.studentCount;

    row.dayLessons.set(dateValue, (row.dayLessons.get(dateValue) || 0) + lessonCount);
    row.totalLessons += lessonCount;
    row.totalValue += paidLessons * row.valuePerStudent;
  }

  return {
    payments,
    period,
    rows,
    teacher,
    unmatched
  };
}
