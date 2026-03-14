import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { productTypesTable } from "@workspace/db";
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
