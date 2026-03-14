import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { productsTable, priceHistoryTable, alertsTable } from "@workspace/db";
import { eq, ilike, and } from "drizzle-orm";
import {
  GetProductsQueryParams,
  GetProductResponse,
  DeleteProductResponse,
  TrackProductBody,
  RefreshAllProductsResponse,
  RefreshProductResponse,
} from "@workspace/api-zod";
import { scrapeProductByUrl, searchHKTVMall } from "../lib/scraper.js";
import { refreshProduct, refreshAllProducts } from "../lib/refreshService.js";

const router: IRouter = Router();

function buildProductResponse(
  p: typeof productsTable.$inferSelect,
  alertMap: Map<number, number>,
  prevPriceMap?: Map<number, number>
) {
  const currentPrice = parseFloat(p.currentPrice);
  const alertPrice = alertMap.get(p.id) ?? null;
  const isBelowAlert = alertPrice !== null && currentPrice <= alertPrice;
  const prevPrice = prevPriceMap?.get(p.id);
  const priceChange = prevPrice !== undefined ? currentPrice - prevPrice : null;

  return {
    id: p.id,
    name: p.name,
    nameZh: p.nameZh ?? undefined,
    brand: p.brand ?? undefined,
    category: p.category ?? undefined,
    currentPrice,
    originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : undefined,
    currency: p.currency,
    imageUrl: p.imageUrl ?? undefined,
    productUrl: p.productUrl ?? undefined,
    sku: p.sku ?? undefined,
    inStock: p.inStock,
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

router.post("/track", async (req, res) => {
  try {
    const body = TrackProductBody.parse(req.body);
    const { productUrl, name: nameOverride, targetPrice } = body;

    const scraped = await scrapeProductByUrl(productUrl);

    const finalName = nameOverride || scraped?.name || productUrl;
    const currentPrice = scraped?.currentPrice;

    if (!currentPrice) {
      // Could not scrape price - still add it manually with price 0 as placeholder
      // But we need a price, so return an error
      res.status(400).json({
        error: "Could not fetch product details from that URL. The page may require JavaScript rendering. Try searching by name instead.",
      });
      return;
    }

    // Check if already tracked
    const existing = scraped?.sku
      ? await db.select().from(productsTable).where(eq(productsTable.sku, scraped.sku))
      : await db.select().from(productsTable).where(eq(productsTable.productUrl, productUrl));

    let productId: number;
    if (existing.length > 0) {
      productId = existing[0].id;
      await db
        .update(productsTable)
        .set({
          currentPrice: currentPrice.toString(),
          originalPrice: scraped?.originalPrice?.toString(),
          imageUrl: scraped?.imageUrl,
          inStock: scraped?.inStock ?? true,
          lastUpdated: new Date(),
        })
        .where(eq(productsTable.id, productId));
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
          currency: "HKD",
          imageUrl: scraped?.imageUrl,
          productUrl: productUrl,
          sku: scraped?.sku,
          inStock: scraped?.inStock ?? true,
          lastUpdated: new Date(),
        })
        .returning();
      productId = inserted.id;

      // Record initial price
      await db.insert(priceHistoryTable).values({
        productId,
        price: currentPrice.toString(),
      });
    }

    // Set alert if provided
    if (targetPrice !== undefined && targetPrice !== null) {
      const existingAlert = await db
        .select()
        .from(alertsTable)
        .where(eq(alertsTable.productId, productId));
      if (existingAlert.length > 0) {
        await db.delete(alertsTable).where(eq(alertsTable.productId, productId));
      }
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
    const response = RefreshAllProductsResponse.parse(result);
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/", async (req, res) => {
  try {
    const query = GetProductsQueryParams.parse(req.query);

    const conditions = [];
    if (query.search) {
      conditions.push(ilike(productsTable.name, `%${query.search}%`));
    }

    const products = await db
      .select()
      .from(productsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(productsTable.lastUpdated);

    const alerts = await db.select().from(alertsTable);
    const alertMap = new Map(alerts.map((a) => [a.productId, parseFloat(a.targetPrice)]));

    // Get previous price for each product (second to last in price_history)
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
      .map((p) => buildProductResponse(p, alertMap, prevPriceMap))
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

    const result = GetProductResponse.parse({
      ...buildProductResponse(p, alertMap),
      priceHistory: history.map((h) => ({
        id: h.id,
        price: parseFloat(h.price),
        recordedAt: h.recordedAt.toISOString(),
      })),
    });

    res.json(result);
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

    const response = RefreshProductResponse.parse(buildProductResponse(products[0], alertMap));
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(productsTable).where(eq(productsTable.id, id));
    const result = DeleteProductResponse.parse({ success: true, message: "Product removed from watchlist" });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
