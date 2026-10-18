import { db } from "@workspace/db";
import { productsTable, priceHistoryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { scrapeProductByUrl, ProductUnavailableError } from "./scraper.js";

export interface RefreshResult {
  refreshed: number;
  failed: number;
  /** Products that could not be refreshed because they are no longer listed on HKTVmall. */
  unavailable: number;
  priceDrops: number;
  errors: string[];
}

async function recordRefreshFailure(
  productId: number,
  error: string,
  unavailable: boolean
): Promise<void> {
  await db
    .update(productsTable)
    .set({
      ...(unavailable ? { status: "unavailable" } : {}),
      lastRefreshError: error,
      lastUpdated: new Date(),
    })
    .where(eq(productsTable.id, productId));
}

export async function refreshProduct(productId: number): Promise<{ success: boolean; priceChange?: number; error?: string; unavailable?: boolean }> {
  const products = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId));

  if (!products.length) return { success: false, error: "Product not found" };
  const product = products[0];

  if (!product.productUrl) return { success: false, error: "No URL for product" };

  try {
    const scraped = await scrapeProductByUrl(product.productUrl);
    if (!scraped) {
      const message = "Could not parse product page";
      await recordRefreshFailure(productId, message, false);
      return { success: false, error: message };
    }

    const oldPrice = parseFloat(product.currentPrice);
    const newPrice = scraped.currentPrice;
    const priceChange = newPrice - oldPrice;

    const promotionTexts = scraped.promotionTexts.length > 0 ? scraped.promotionTexts : null;
    const extraDiscountPercent = scraped.extraDiscount ? String(scraped.extraDiscount.percent) : null;
    const extraDiscountLabel = scraped.extraDiscount?.label ?? null;

    await db
      .update(productsTable)
      .set({
        // Product names (and categories) change on HKTVmall over time —
        // overwrite with the latest parse; no history is kept for them.
        name: scraped.name,
        currentPrice: newPrice.toString(),
        originalPrice: scraped.originalPrice?.toString() ?? null,
        plusPrice: scraped.plusPrice?.toString() ?? null,
        promotionTexts,
        extraDiscountPercent,
        extraDiscountLabel,
        imageUrl: scraped.imageUrl ?? product.imageUrl,
        inStock: scraped.inStock,
        nameZh: scraped.nameZh ?? product.nameZh,
        brand: scraped.brand ?? product.brand,
        category: scraped.category ?? product.category,
        // Scrape succeeded, so the product is back/listed again.
        status: "active",
        lastRefreshError: null,
        lastUpdated: new Date(),
      })
      .where(eq(productsTable.id, productId));

    await db.insert(priceHistoryTable).values({
      productId,
      price: newPrice.toString(),
      originalPrice: scraped.originalPrice?.toString() ?? null,
      plusPrice: scraped.plusPrice?.toString() ?? null,
      promotionTexts,
      extraDiscountPercent,
      extraDiscountLabel,
      inStock: scraped.inStock ?? true,
    });

    return { success: true, priceChange };
  } catch (err) {
    if (err instanceof ProductUnavailableError) {
      // The product has been removed from HKTVmall. Flag it and keep the
      // record (with its price history) — do not delete or overwrite prices.
      const message = "Product no longer available on HKTVmall";
      await recordRefreshFailure(productId, message, true);
      return { success: false, error: message, unavailable: true };
    }
    const message = String(err);
    await recordRefreshFailure(productId, message, false);
    return { success: false, error: message };
  }
}

export async function refreshAllProducts(): Promise<RefreshResult> {
  const products = await db.select().from(productsTable);
  let refreshed = 0;
  let failed = 0;
  let unavailable = 0;
  let priceDrops = 0;
  const errors: string[] = [];

  for (const product of products) {
    const result = await refreshProduct(product.id);
    if (result.success) {
      refreshed++;
      if ((result.priceChange ?? 0) < -0.001) priceDrops++;
    } else {
      failed++;
      if (result.unavailable) unavailable++;
      if (result.error) errors.push(`${product.name}: ${result.error}`);
    }
  }

  return { refreshed, failed, unavailable, priceDrops, errors };
}
