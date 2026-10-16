import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { productsTable, priceHistoryTable, alertsTable, productTypesTable } from "@workspace/db";
import { eq, ilike, and, or } from "drizzle-orm";
import { GetProductsQueryParams, TrackProductBody } from "@workspace/api-zod";
import { scrapeProductByUrl, searchHKTVMall, ProductUnavailableError } from "../lib/scraper.js";
import { refreshProduct, refreshAllProducts } from "../lib/refreshService.js";
import { getGlobalDiscountPercent, applyDiscount } from "../lib/settings.js";

const router: IRouter = Router();

function buildProductResponse(
  p: typeof productsTable.$inferSelect,
  alertMap: Map<number, number>,
  prevPriceMap?: Map<number, number>,
  typesMap?: Map<number, { name: string; unitLabel: string }>,
  globalDiscountPercent = 0
) {
  const currentPrice = parseFloat(p.currentPrice);
  const adjustedPrice = applyDiscount(currentPrice, globalDiscountPercent);
  const alertPrice = alertMap.get(p.id) ?? null;
  const isBelowAlert = alertPrice !== null && adjustedPrice <= alertPrice;
  const prevPrice = prevPriceMap?.get(p.id);
  const priceChange = prevPrice !== undefined ? currentPrice - prevPrice : null;

  const packageQuantity = p.packageQuantity ? parseFloat(p.packageQuantity) : null;
  const itemCount = p.itemCount ?? null;

  let pricePerUnit: number | null = null;
  if (itemCount !== null && itemCount > 0 && packageQuantity && packageQuantity > 0) {
    pricePerUnit = Math.round((adjustedPrice / itemCount) * 10000) / 10000;
  } else if (packageQuantity && packageQuantity > 0) {
    pricePerUnit = Math.round((adjustedPrice / packageQuantity) * 10000) / 10000;
  }

  const promotionTexts: string[] = p.promotionTexts ?? [];

  return {
    id: p.id,
    name: p.name,
    nameZh: p.nameZh ?? undefined,
    brand: p.brand ?? undefined,
    category: p.category ?? undefined,
    currentPrice,
    adjustedPrice,
    globalDiscountPercent,
    originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : undefined,
    plusPrice: p.plusPrice ? parseFloat(p.plusPrice) : null,
    promotionTexts,
    currency: p.currency,
    imageUrl: p.imageUrl ?? undefined,
    productUrl: p.productUrl ?? undefined,
    sku: p.sku ?? undefined,
    inStock: p.inStock,
    productTypeId: p.productTypeId ?? null,
    productTypeName: (p.productTypeId && typesMap?.get(p.productTypeId)?.name) || undefined,
    packageQuantity,
    // Canonical unit comes from the category; uncategorised products fall back
    // to the unit their quantity was recorded in.
    packageUnit: (p.productTypeId && typesMap?.get(p.productTypeId)?.unitLabel) || p.packageUnit || null,
    itemCount,
    pricePerUnit,
    status: p.status,
    lastRefreshError: p.lastRefreshError ?? null,
    lastUpdated: p.lastUpdated,
    alertPrice,
    isBelowAlert,
    priceChange,
  };
}

