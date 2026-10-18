/**
 * Price adjustment helpers. The only discount that exists now is the
 * per-product extra-off campaign tag scraped from the product's own
 * HKTVmall price tag (「今日85折」/「今日95折」). The old app-wide global
 * discount was removed — real promos are per-product, so a blanket rate
 * was misleading.
 */

/** Applies a discount percentage to a listed price, rounded to 2 decimals. */
export function applyDiscount(price: number, discountPercent: number): number {
  if (!discountPercent || discountPercent <= 0) return price;
  return Math.round(price * (1 - discountPercent / 100) * 100) / 100;
}

/**
 * The discount percentage that applies to a product: its own scraped campaign
 * tag, or 0 when the product has no tag (not campaign-eligible / not recorded).
 */
export function effectiveDiscountPercent(product: {
  extraDiscountPercent: string | null;
}): number {
  return product.extraDiscountPercent != null
    ? parseFloat(product.extraDiscountPercent)
    : 0;
}
