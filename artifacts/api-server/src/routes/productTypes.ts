import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { productTypesTable, productsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router: IRouter = Router();

/** Canonical form for a unit label: trimmed, lowercase. Comparison is always case-insensitive. */
function canonicalUnit(unit: string): string {
  return unit.trim().toLowerCase();
}

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
      .values({ name: String(name).trim(), unitLabel: canonicalUnit(String(unitLabel)) })
      .returning();
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, unitLabel, listings } = req.body;
    if (!name && !unitLabel && !listings) {
      res.status(400).json({ error: "At least one of name, unitLabel or listings is required" });
      return;
    }

    const existing = await db.select().from(productTypesTable).where(eq(productTypesTable.id, id));
    if (!existing.length) {
      res.status(404).json({ error: "Product type not found" });
      return;
    }
    const current = existing[0];

    const typeUpdates: Record<string, string> = {};
    if (name) typeUpdates.name = String(name).trim();
    const newUnit = unitLabel ? canonicalUnit(String(unitLabel)) : current.unitLabel;
    const unitChanged = newUnit !== canonicalUnit(current.unitLabel);
    if (unitLabel) typeUpdates.unitLabel = newUnit;

    // Normalise and validate the listing quantity updates.
    const normalizedListings: { productId: number; packageQuantity: string | null; itemCount: number | null }[] = [];
    if (listings !== undefined) {
      if (!Array.isArray(listings)) {
        res.status(400).json({ error: "listings must be an array of { productId, packageQuantity, itemCount }" });
        return;
      }
      for (const l of listings) {
        const pid = Number(l?.productId);
        if (!Number.isInteger(pid)) {
          res.status(400).json({ error: "Each listing needs a numeric productId" });
          return;
        }
        const qty = l.packageQuantity != null ? Number(l.packageQuantity) : null;
        if (qty !== null && (isNaN(qty) || qty <= 0)) {
          res.status(400).json({ error: `Listing ${pid}: packageQuantity must be a positive number or null` });
          return;
        }
        const cnt = l.itemCount != null ? Number(l.itemCount) : null;
        if (cnt !== null && (!Number.isInteger(cnt) || cnt <= 0)) {
          res.status(400).json({ error: `Listing ${pid}: itemCount must be a positive integer or null` });
          return;
        }
        normalizedListings.push({
          productId: pid,
          packageQuantity: qty !== null ? String(qty) : null,
          itemCount: cnt,
        });
      }
      // Every listed product must belong to this category.
      const listedIds = normalizedListings.map((l) => l.productId);
      const rows = await db
        .select({ id: productsTable.id, productTypeId: productsTable.productTypeId })
        .from(productsTable)
        .where(inArray(productsTable.id, listedIds));
      const belonging = new Set(rows.filter((r) => r.productTypeId === id).map((r) => r.id));
      const outsiders = listedIds.filter((pid) => !belonging.has(pid));
      if (outsiders.length > 0) {
        res.status(400).json({ error: `Products [${outsiders.join(", ")}] do not belong to this category` });
        return;
      }
    }

    // Changing the unit redefines what every member quantity means — the caller
    // must submit the reviewed listings in the same request so the two never
    // diverge. (A case-only "change" normalises to the same unit and is exempt.)
    if (unitChanged && listings === undefined) {
      res.status(400).json({
        error: "Changing the unit requires re-submitting the category's listings (quantities reviewed in the new unit).",
      });
      return;
    }

    await db.transaction(async (tx) => {
      await tx.update(productTypesTable).set(typeUpdates).where(eq(productTypesTable.id, id));
      if (unitChanged) {
        // Adopt the new unit on every member product; quantities come from the
        // reviewed listings submitted with this request.
        await tx.update(productsTable).set({ packageUnit: newUnit }).where(eq(productsTable.productTypeId, id));
      }
      for (const l of normalizedListings) {
        await tx
          .update(productsTable)
          .set({ packageQuantity: l.packageQuantity, itemCount: l.itemCount })
          .where(eq(productsTable.id, l.productId));
      }
    });

    const [updated] = await db.select().from(productTypesTable).where(eq(productTypesTable.id, id));
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
