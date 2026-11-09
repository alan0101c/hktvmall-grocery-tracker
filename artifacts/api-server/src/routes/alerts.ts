import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { alertsTable, productsTable, type Product } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateAlertBody } from "@workspace/api-zod";
import { applyDiscount } from "../lib/settings.js";
import {
  productPromotionLabels,
  resolveApprovedPromotion,
  type PromotionRuleLike,
} from "../lib/promotionRules.js";
import { loadPromotionRules } from "../lib/promotionService.js";

const router: IRouter = Router();

function alertPricing(product: Product, promotionRules: PromotionRuleLike[]) {
  const currentPrice = parseFloat(product.currentPrice);
  const appliedPromotion = resolveApprovedPromotion(productPromotionLabels(product), promotionRules);
  return {
    currentPrice,
    appliedPromotion,
    adjustedPrice: applyDiscount(currentPrice, appliedPromotion?.discountPercent ?? 0),
  };
}

router.get("/triggered", async (_req, res) => {
  try {
    const alerts = await db.select().from(alertsTable);
    const products = await db.select().from(productsTable);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const promotionRules = await loadPromotionRules();

    const triggered = alerts
      .map((a) => {
        const product = productMap.get(a.productId);
        if (!product) return null;
        const { currentPrice, adjustedPrice, appliedPromotion } = alertPricing(product, promotionRules);
        const targetPrice = parseFloat(a.targetPrice);
        if (adjustedPrice > targetPrice) return null;
        return {
          alertId: a.id,
          productId: product.id,
          productName: product.name,
          productUrl: product.productUrl ?? undefined,
          imageUrl: product.imageUrl ?? undefined,
          currentPrice,
          adjustedPrice,
          appliedPromotion,
          extraDiscountPercent: appliedPromotion?.discountPercent ?? null,
          targetPrice,
          savings: Math.round((targetPrice - adjustedPrice) * 100) / 100,
          currency: product.currency,
        };
      })
      .filter(Boolean);

    res.json(triggered);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/", async (_req, res) => {
  try {
    const alerts = await db.select().from(alertsTable);
    const products = await db.select().from(productsTable);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const promotionRules = await loadPromotionRules();

    const result = alerts.map((a) => {
      const product = productMap.get(a.productId);
      const { currentPrice, adjustedPrice, appliedPromotion } = product
        ? alertPricing(product, promotionRules)
        : { currentPrice: 0, adjustedPrice: 0, appliedPromotion: null };
      const targetPrice = parseFloat(a.targetPrice);
      return {
        id: a.id,
        productId: a.productId,
        productName: product?.name ?? "Unknown",
        targetPrice,
        currentPrice,
        adjustedPrice,
        appliedPromotion,
        isTriggered: adjustedPrice <= targetPrice,
        createdAt: a.createdAt,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = CreateAlertBody.parse(req.body);

    await db.delete(alertsTable).where(eq(alertsTable.productId, body.productId));

    const [alert] = await db
      .insert(alertsTable)
      .values({
        productId: body.productId,
        targetPrice: body.targetPrice.toString(),
      })
      .returning();

    const products = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, body.productId));
    const product = products[0];
    const { currentPrice, adjustedPrice, appliedPromotion } = product
      ? alertPricing(product, await loadPromotionRules())
      : { currentPrice: 0, adjustedPrice: 0, appliedPromotion: null };
    const targetPrice = parseFloat(alert.targetPrice);

    res.status(201).json({
      id: alert.id,
      productId: alert.productId,
      productName: product?.name ?? "Unknown",
      targetPrice,
      currentPrice,
      adjustedPrice,
      appliedPromotion,
      isTriggered: adjustedPrice <= targetPrice,
      createdAt: alert.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(alertsTable).where(eq(alertsTable.id, id));
    res.json({ success: true, message: "Alert deleted" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
