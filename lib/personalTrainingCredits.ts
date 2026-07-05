import { prisma } from "@/lib/prisma";

export const minimumAllowedCreditBalance = -2;

export type PersonalTrainingCreditBalance = {
  studentId: string;
  memberNumber: string;
  fullName: string;
  paymentTypeId: string;
  paymentTypeDescription: string;
  purchasedCredits: number;
  usedCredits: number;
  availableCredits: number;
  canBook: boolean;
};

export async function getCreditBalancesForTeacher(teacherId: string): Promise<PersonalTrainingCreditBalance[]> {
  const [payments, bookings] = await Promise.all([
    prisma.personalTrainingPayment.groupBy({
      by: ["studentId", "paymentTypeId"],
      where: { teacherId },
      _sum: { totalCredits: true }
    }),
    prisma.personalTrainingBooking.groupBy({
      by: ["studentId", "paymentTypeId"],
      where: {
        teacherId,
        paymentTypeId: { not: null },
        status: { not: "cancelled" }
      },
      _sum: { creditsUsed: true }
    })
  ]);

  const studentIds = Array.from(
    new Set([...payments.map((payment) => payment.studentId), ...bookings.map((booking) => booking.studentId)])
  );
  const paymentTypeIds = Array.from(
    new Set([
      ...payments.map((payment) => payment.paymentTypeId),
      ...bookings.map((booking) => booking.paymentTypeId).filter((id): id is string => Boolean(id))
    ])
  );

  if (studentIds.length === 0 || paymentTypeIds.length === 0) {
    return [];
  }

  const [students, paymentTypes] = await Promise.all([
    prisma.personalTrainingStudent.findMany({
      where: { id: { in: studentIds } },
      orderBy: { fullName: "asc" }
    }),
    prisma.personalTrainingPaymentType.findMany({
      where: { id: { in: paymentTypeIds } },
      orderBy: { description: "asc" }
    })
  ]);

  const studentsById = new Map(students.map((student) => [student.id, student]));
  const paymentTypesById = new Map(paymentTypes.map((paymentType) => [paymentType.id, paymentType]));
  const keyFor = (studentId: string, paymentTypeId: string) => `${studentId}:${paymentTypeId}`;
  const paymentsByKey = new Map(
    payments.map((payment) => [keyFor(payment.studentId, payment.paymentTypeId), payment._sum.totalCredits || 0])
  );
  const bookingsByKey = new Map(
    bookings
      .filter((booking) => booking.paymentTypeId)
      .map((booking) => [keyFor(booking.studentId, booking.paymentTypeId as string), booking._sum.creditsUsed || 0])
  );

  return payments
    .map((payment) => {
      const student = studentsById.get(payment.studentId);
      const paymentType = paymentTypesById.get(payment.paymentTypeId);

      if (!student || !paymentType) {
        return null;
      }

      const key = keyFor(payment.studentId, payment.paymentTypeId);
      const purchasedCredits = paymentsByKey.get(key) || 0;
      const usedCredits = bookingsByKey.get(key) || 0;
      const availableCredits = purchasedCredits - usedCredits;

      return {
        studentId: student.id,
        memberNumber: student.memberNumber,
        fullName: student.fullName,
        paymentTypeId: paymentType.id,
        paymentTypeDescription: paymentType.description,
        purchasedCredits,
        usedCredits,
        availableCredits,
        canBook: availableCredits > minimumAllowedCreditBalance
      };
    })
    .filter((balance): balance is PersonalTrainingCreditBalance => Boolean(balance))
    .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.paymentTypeDescription.localeCompare(b.paymentTypeDescription));
}

export async function getCreditBalanceForTeacherStudentType(teacherId: string, studentId: string, paymentTypeId: string) {
  const balances = await getCreditBalancesForTeacher(teacherId);
  return (
    balances.find((balance) => balance.studentId === studentId && balance.paymentTypeId === paymentTypeId) || null
  );
}
