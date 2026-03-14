import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { schedulerSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSchedulerBody, GetSchedulerResponse, UpdateSchedulerResponse } from "@workspace/api-zod";
import { startScheduler, stopScheduler, getNextRunTime } from "../lib/scheduler.js";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const rows = await db.select().from(schedulerSettingsTable);
  if (rows.length === 0) {
    const [created] = await db
      .insert(schedulerSettingsTable)
      .values({ enabled: true, intervalHours: 6, totalRuns: 0 })
      .returning();
    return created;
  }
  return rows[0];
}

router.get("/", async (_req, res) => {
  try {
    const settings = await getOrCreateSettings();
    const nextRun = getNextRunTime();

    const result = GetSchedulerResponse.parse({
      enabled: settings.enabled,
      intervalHours: settings.intervalHours,
      lastRun: settings.lastRun?.toISOString() ?? null,
      nextRun: nextRun?.toISOString() ?? null,
      totalRuns: settings.totalRuns,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put("/", async (req, res) => {
  try {
    const body = UpdateSchedulerBody.parse(req.body);
    const settings = await getOrCreateSettings();

    await db
      .update(schedulerSettingsTable)
      .set({ enabled: body.enabled, intervalHours: body.intervalHours })
      .where(eq(schedulerSettingsTable.id, settings.id));

    if (body.enabled) {
      startScheduler(body.intervalHours);
    } else {
      stopScheduler();
    }

    const nextRun = getNextRunTime();
    const updated = await getOrCreateSettings();

    const result = UpdateSchedulerResponse.parse({
      enabled: updated.enabled,
      intervalHours: updated.intervalHours,
      lastRun: updated.lastRun?.toISOString() ?? null,
      nextRun: nextRun?.toISOString() ?? null,
      totalRuns: updated.totalRuns,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
