export const trainingDurationOptions = [30, 45, 60];

export function paymentTypeMatchesDuration(description: string, durationMinutes: number) {
  const normalized = description.toLowerCase();
  return normalized.includes(`${durationMinutes}m`) || normalized.includes(`${durationMinutes} min`);
}

export function isExclusiveTrainingType(description?: string | null) {
  if (!description) {
    return false;
  }

  const normalized = description.toLowerCase();
  return normalized.includes("pares") || normalized.includes("trio") || normalized.includes("grupo");
}
