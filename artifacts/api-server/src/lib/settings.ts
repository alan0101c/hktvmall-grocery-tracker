/** Applies a reviewed promotion percentage to a listed price, rounded to 2 decimals. */
export function applyDiscount(price: number, discountPercent: number): number {
  if (!discountPercent || discountPercent <= 0) return price;
  return Math.round(price * (1 - discountPercent / 100) * 100) / 100;
}
