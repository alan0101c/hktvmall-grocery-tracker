import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { productTypesTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  try {
    const types = await db
      .select()
      .from(productTypesTable)
      .orderBy(productTypesTable.name);
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, unitLabel } = req.body;
    if (!name || !unitLabel) {
      res.status(400).json({ error: "name and unitLabel are required" });
      return;
    }
    const [created] = await db
      .insert(productTypesTable)
      .values({ name: String(name).trim(), unitLabel: String(unitLabel).trim() })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, unitLabel } = req.body;
    if (!name && !unitLabel) {
      res.status(400).json({ error: "At least one of name or unitLabel is required" });
      return;
    }
    const typeUpdates: Record<string, string> = {};
    if (name) typeUpdates.name = String(name).trim();
    if (unitLabel) typeUpdates.unitLabel = String(unitLabel).trim();

    const [updated] = await db
      .update(productTypesTable)
      .set(typeUpdates)
      .where(eq(productTypesTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Product type not found" });
      return;
    }

    if (unitLabel) {
      await db
        .update(productsTable)
        .set({ packageUnit: String(unitLabel).trim() })
        .where(eq(productsTable.productTypeId, id));
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(productTypesTable).where(eq(productTypesTable.id, id));
    res.json({ success: true, message: "Product type deleted" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
