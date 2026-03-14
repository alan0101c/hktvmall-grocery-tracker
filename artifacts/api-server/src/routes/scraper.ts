import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { productsTable, priceHistoryTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { ScrapeProductsBody, ScrapeProductsResponse, GetCategoriesResponse } from "@workspace/api-zod";
import { scrapeHKTVMall } from "../lib/scraper.js";

const router: IRouter = Router();

router.post("/scrape", async (req, res) => {
  try {
    const body = ScrapeProductsBody.parse(req.body);
    const categoryUrl = body.categoryUrl || "/hktv/zh/supermarket";
    const maxPages = body.maxPages ?? 2;

    const { products, errors } = await scrapeHKTVMall(categoryUrl, maxPages);

    let productsAdded = 0;
    let productsUpdated = 0;

    for (const p of products) {
      const existing = p.sku
        ? await db
            .select()
            .from(productsTable)
            .where(eq(productsTable.sku, p.sku))
        : await db
            .select()
            .from(productsTable)
            .where(eq(productsTable.name, p.name));

      if (existing.length > 0) {
        const existingProduct = existing[0];
        const oldPrice = parseFloat(existingProduct.currentPrice);
        const newPrice = p.currentPrice;

        await db
          .update(productsTable)
          .set({
            currentPrice: p.currentPrice.toString(),
            originalPrice: p.originalPrice?.toString(),
            imageUrl: p.imageUrl,
            inStock: p.inStock,
            lastUpdated: new Date(),
          })
          .where(eq(productsTable.id, existingProduct.id));

        if (oldPrice !== newPrice) {
          await db.insert(priceHistoryTable).values({
            productId: existingProduct.id,
            price: newPrice.toString(),
          });
        }

        productsUpdated++;
      } else {
        const [inserted] = await db
          .insert(productsTable)
          .values({
            name: p.name,
            nameZh: p.nameZh,
            brand: p.brand,
            category: p.category,
            currentPrice: p.currentPrice.toString(),
            originalPrice: p.originalPrice?.toString(),
            currency: p.currency,
            imageUrl: p.imageUrl,
            productUrl: p.productUrl,
            sku: p.sku,
            inStock: p.inStock,
            lastUpdated: new Date(),
          })
          .returning();

        await db.insert(priceHistoryTable).values({
          productId: inserted.id,
          price: p.currentPrice.toString(),
        });

        productsAdded++;
      }
    }

    const result = ScrapeProductsResponse.parse({
      productsFound: products.length,
      productsAdded,
      productsUpdated,
      errors,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/categories", async (_req, res) => {
  try {
    const result = await db
      .selectDistinct({ category: productsTable.category })
      .from(productsTable)
      .where(sql`${productsTable.category} IS NOT NULL`);

    const categories = GetCategoriesResponse.parse(
      result.map((r) => r.category).filter(Boolean)
    );

    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
