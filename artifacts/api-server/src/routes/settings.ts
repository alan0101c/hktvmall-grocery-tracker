import { Router, type IRouter } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { getGlobalDiscountPercent, setGlobalDiscountPercent, SETTINGS_ROW_ID } from "../lib/settings.js";

const router: IRouter = Router();

async function buildSettingsResponse() {
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, SETTINGS_ROW_ID));
  const updatedAt = rows[0]?.updatedAt ?? new Date();
  return {
    globalDiscountPercent: await getGlobalDiscountPercent(),
    updatedAt,
  };
}

router.get("/", async (_req, res) => {
  try {
    res.json(await buildSettingsResponse());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put("/", async (req, res) => {
  try {
    const body = UpdateSettingsBody.parse(req.body);
    await setGlobalDiscountPercent(body.globalDiscountPercent);
    res.json(await buildSettingsResponse());
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

export default router;
