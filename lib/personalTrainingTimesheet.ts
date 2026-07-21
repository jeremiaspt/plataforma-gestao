import { getBillingPeriod } from "@/lib/billingCycles";
import { decimalToNumber } from "@/lib/money";
import { dateToInputValue } from "@/lib/pool";
import { prisma } from "@/lib/prisma";

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
    const paymentTypeIds = new Set(rule.items.map((item) => item.paymentTypeId));
    const firstPaymentType = rule.items[0]?.paymentType;

    return {
      id: rule.id,
      name: rule.name,
      dayCredits: new Map<string, number>(),
      dayQuantity: new Map<string, number>(),
      paymentTypeIds,
      totalCredits: 0,
      totalQuantity: 0,
      totalValue: 0,
      unitTeacherValue: firstPaymentType ? decimalToNumber(firstPaymentType.teacherPrice) : 0
    };
  });
  const unmatched: Array<{ date: string; student: string; paymentType: string; credits: number; value: number }> = [];

  for (const payment of payments) {
    const dateValue = dateToInputValue(payment.createdAt);
    const row = rows.find((candidate) => candidate.paymentTypeIds.has(payment.paymentTypeId));
    const teacherTotal = decimalToNumber(payment.teacherTotal);

    if (!row) {
      unmatched.push({
        date: dateValue,
        student: `${payment.student.fullName} - ${payment.student.memberNumber}`,
        paymentType: payment.paymentType.description,
        credits: payment.totalCredits,
        value: teacherTotal
      });
      continue;
    }

    row.dayCredits.set(dateValue, (row.dayCredits.get(dateValue) || 0) + payment.totalCredits);
    row.dayQuantity.set(dateValue, (row.dayQuantity.get(dateValue) || 0) + payment.quantity);
    row.totalCredits += payment.totalCredits;
    row.totalQuantity += payment.quantity;
    row.totalValue += teacherTotal;
  }

  return {
    payments,
    period,
    rows,
    teacher,
    unmatched
  };
}
