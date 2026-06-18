export function normalizeTierAmountInput(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "0";
}

export function isPositiveTierAmount(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  const amount = Number(trimmed.replace(",", "."));
  return Number.isFinite(amount) && amount > 0;
}
