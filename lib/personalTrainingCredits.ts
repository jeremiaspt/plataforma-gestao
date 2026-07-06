import { getTrainingTypeKey, getTrainingTypeName, paymentTypeMatchesDuration } from "@/lib/personalTrainingRules";
import { prisma } from "@/lib/prisma";

export const minimumAllowedCreditBalance = -2;

export type PersonalTrainingCreditBalance = {
  studentId: string;
  memberNumber: string;
  fullName: string;
  trainingTypeKey: string;
  trainingTypeName: string;
  durationMinutes: number;
  purchasedCredits: number;
  adjustedCredits: number;
  usedCredits: number;
  availableCredits: number;
  canBook: boolean;
};

function durationFromDescription(description: string) {
  if (paymentTypeMatchesDuration(description, 30)) return 30;
  if (paymentTypeMatchesDuration(description, 45)) return 45;
  if (paymentTypeMatchesDuration(description, 60)) return 60;
  return 0;
}

export async function getCreditBalancesForTeacher(teacherId: string): Promise<PersonalTrainingCreditBalance[]> {
  const [payments, bookings, adjustments] = await Promise.all([
    prisma.personalTrainingPayment.findMany({
      where: { teacherId, status: { not: "cancelled" } },
      include: { student: true, paymentType: true }
    }),
    prisma.personalTrainingBooking.findMany({
      where: {
        teacherId,
        status: { not: "cancelled" },
        paymentType: { isNot: null }
      },
      include: { student: true, paymentType: true }
    }),
    prisma.personalTrainingCreditAdjustment.findMany({
      where: { teacherId }
    })
  ]);

  const balances = new Map<string, PersonalTrainingCreditBalance>();

  for (const payment of payments) {
    const trainingTypeKey = getTrainingTypeKey(payment.paymentType.description);
    const key = `${payment.studentId}:${trainingTypeKey}`;
    const current =
      balances.get(key) ||
      {
        studentId: payment.student.id,
        memberNumber: payment.student.memberNumber,
        fullName: payment.student.fullName,
        trainingTypeKey,
        trainingTypeName: getTrainingTypeName(payment.paymentType.description),
        durationMinutes: durationFromDescription(payment.paymentType.description),
        purchasedCredits: 0,
        adjustedCredits: 0,
        usedCredits: 0,
        availableCredits: 0,
        canBook: false
      };

    current.purchasedCredits += payment.totalCredits;
    balances.set(key, current);
  }

  for (const booking of bookings) {
    if (!booking.paymentType) continue;

    const trainingTypeKey = getTrainingTypeKey(booking.paymentType.description);
    const key = `${booking.studentId}:${trainingTypeKey}`;
    const current =
      balances.get(key) ||
      {
        studentId: booking.student.id,
        memberNumber: booking.student.memberNumber,
        fullName: booking.student.fullName,
        trainingTypeKey,
        trainingTypeName: getTrainingTypeName(booking.paymentType.description),
        durationMinutes: durationFromDescription(booking.paymentType.description),
        purchasedCredits: 0,
        adjustedCredits: 0,
        usedCredits: 0,
        availableCredits: 0,
        canBook: false
      };

    current.usedCredits += booking.creditsUsed;
    balances.set(key, current);
  }

  for (const adjustment of adjustments) {
    const key = `${adjustment.studentId}:${adjustment.trainingTypeKey}`;
    const current =
      balances.get(key) ||
      {
        studentId: adjustment.studentId,
        memberNumber: "",
        fullName: "",
        trainingTypeKey: adjustment.trainingTypeKey,
        trainingTypeName: adjustment.trainingTypeName,
        durationMinutes: 0,
        purchasedCredits: 0,
        adjustedCredits: 0,
        usedCredits: 0,
        availableCredits: 0,
        canBook: false
      };

    current.adjustedCredits += adjustment.deltaCredits;
    balances.set(key, current);
  }

  return Array.from(balances.values())
    .map((balance) => {
      const availableCredits = balance.purchasedCredits + balance.adjustedCredits - balance.usedCredits;
      return {
        ...balance,
        availableCredits,
        canBook: availableCredits > minimumAllowedCreditBalance
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.trainingTypeName.localeCompare(b.trainingTypeName));
}

export async function getCreditBalanceForTeacherStudentTrainingType(
  teacherId: string,
  studentId: string,
  trainingTypeKey: string
) {
  const balances = await getCreditBalancesForTeacher(teacherId);
  return (
    balances.find((balance) => balance.studentId === studentId && balance.trainingTypeKey === trainingTypeKey) || null
  );
}
