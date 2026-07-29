import { getBillingPeriod } from "@/lib/billingCycles";
import { decimalToNumber } from "@/lib/money";
import { dateToInputValue } from "@/lib/pool";
import { prisma } from "@/lib/prisma";
import { getPaidLessonsForPaymentType, requiredParticipantsForType } from "@/lib/personalTrainingRules";

function getTrainingDurationLabel(description: string) {
  const durationMatch = description.match(/(\d+)\s*(?:m|min)/i);
  return durationMatch ? `${durationMatch[1]}'` : description;
}

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

function formatDetailDate(dateValue: string, showMonth: boolean) {
  const date = new Date(`${dateValue}T00:00:00`);
  const day = date.getDate().toString();

  if (!showMonth) {
    return day;
  }

  return `${day}/${String(date.getMonth() + 1).padStart(2, "0")}`;
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
  const detailBuckets = new Map<
    string,
    {
      dateValue: string;
      payments: Array<{ id: string; createdAt: Date; student: { memberNumber: string; fullName: string } }>;
      requiredParticipants: number;
      trainingLabel: string;
    }
  >();
  const studentDetailMap = new Map<
    string,
    {
      students: Array<{ memberNumber: string; fullName: string }>;
      trainingLabel: string;
      dayCounts: Map<string, number>;
    }
  >();
  const showDetailMonth = period.start.getMonth() !== addDays(period.endExclusive, -1).getMonth();

  function addStudentDetail(students: Array<{ memberNumber: string; fullName: string }>, trainingLabel: string, dateValue: string) {
    const sortedStudents = students.sort((left, right) => left.fullName.localeCompare(right.fullName, "pt"));
    const detailKey = `${trainingLabel}:${sortedStudents.map((student) => student.memberNumber).join("|")}`;
    const studentDetail =
      studentDetailMap.get(detailKey) ||
      {
        students: sortedStudents,
        trainingLabel,
        dayCounts: new Map<string, number>()
      };

    studentDetail.dayCounts.set(dateValue, (studentDetail.dayCounts.get(dateValue) || 0) + 1);
    studentDetailMap.set(detailKey, studentDetail);
  }

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
    const trainingLabel = getTrainingDurationLabel(payment.paymentType.description);
    const requiredParticipants = requiredParticipantsForType(payment.paymentType.description);
    const detailBucketKey = requiredParticipants > 1 ? `${dateValue}:${payment.paymentTypeId}:${payment.quantity}:${trainingLabel}` : payment.id;
    const detailBucket =
      detailBuckets.get(detailBucketKey) ||
      {
        dateValue,
        payments: [],
        requiredParticipants,
        trainingLabel
      };

    row.dayLessons.set(dateValue, (row.dayLessons.get(dateValue) || 0) + lessonCount);
    row.totalLessons += lessonCount;
    row.totalValue += paidLessons * row.valuePerStudent;
    detailBucket.payments.push({
      id: payment.id,
      createdAt: payment.createdAt,
      student: {
        memberNumber: payment.student.memberNumber,
        fullName: payment.student.fullName
      }
    });
    detailBuckets.set(detailBucketKey, detailBucket);
  }

  for (const bucket of detailBuckets.values()) {
    const sortedPayments = bucket.payments.sort((left, right) => {
      const dateOrder = left.createdAt.getTime() - right.createdAt.getTime();
      if (dateOrder !== 0) return dateOrder;
      return left.id.localeCompare(right.id);
    });
    const chunkSize = Math.max(1, bucket.requiredParticipants);

    for (let index = 0; index < sortedPayments.length; index += chunkSize) {
      const students = sortedPayments.slice(index, index + chunkSize).map((payment) => payment.student);
      addStudentDetail(students, bucket.trainingLabel, bucket.dateValue);
    }
  }

  const studentDetails = Array.from(studentDetailMap.values())
    .map((detail) => ({
      ...detail,
      days: Array.from(detail.dayCounts.entries())
        .sort(([leftDay], [rightDay]) => leftDay.localeCompare(rightDay))
        .map(([dateValue, count]) => {
          const label = formatDetailDate(dateValue, showDetailMonth);
          return count > 1 ? `${label}x${count}` : label;
        })
    }))
    .sort((left, right) => {
      const leftFirstStudent = left.students[0];
      const rightFirstStudent = right.students[0];
      const nameOrder = (leftFirstStudent?.fullName || "").localeCompare(rightFirstStudent?.fullName || "", "pt");
      if (nameOrder !== 0) return nameOrder;
      return left.trainingLabel.localeCompare(right.trainingLabel, "pt", { numeric: true });
    });

  return {
    payments,
    period,
    rows,
    studentDetails,
    teacher,
    unmatched
  };
}
