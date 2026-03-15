import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { productsTable, priceHistoryTable, alertsTable, productTypesTable } from "@workspace/db";
import { eq, ilike, and, or } from "drizzle-orm";
import { GetProductsQueryParams, TrackProductBody } from "@workspace/api-zod";
import { scrapeProductByUrl, searchHKTVMall } from "../lib/scraper.js";
import { refreshProduct, refreshAllProducts } from "../lib/refreshService.js";

const router: IRouter = Router();

function buildProductResponse(
  p: typeof productsTable.$inferSelect,
  alertMap: Map<number, number>,
  prevPriceMap?: Map<number, number>,
  typeNameMap?: Map<number, string>
) {
  const currentPrice = parseFloat(p.currentPrice);
  const cheapestPrice = Math.min(currentPrice, p.plusPrice ?? Infinity)
  const alertPrice = alertMap.get(p.id) ?? null;
  const isBelowAlert = alertPrice !== null && cheapestPrice <= alertPrice;
  const prevPrice = prevPriceMap?.get(p.id);
  const priceChange = prevPrice !== undefined ? cheapestPrice - prevPrice : null;

  const packageQuantity = p.packageQuantity ? parseFloat(p.packageQuantity) : null;
  const itemCount = p.itemCount ?? null;

  let pricePerUnit: number | null = null;
  if (itemCount !== null && itemCount > 0 && packageQuantity && packageQuantity > 0) {
    pricePerUnit = Math.round((cheapestPrice / itemCount) * 10000) / 10000;
  } else if (packageQuantity && packageQuantity > 0) {
    pricePerUnit = Math.round((cheapestPrice / packageQuantity) * 10000) / 10000;
  }

  const promotionTexts: string[] = p.promotionTexts ?? (p.promotionText ? [p.promotionText] : []);

  return {
    id: p.id,
    name: p.name,
    nameZh: p.nameZh ?? undefined,
    brand: p.brand ?? undefined,
    category: p.category ?? undefined,
    cheapestPrice,  // Note: this is calculated, not from DB
    currentPrice,
    originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : undefined,
    plusPrice: p.plusPrice ? parseFloat(p.plusPrice) : null,
    promotionText: p.promotionText ?? undefined,
    promotionTexts,
    currency: p.currency,
    imageUrl: p.imageUrl ?? undefined,
    productUrl: p.productUrl ?? undefined,
    sku: p.sku ?? undefined,
    inStock: p.inStock,
    productTypeId: p.productTypeId ?? null,
    productTypeName: (p.productTypeId && typeNameMap?.get(p.productTypeId)) || undefined,
    packageQuantity,
    packageUnit: p.packageUnit ?? null,
    itemCount,
    pricePerUnit,  // This is calculated in the route
    lastUpdated: p.lastUpdated,
    alertPrice,
    isBelowAlert,
    priceChange,  // This is calculated from price history
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

router.post("/track", async (req, res) => {
  try {
    const body = TrackProductBody.parse(req.body);
    const { productUrl, name: nameOverride, targetPrice, productTypeId, packageQuantity, packageUnit } = body;

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
      await db
        .update(productsTable)
        .set({
          currentPrice: currentPrice.toString(),
          originalPrice: scraped?.originalPrice?.toString() ?? null,
          plusPrice: scraped?.plusPrice?.toString() ?? null,
          promotionText: scraped?.promotionText ?? null,
          promotionTexts: scrapedPromotionTexts,
          imageUrl: scraped?.imageUrl,
          inStock: scraped?.inStock ?? true,
          lastUpdated: new Date(),
          ...(productTypeId !== undefined && { productTypeId }),
          ...(packageQuantity !== undefined && { packageQuantity: packageQuantity?.toString() }),
          ...(packageUnit !== undefined && { packageUnit }),
        })
        .where(eq(productsTable.id, productId));

      await db.insert(priceHistoryTable).values({
        productId,
        price: currentPrice.toString(),
        originalPrice: scraped?.originalPrice?.toString() ?? null,
        plusPrice: scraped?.plusPrice?.toString() ?? null,
        promotionText: scraped?.promotionText ?? null,
        promotionTexts: scrapedPromotionTexts,
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
          promotionText: scraped?.promotionText ?? null,
          promotionTexts: scrapedPromotionTexts,
          currency: "HKD",
          imageUrl: scraped?.imageUrl,
          productUrl: productUrl,
          sku: scraped?.sku,
          inStock: scraped?.inStock ?? true,
          lastUpdated: new Date(),
          productTypeId: productTypeId ?? null,
          packageQuantity: packageQuantity?.toString() ?? null,
          packageUnit: packageUnit ?? null,
        })
        .returning();
      productId = inserted.id;

      await db.insert(priceHistoryTable).values({
        productId,
        price: currentPrice.toString(),
        originalPrice: scraped?.originalPrice?.toString() ?? null,
        plusPrice: scraped?.plusPrice?.toString() ?? null,
        promotionText: scraped?.promotionText ?? null,
        promotionTexts: scrapedPromotionTexts,
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

    res.status(201).json(buildProductResponse(products[0], alertMap));
  } catch (err) {
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
    const typeNameMap = new Map(allTypes.map((t) => [t.id, t.name]));

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

    const result = products
      .map((p) => buildProductResponse(p, alertMap, prevPriceMap, typeNameMap))
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
    const typeNameMap = new Map(allTypes.map((t) => [t.id, t.name]));

    res.json({
      ...buildProductResponse(p, alertMap, undefined, typeNameMap),
      priceHistory: history.map((h) => ({
        id: h.id,
        price: parseFloat(h.price),
        originalPrice: h.originalPrice ? parseFloat(h.originalPrice) : undefined,
        plusPrice: h.plusPrice ? parseFloat(h.plusPrice) : null,
        promotionText: h.promotionText ?? undefined,
        promotionTexts: h.promotionTexts ?? (h.promotionText ? [h.promotionText] : []),
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

    res.json(buildProductResponse(products[0], alertMap));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put("/:id/unit", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { productTypeId, packageQuantity, packageUnit, itemCount } = req.body;

    await db
      .update(productsTable)
      .set({
        productTypeId: productTypeId ?? null,
        packageQuantity: packageQuantity != null ? String(packageQuantity) : null,
        packageUnit: packageUnit ?? null,
        itemCount: itemCount != null ? Number(itemCount) : null,
      })
      .where(eq(productsTable.id, id));

    const products = await db.select().from(productsTable).where(eq(productsTable.id, id));
    if (!products.length) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const alerts = await db.select().from(alertsTable);
    const alertMap = new Map(alerts.map((a) => [a.productId, parseFloat(a.targetPrice)]));

    res.json(buildProductResponse(products[0], alertMap));
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
