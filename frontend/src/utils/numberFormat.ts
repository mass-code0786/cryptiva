export const toFiniteNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const formatFixedSafe = (value: unknown, digits = 2, fallback = "0.00"): string => {
  const num = toFiniteNumberOrNull(value);
  if (num === null) return fallback;
  return num.toFixed(digits);
};

export const formatLocaleSafe = (
  value: unknown,
  options: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 8 },
  fallback = "0.00"
): string => {
  const num = toFiniteNumberOrNull(value);
  if (num === null) return fallback;
  return num.toLocaleString(undefined, options);
};
