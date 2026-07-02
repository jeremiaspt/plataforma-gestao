import { prisma } from "@/lib/prisma";

export const minimumAllowedCreditBalance = -2;

export type PersonalTrainingCreditBalance = {
  studentId: string;
  memberNumber: string;
  fullName: string;
  purchasedCredits: number;
  usedCredits: number;
  availableCredits: number;
  canBook: boolean;
};

export async function getCreditBalancesForTeacher(teacherId: string): Promise<PersonalTrainingCreditBalance[]> {
  const [payments, bookings] = await Promise.all([
    prisma.personalTrainingPayment.groupBy({
      by: ["studentId"],
      where: { teacherId },
      _sum: { totalCredits: true }
    }),
    prisma.personalTrainingBooking.groupBy({
      by: ["studentId"],
      where: {
        teacherId,
        status: { not: "cancelled" }
      },
      _sum: { creditsUsed: true }
    })
  ]);

  const studentIds = Array.from(
    new Set([...payments.map((payment) => payment.studentId), ...bookings.map((booking) => booking.studentId)])
  );

  if (studentIds.length === 0) {
    return [];
  }

  const students = await prisma.personalTrainingStudent.findMany({
    where: { id: { in: studentIds } },
    orderBy: { fullName: "asc" }
  });

  const paymentsByStudent = new Map(payments.map((payment) => [payment.studentId, payment._sum.totalCredits || 0]));
  const bookingsByStudent = new Map(bookings.map((booking) => [booking.studentId, booking._sum.creditsUsed || 0]));

  return students.map((student) => {
    const purchasedCredits = paymentsByStudent.get(student.id) || 0;
    const usedCredits = bookingsByStudent.get(student.id) || 0;
    const availableCredits = purchasedCredits - usedCredits;

    return {
      studentId: student.id,
      memberNumber: student.memberNumber,
      fullName: student.fullName,
      purchasedCredits,
      usedCredits,
      availableCredits,
      canBook: availableCredits > minimumAllowedCreditBalance
    };
  });
}

export async function getCreditBalanceForTeacherStudent(teacherId: string, studentId: string) {
  const balances = await getCreditBalancesForTeacher(teacherId);
  return balances.find((balance) => balance.studentId === studentId) || null;
}
