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

export function clampDiscountPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.floor(value)));
}

export function applyContentRenewalDiscount(
  amount: string,
  discountPercent: number
): string {
  const base = Number(amount.replace(",", "."));
  if (!Number.isFinite(base) || base <= 0) return normalizeTierAmountInput(amount);
  const discount = clampDiscountPercent(discountPercent);
  if (discount <= 0) return normalizeTierAmountInput(amount);
  return String(Math.max(0, Math.round(base * (1 - discount / 100))));
}

export function resolveContentTierAmount(options: {
  baseAmount: string;
  discountPercent: number;
  hasPriorContentSubscription: boolean;
}): { amount: string; payableAmount: string; isRenewalDiscount: boolean } {
  const amount = normalizeTierAmountInput(options.baseAmount);
  const discount = clampDiscountPercent(options.discountPercent);
  const isRenewalDiscount =
    options.hasPriorContentSubscription && discount > 0 && isPositiveTierAmount(amount);
  const payableAmount = isRenewalDiscount
    ? applyContentRenewalDiscount(amount, discount)
    : amount;
  return { amount, payableAmount, isRenewalDiscount };
}
