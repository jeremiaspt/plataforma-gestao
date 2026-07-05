export const billingCycleOptions = [
  {
    key: "calendar_month",
    label: "Início do mês ao final do mês",
    startDay: 1,
    endDay: null
  },
  {
    key: "day_11_to_10",
    label: "Dia 11 do mês anterior ao dia 10 do mês corrente",
    startDay: 11,
    endDay: 10
  },
  {
    key: "day_19_to_18",
    label: "Dia 19 do mês anterior ao dia 18 do mês corrente",
    startDay: 19,
    endDay: 18
  }
];

export function isBillingCycleKey(value: string) {
  return billingCycleOptions.some((option) => option.key === value);
}

export function getBillingCycleLabel(value?: string | null) {
  return billingCycleOptions.find((option) => option.key === value)?.label || billingCycleOptions[0].label;
}

export function currentBillingMonthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function parseBillingMonth(value?: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value || "");
  if (!match) {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  }

  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 };
}

export function getBillingPeriod(cycleKey: string | null | undefined, monthValue?: string) {
  const { year, monthIndex } = parseBillingMonth(monthValue);

  if (cycleKey === "day_11_to_10") {
    return {
      start: new Date(year, monthIndex - 1, 11),
      endExclusive: new Date(year, monthIndex, 11)
    };
  }

  if (cycleKey === "day_19_to_18") {
    return {
      start: new Date(year, monthIndex - 1, 19),
      endExclusive: new Date(year, monthIndex, 19)
    };
  }

  return {
    start: new Date(year, monthIndex, 1),
    endExclusive: new Date(year, monthIndex + 1, 1)
  };
}

export function formatBillingPeriod(start: Date, endExclusive: Date) {
  const end = new Date(endExclusive);
  end.setDate(end.getDate() - 1);

  return `${start.toLocaleDateString("pt-PT")} a ${end.toLocaleDateString("pt-PT")}`;
}
