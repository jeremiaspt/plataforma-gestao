import { Prisma } from "@prisma/client";

export function decimalToNumber(value: Prisma.Decimal | number) {
  return typeof value === "number" ? value : value.toNumber();
}

export function formatCurrency(value: Prisma.Decimal | number) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR"
  }).format(decimalToNumber(value));
}
