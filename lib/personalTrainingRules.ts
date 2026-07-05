export const trainingDurationOptions = [30, 45, 60];

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getTrainingTypeName(description: string) {
  return description.replace(/\s+-\s+(10\s+sess(?:ões|oes)|1\s+sess(?:ão|ao))$/i, "").trim();
}

export function getTrainingTypeKey(description: string) {
  return normalizeText(getTrainingTypeName(description));
}

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

export function requiredParticipantsForType(description?: string | null) {
  if (!description) {
    return 1;
  }

  const normalized = description.toLowerCase();

  if (normalized.includes("trio") || normalized.includes("grupo")) {
    return 3;
  }

  if (normalized.includes("pares")) {
    return 2;
  }

  return 1;
}
