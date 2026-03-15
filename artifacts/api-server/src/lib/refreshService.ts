import { db } from "@workspace/db";
import { productsTable, priceHistoryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { scrapeProductByUrl } from "./scraper.js";

export interface RefreshResult {
  refreshed: number;
  failed: number;
  priceDrops: number;
  errors: string[];
}

export async function refreshProduct(productId: number): Promise<{ success: boolean; priceChange?: number; error?: string }> {
  const products = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId));

  if (!products.length) return { success: false, error: "Product not found" };
  const product = products[0];

  if (!product.productUrl) return { success: false, error: "No URL for product" };

  try {
    const scraped = await scrapeProductByUrl(product.productUrl);
    if (!scraped) return { success: false, error: "Could not parse product page" };

    const oldPrice = parseFloat(product.currentPrice);
    const newPrice = scraped.currentPrice;
    const priceChange = newPrice - oldPrice;

    const promotionTexts = scraped.promotionTexts.length > 0 ? scraped.promotionTexts : null;

    await db
      .update(productsTable)
      .set({
        currentPrice: newPrice.toString(),
        originalPrice: scraped.originalPrice?.toString() ?? null,
        plusPrice: scraped.plusPrice?.toString() ?? null,
        promotionText: scraped.promotionText ?? null,
        promotionTexts,
        imageUrl: scraped.imageUrl ?? product.imageUrl,
        inStock: scraped.inStock,
        nameZh: scraped.nameZh ?? product.nameZh,
        brand: scraped.brand ?? product.brand,
        lastUpdated: new Date(),
      })
      .where(eq(productsTable.id, productId));

    await db.insert(priceHistoryTable).values({
      productId,
      price: newPrice.toString(),
      originalPrice: scraped.originalPrice?.toString() ?? null,
      plusPrice: scraped.plusPrice?.toString() ?? null,
      promotionText: scraped.promotionText ?? null,
      promotionTexts,
    });

    return { success: true, priceChange };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function refreshAllProducts(): Promise<RefreshResult> {
  const products = await db.select().from(productsTable);
  let refreshed = 0;
  let failed = 0;
  let priceDrops = 0;
  const errors: string[] = [];

  for (const product of products) {
    const result = await refreshProduct(product.id);
    if (result.success) {
      refreshed++;
      if ((result.priceChange ?? 0) < -0.001) priceDrops++;
    } else {
      failed++;
      if (result.error) errors.push(`${product.name}: ${result.error}`);
    }
  }

  return { refreshed, failed, priceDrops, errors };
}
