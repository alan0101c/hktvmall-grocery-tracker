import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { alertsTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateAlertBody,
  GetAlertsResponse,
  DeleteAlertResponse,
  GetTriggeredAlertsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/triggered", async (_req, res) => {
  try {
    const alerts = await db.select().from(alertsTable);
    const products = await db.select().from(productsTable);
    const productMap = new Map(products.map((p) => [p.id, p]));

    const triggered = alerts
      .map((a) => {
        const product = productMap.get(a.productId);
        if (!product) return null;
        const currentPrice = parseFloat(product.currentPrice);
        const targetPrice = parseFloat(a.targetPrice);
        if (currentPrice > targetPrice) return null;
        return {
          alertId: a.id,
          productId: product.id,
          productName: product.name,
          productUrl: product.productUrl ?? undefined,
          imageUrl: product.imageUrl ?? undefined,
          currentPrice,
          targetPrice,
          savings: targetPrice - currentPrice,
          currency: product.currency,
        };
      })
      .filter(Boolean);

    const result = GetTriggeredAlertsResponse.parse(triggered);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/", async (_req, res) => {
  try {
    const alerts = await db.select().from(alertsTable);
    const products = await db.select().from(productsTable);
    const productMap = new Map(products.map((p) => [p.id, p]));

    const result = GetAlertsResponse.parse(
      alerts.map((a) => {
        const product = productMap.get(a.productId);
        const currentPrice = product ? parseFloat(product.currentPrice) : 0;
        const targetPrice = parseFloat(a.targetPrice);
        return {
          id: a.id,
          productId: a.productId,
          productName: product?.name ?? "Unknown",
          targetPrice,
          currentPrice,
          isTriggered: currentPrice <= targetPrice,
          createdAt: a.createdAt.toISOString(),
        };
      })
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = CreateAlertBody.parse(req.body);

    const existing = await db
      .select()
      .from(alertsTable)
      .where(eq(alertsTable.productId, body.productId));

    if (existing.length > 0) {
      await db
        .delete(alertsTable)
        .where(eq(alertsTable.productId, body.productId));
    }

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
    const currentPrice = product ? parseFloat(product.currentPrice) : 0;
    const targetPrice = parseFloat(alert.targetPrice);

    res.status(201).json({
      id: alert.id,
      productId: alert.productId,
      productName: product?.name ?? "Unknown",
      targetPrice,
      currentPrice,
      isTriggered: currentPrice <= targetPrice,
      createdAt: alert.createdAt.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(alertsTable).where(eq(alertsTable.id, id));
    const result = DeleteAlertResponse.parse({ success: true, message: "Alert deleted" });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
