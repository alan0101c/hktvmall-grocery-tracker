import { Router, type IRouter } from "express";
import { db, productsTable, promotionRulesTable, type Product, type PromotionRule } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdatePromotionBody } from "@workspace/api-zod";
import { normalizePromotionLabel, productPromotionLabels, suggestPromotion } from "../lib/promotionRules.js";
import { discoverPromotionRules, loadPromotionRules } from "../lib/promotionService.js";

const router: IRouter = Router();

function buildPromotionResponse(rule: PromotionRule, products: Product[]) {
  const affectedProducts = products
    .filter((product) => productPromotionLabels(product).some(
      (label) => normalizePromotionLabel(label) === rule.normalizedLabel,
    ))
    .map((product) => ({ id: product.id, name: product.name, productUrl: product.productUrl }));

  return {
    id: rule.id,
    label: rule.label,
    normalizedLabel: rule.normalizedLabel,
    status: rule.status,
    discountPercent: rule.discountPercent == null ? null : Number(rule.discountPercent),
    application: rule.application,
    minimumQuantity: rule.minimumQuantity,
    assumption: rule.assumption,
    suggestion: suggestPromotion(rule.label),
    affectedProductCount: affectedProducts.length,
    affectedProducts,
    firstSeenAt: rule.firstSeenAt,
    lastSeenAt: rule.lastSeenAt,
    reviewedAt: rule.reviewedAt,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

router.get("/", async (_req, res) => {
  try {
    const products = await db.select().from(productsTable);
    await discoverPromotionRules(products.flatMap(productPromotionLabels));
    const rules = await loadPromotionRules();
    const statusOrder = new Map([["pending", 0], ["approved", 1], ["rejected", 2]]);
    const response = rules
      .map((rule) => buildPromotionResponse(rule, products))
      .sort((a, b) => (statusOrder.get(a.status) ?? 3) - (statusOrder.get(b.status) ?? 3) ||
        b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid promotion rule id" });
      return;
    }
    const parsed = UpdatePromotionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const body = parsed.data;
    let values = {
      discountPercent: null as string | null,
      application: "not_applicable",
      minimumQuantity: null as number | null,
      assumption: null as string | null,
    };

    if (body.status === "approved") {
      if (body.application !== "automatic" && body.application !== "conditional") {
        res.status(400).json({ error: "Approved rules must be automatic or conditional" });
        return;
      }
      if (body.discountPercent == null || body.discountPercent <= 0 || body.discountPercent >= 100) {
        res.status(400).json({ error: "Approved rules require a discount percent between 0 and 100" });
        return;
      }
      if (body.application === "conditional") {
        if (!Number.isInteger(body.minimumQuantity) || (body.minimumQuantity ?? 0) < 2 || !body.assumption?.trim()) {
          res.status(400).json({ error: "Conditional rules require a minimum quantity of at least 2 and an assumption" });
          return;
        }
      }
      values = {
        discountPercent: String(body.discountPercent),
        application: body.application,
        minimumQuantity: body.application === "conditional" ? body.minimumQuantity : null,
        assumption: body.application === "conditional" ? body.assumption!.trim() : null,
      };
    }

    const now = new Date();
    const updated = await db.update(promotionRulesTable).set({
      status: body.status,
      ...values,
      reviewedAt: body.status === "pending" ? null : now,
      updatedAt: now,
    }).where(eq(promotionRulesTable.id, id)).returning();

    if (updated.length === 0) {
      res.status(404).json({ error: "Promotion rule not found" });
      return;
    }
    const products = await db.select().from(productsTable);
    res.json(buildPromotionResponse(updated[0], products));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