router.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.status(400).json({ error: "Search query is required" });
      return;
    }

    const results = await searchHKTVMall(q);

    const trackedProducts = await db.select().from(productsTable);
    const trackedUrls = new Set(trackedProducts.map((p) => p.productUrl));
    const trackedSkus = new Set(trackedProducts.map((p) => p.sku).filter(Boolean));

    const response = results.map((r) => ({
      name: r.name,
      nameZh: r.nameZh,
      brand: r.brand,
      currentPrice: r.currentPrice,
      originalPrice: r.originalPrice,
      currency: r.currency,
      imageUrl: r.imageUrl,
      productUrl: r.productUrl,
      sku: r.sku,
      isTracked: trackedUrls.has(r.productUrl) || (r.sku ? trackedSkus.has(r.sku) : false),
    }));

    res.json(response);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Resolve the unit to store when a product is (re)assigned to a category.
 * The category owns the canonical unit. Comparison is case-insensitive and the
 * category's unitLabel is stored as-is.
 *
 * - No category: the recorded unit (if any) is kept as-is.
 * - Recorded unit matches (case-insensitively) or is absent: adopt the category's unit.
 * - Implicit mismatch (the unit came from the product's existing row): the move is
 *   allowed but the quantity is QUARANTINED — it was expressed in the old unit, so
 *   the caller must null it out and let the user re-enter it in the new unit.
 * - Explicit mismatch (the request itself supplied the unit): rejected, since the
 *   caller clearly intended that unit and picked the wrong category.
 */
async function resolveUnitForAssignment(
  productTypeId: number | null | undefined,
  recordedUnit: string | null | undefined,
  explicit: boolean
): Promise<{ error?: string; unit?: string | null; quarantine?: boolean }> {
  const unit = recordedUnit?.trim() || null;
  if (productTypeId == null) return { unit };
  const types = await db.select().from(productTypesTable).where(eq(productTypesTable.id, productTypeId));
  if (!types.length) return { error: "Product type not found" };
  const type = types[0];
  if (unit && unit.toLowerCase() !== type.unitLabel.trim().toLowerCase()) {
    if (explicit) {
      return {
        error: `Unit mismatch: "${type.name}" is measured in ${type.unitLabel}, but the quantity you entered is in ${unit}.`,
      };
    }
    return { unit: type.unitLabel, quarantine: true };
  }
  return { unit: type.unitLabel };
}

router.post("/track", async (req, res) => {
  try {
    const body = TrackProductBody.parse(req.body);
    const { productUrl, name: nameOverride, targetPrice, productTypeId, packageQuantity } = body;

    // The unit is adopted from the category (if any) — it is never set here.
    // Validate before scraping so an unknown category fails fast.
    const assigned = await resolveUnitForAssignment(productTypeId, null, false);
    if (assigned.error) {
      res.status(400).json({ error: assigned.error });
      return;
    }

    const scraped = await scrapeProductByUrl(productUrl);

    const finalName = nameOverride || scraped?.name || productUrl;
    const currentPrice = scraped?.currentPrice;

    if (!currentPrice) {
      res.status(400).json({
        error: "Could not fetch product details from that URL. The page may require JavaScript rendering. Try searching by name instead.",
      });
      return;
    }

    // Check if already tracked
    const existing = scraped?.sku
      ? await db.select().from(productsTable).where(eq(productsTable.sku, scraped.sku))
      : await db.select().from(productsTable).where(eq(productsTable.productUrl, productUrl));

    const scrapedPromotionTexts = scraped?.promotionTexts && scraped.promotionTexts.length > 0 ? scraped.promotionTexts : null;

    let productId: number;
    if (existing.length > 0) {
      productId = existing[0].id;
      // A re-track of an existing product validates against the unit it already
      // has; a category switch to a different unit quarantines the quantity.
      const existingAssigned = await resolveUnitForAssignment(
        productTypeId,
        existing[0].packageUnit,
        false
      );
      if (existingAssigned.error) {
        res.status(400).json({ error: existingAssigned.error });
        return;
      }
      await db
        .update(productsTable)
        .set({
          // Same as refresh: adopt the latest parsed attributes (a user's
          // explicit name override wins), no history kept for them.
          name: nameOverride || scraped?.name || existing[0].name,
          nameZh: scraped?.nameZh ?? existing[0].nameZh,
          brand: scraped?.brand ?? existing[0].brand,
          category: scraped?.category ?? existing[0].category,
          currentPrice: currentPrice.toString(),
          originalPrice: scraped?.originalPrice?.toString() ?? null,
          plusPrice: scraped?.plusPrice?.toString() ?? null,
          promotionTexts: scrapedPromotionTexts,
          imageUrl: scraped?.imageUrl,
          inStock: scraped?.inStock ?? true,
          lastUpdated: new Date(),
          ...(productTypeId !== undefined && { productTypeId }),
          ...(packageQuantity !== undefined && { packageQuantity: packageQuantity?.toString() }),
          ...(existingAssigned.quarantine && { packageQuantity: null }),
          ...(productTypeId !== undefined && { packageUnit: existingAssigned.unit }),
        })
        .where(eq(productsTable.id, productId));

      await db.insert(priceHistoryTable).values({
        productId,
        price: currentPrice.toString(),
        originalPrice: scraped?.originalPrice?.toString() ?? null,
        plusPrice: scraped?.plusPrice?.toString() ?? null,
        promotionTexts: scrapedPromotionTexts,
        inStock: scraped?.inStock ?? true,
      });
    } else {
      const [inserted] = await db
        .insert(productsTable)
        .values({
          name: finalName,
          nameZh: scraped?.nameZh,
          brand: scraped?.brand,
          category: scraped?.category ?? "Supermarket",
          currentPrice: currentPrice.toString(),
          originalPrice: scraped?.originalPrice?.toString(),
          plusPrice: scraped?.plusPrice?.toString() ?? null,
          promotionTexts: scrapedPromotionTexts,
          currency: "HKD",
          imageUrl: scraped?.imageUrl,
          productUrl: productUrl,
          sku: scraped?.sku,
          inStock: scraped?.inStock ?? true,
          lastUpdated: new Date(),
          productTypeId: productTypeId ?? null,
          packageQuantity: packageQuantity?.toString() ?? null,
          packageUnit: assigned.unit,
        })
        .returning();
      productId = inserted.id;

      await db.insert(priceHistoryTable).values({
        productId,
        price: currentPrice.toString(),
        originalPrice: scraped?.originalPrice?.toString() ?? null,
        plusPrice: scraped?.plusPrice?.toString() ?? null,
        promotionTexts: scrapedPromotionTexts,
        inStock: scraped?.inStock ?? true,
      });
    }

    if (targetPrice !== undefined && targetPrice !== null) {
      await db.delete(alertsTable).where(eq(alertsTable.productId, productId));
      await db.insert(alertsTable).values({
        productId,
        targetPrice: targetPrice.toString(),
      });
    }

    const products = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    const alerts = await db.select().from(alertsTable);
    const alertMap = new Map(alerts.map((a) => [a.productId, parseFloat(a.targetPrice)]));
    const allTypes = await db.select().from(productTypesTable);
    const typesMap = new Map(allTypes.map((t) => [t.id, { name: t.name, unitLabel: t.unitLabel }]));
    const globalDiscountPercent = await getGlobalDiscountPercent();

    res.status(201).json(buildProductResponse(products[0], alertMap, undefined, typesMap, globalDiscountPercent));
  } catch (err) {
    if (err instanceof ProductUnavailableError) {
      res.status(400).json({ error: "This product is no longer available on HKTVmall." });
      return;
    }
    res.status(500).json({ error: String(err) });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const result = await refreshAllProducts();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/", async (req, res) => {
  try {
    const query = GetProductsQueryParams.parse(req.query);

    const allTypes = await db.select().from(productTypesTable);
    const typesMap = new Map(allTypes.map((t) => [t.id, { name: t.name, unitLabel: t.unitLabel }]));

    const conditions = [];
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(productsTable.name, pattern),
          ilike(productTypesTable.name, pattern)
        )!
      );
    }

    const rows = await db
      .select({ product: productsTable })
      .from(productsTable)
      .leftJoin(productTypesTable, eq(productsTable.productTypeId, productTypesTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(productsTable.lastUpdated);

    const products = rows.map((r) => r.product);

    const alerts = await db.select().from(alertsTable);
    const alertMap = new Map(alerts.map((a) => [a.productId, parseFloat(a.targetPrice)]));

    const prevPriceMap = new Map<number, number>();
    for (const p of products) {
      const history = await db
        .select()
        .from(priceHistoryTable)
        .where(eq(priceHistoryTable.productId, p.id))
        .orderBy(priceHistoryTable.recordedAt);
      if (history.length >= 2) {
        prevPriceMap.set(p.id, parseFloat(history[history.length - 2].price));
      }
    }

    const globalDiscountPercent = await getGlobalDiscountPercent();

    const result = products
      .map((p) => buildProductResponse(p, alertMap, prevPriceMap, typesMap, globalDiscountPercent))
      .filter((p) => {
        if (query.belowAlert) return p.isBelowAlert;
        return true;
      });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const products = await db.select().from(productsTable).where(eq(productsTable.id, id));

    if (!products.length) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const p = products[0];
    const history = await db
      .select()
      .from(priceHistoryTable)
      .where(eq(priceHistoryTable.productId, id))
      .orderBy(priceHistoryTable.recordedAt);

    const alerts = await db.select().from(alertsTable).where(eq(alertsTable.productId, id));
    const alertMap = new Map(alerts.map((a) => [a.productId, parseFloat(a.targetPrice)]));

    const allTypes = await db.select().from(productTypesTable);
    const typesMap = new Map(allTypes.map((t) => [t.id, { name: t.name, unitLabel: t.unitLabel }]));
    const globalDiscountPercent = await getGlobalDiscountPercent();

    res.json({
      ...buildProductResponse(p, alertMap, undefined, typesMap, globalDiscountPercent),
      priceHistory: history.map((h) => ({
        id: h.id,
        price: parseFloat(h.price),
        originalPrice: h.originalPrice ? parseFloat(h.originalPrice) : undefined,
        plusPrice: h.plusPrice ? parseFloat(h.plusPrice) : null,
        promotionTexts: h.promotionTexts ?? [],
        inStock: h.inStock,
        recordedAt: h.recordedAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/:id/refresh", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await refreshProduct(id);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    const products = await db.select().from(productsTable).where(eq(productsTable.id, id));
    const alerts = await db.select().from(alertsTable);
    const alertMap = new Map(alerts.map((a) => [a.productId, parseFloat(a.targetPrice)]));
    const allTypes = await db.select().from(productTypesTable);
    const typesMap = new Map(allTypes.map((t) => [t.id, { name: t.name, unitLabel: t.unitLabel }]));
    const globalDiscountPercent = await getGlobalDiscountPercent();

    res.json(buildProductResponse(products[0], alertMap, undefined, typesMap, globalDiscountPercent));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put("/:id/unit", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    // The unit is owned by the category and cannot be written here — it is
    // adopted at assignment time. The only unit-related behavior left on this
    // endpoint: moving to a category with a different unit quarantines the
    // quantity (it was expressed in the old unit) so no wrong per-unit price
    // is ever shown; the user re-enters it in the new unit.
    const { productTypeId, packageQuantity, itemCount } = req.body;

    const existing = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!existing.length) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const assigned = await resolveUnitForAssignment(productTypeId, existing[0].packageUnit, false);
    if (assigned.error) {
      res.status(400).json({ error: assigned.error });
      return;
    }

    await db
      .update(productsTable)
      .set({
        productTypeId: productTypeId ?? null,
        packageQuantity: assigned.quarantine ? null : packageQuantity != null ? String(packageQuantity) : null,
        packageUnit: assigned.unit,
        itemCount: itemCount != null ? Number(itemCount) : null,
      })
      .where(eq(productsTable.id, id));

    const products = await db.select().from(productsTable).where(eq(productsTable.id, id));
    const alerts = await db.select().from(alertsTable);
    const alertMap = new Map(alerts.map((a) => [a.productId, parseFloat(a.targetPrice)]));
    const allTypes = await db.select().from(productTypesTable);
    const typesMap = new Map(allTypes.map((t) => [t.id, { name: t.name, unitLabel: t.unitLabel }]));
    const globalDiscountPercent = await getGlobalDiscountPercent();

    res.json(buildProductResponse(products[0], alertMap, undefined, typesMap, globalDiscountPercent));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(productsTable).where(eq(productsTable.id, id));
    res.json({ success: true, message: "Product removed from watchlist" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
