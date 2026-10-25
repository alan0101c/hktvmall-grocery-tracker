import type { PriceHistory, Product, ProductType } from "@workspace/db";
import { applyDiscount, effectiveDiscountPercent } from "./settings.js";

export interface CategoryOverview {
  productTypeId: number;
  bigCategory: string;
  subCategory: string;
  name: string;
  cheapestPricePerUnit: number | null;
  productUrl: string | null;
  unit: string;
  historicalLow: number | null;
  historicalLowDate: string | null;
}

type UnitProduct = Pick<Product, "packageQuantity" | "itemCount">;

/** Calculate a comparable unit price using the listing's current package metadata. */
export function calculateOverviewUnitPrice(
  price: number,
  discountPercent: number,
  product: UnitProduct,
): number | null {
  const packageQuantity = product.packageQuantity == null ? null : Number(product.packageQuantity);
  const itemCount = product.itemCount;
  const adjustedPrice = applyDiscount(price, discountPercent);

  let denominator: number | null = null;
  if (itemCount != null && itemCount > 0 && packageQuantity != null && packageQuantity > 0) {
    denominator = itemCount;
  } else if (packageQuantity != null && packageQuantity > 0) {
    denominator = packageQuantity;
  }

  if (denominator == null) return null;
  return Math.round((adjustedPrice / denominator) * 10000) / 10000;
}

function categoryParts(name: string) {
  const parts = name.split("/").map((part) => part.trim()).filter(Boolean);
  return {
    bigCategory: parts.length >= 2 ? parts[0] : "",
    subCategory: parts.length >= 3 ? parts.slice(1, -1).join(" / ") : "",
    name: parts[parts.length - 1] ?? name.trim(),
  };
}

/**
 * Build one row per category. Current prices only consider available listings;
 * historical lows consider every recorded listing in the category.
 */
export function buildCategoryOverview(
  types: ProductType[],
  products: Product[],
  history: PriceHistory[],
): CategoryOverview[] {
  const productsByType = new Map<number, Product[]>();
  for (const product of products) {
    if (product.productTypeId == null) continue;
    const group = productsByType.get(product.productTypeId) ?? [];
    group.push(product);
    productsByType.set(product.productTypeId, group);
  }

  const historyByProduct = new Map<number, PriceHistory[]>();
  for (const record of history) {
    const group = historyByProduct.get(record.productId) ?? [];
    group.push(record);
    historyByProduct.set(record.productId, group);
  }

  return types.map((type) => {
    const listings = productsByType.get(type.id) ?? [];
    const currentListings = listings
      .filter((product) => product.status === "active" && product.inStock)
      .map((product) => ({
        product,
        price: calculateOverviewUnitPrice(
          Number(product.currentPrice),
          effectiveDiscountPercent(product),
          product,
        ),
      }))
      .filter((listing): listing is { product: Product; price: number } => listing.price != null);
    const cheapestListing = currentListings.reduce<{ product: Product; price: number } | null>(
      (cheapest, listing) => cheapest == null || listing.price < cheapest.price ? listing : cheapest,
      null,
    );

    let historicalLow: number | null = null;
    let historicalLowDate: string | null = null;

    const consider = (price: number | null, recordedAt: Date) => {
      if (price == null) return;
      const isoDate = recordedAt.toISOString();
      if (
        historicalLow == null ||
        price < historicalLow ||
        (price === historicalLow && (historicalLowDate == null || isoDate > historicalLowDate))
      ) {
        historicalLow = price;
        historicalLowDate = isoDate;
      }
    };

    for (const listing of listings) {
      for (const record of historyByProduct.get(listing.id) ?? []) {
        consider(
          calculateOverviewUnitPrice(
            Number(record.price),
            record.extraDiscountPercent == null ? 0 : Number(record.extraDiscountPercent),
            listing,
          ),
          record.recordedAt,
        );
      }

      // Tracking normally writes history immediately, but including the current
      // snapshot also keeps the low accurate if an older listing has no history.
      consider(
        calculateOverviewUnitPrice(
          Number(listing.currentPrice),
          effectiveDiscountPercent(listing),
          listing,
        ),
        listing.lastUpdated,
      );
    }

    return {
      productTypeId: type.id,
      ...categoryParts(type.name),
      cheapestPricePerUnit: cheapestListing?.price ?? null,
      productUrl: cheapestListing?.product.productUrl ?? null,
      unit: type.unitLabel,
      historicalLow,
      historicalLowDate,
    };
  });
}
