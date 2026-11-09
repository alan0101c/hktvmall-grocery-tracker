import type { PriceHistory, Product, ProductType } from "@workspace/db";
import { applyDiscount } from "./settings.js";
import {
  productPromotionLabels,
  promotionFromSnapshot,
  resolveApprovedPromotion,
  type AppliedPromotion,
  type PromotionRuleLike,
} from "./promotionRules.js";

export interface CategoryOverview {
  productTypeId: number;
  bigCategory: string;
  subCategory: string;
  name: string;
  cheapestPricePerUnit: number | null;
  productUrl: string | null;
  cheapestPromotion: AppliedPromotion | null;
  unit: string;
  historicalLow: number | null;
  historicalLowDate: string | null;
  historicalLowPromotion: AppliedPromotion | null;
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
  promotionRules: PromotionRuleLike[] = [],
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
      .map((product) => {
        const appliedPromotion = resolveApprovedPromotion(productPromotionLabels(product), promotionRules);
        return {
          product,
          appliedPromotion,
          price: calculateOverviewUnitPrice(
            Number(product.currentPrice),
            appliedPromotion?.discountPercent ?? 0,
            product,
          ),
        };
      })
      .filter((listing): listing is { product: Product; appliedPromotion: AppliedPromotion | null; price: number } => listing.price != null);
    const cheapestListing = currentListings.reduce<typeof currentListings[number] | null>(
      (cheapest, listing) => cheapest == null || listing.price < cheapest.price ? listing : cheapest,
      null,
    );

    let historicalLow: number | null = null;
    let historicalLowDate: string | null = null;
    let historicalLowPromotion: AppliedPromotion | null = null;

    const consider = (price: number | null, recordedAt: Date, appliedPromotion: AppliedPromotion | null) => {
      if (price == null) return;
      const isoDate = recordedAt.toISOString();
      if (
        historicalLow == null ||
        price < historicalLow ||
        (price === historicalLow && (historicalLowDate == null || isoDate > historicalLowDate))
      ) {
        historicalLow = price;
        historicalLowDate = isoDate;
        historicalLowPromotion = appliedPromotion;
      }
    };

    for (const listing of listings) {
      for (const record of historyByProduct.get(listing.id) ?? []) {
        const appliedPromotion = promotionFromSnapshot(record);
        consider(
          calculateOverviewUnitPrice(
            Number(record.price),
            appliedPromotion?.discountPercent ?? 0,
            listing,
          ),
          record.recordedAt,
          appliedPromotion,
        );
      }

      // Tracking normally writes history immediately. Use the last-scrape
      // snapshot for older listings so rule edits never rewrite historical lows.
      const snapshotPromotion = promotionFromSnapshot(listing);
      consider(
        calculateOverviewUnitPrice(
          Number(listing.currentPrice),
          snapshotPromotion?.discountPercent ?? 0,
          listing,
        ),
        listing.lastUpdated,
        snapshotPromotion,
      );
    }

    return {
      productTypeId: type.id,
      ...categoryParts(type.name),
      cheapestPricePerUnit: cheapestListing?.price ?? null,
      productUrl: cheapestListing?.product.productUrl ?? null,
      cheapestPromotion: cheapestListing?.appliedPromotion ?? null,
      unit: type.unitLabel,
      historicalLow,
      historicalLowDate,
      historicalLowPromotion,
    };
  });
}
