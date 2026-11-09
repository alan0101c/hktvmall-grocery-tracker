import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { schedulerSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSchedulerBody } from "@workspace/api-zod";
import { startScheduler, stopScheduler, getNextRunTime } from "../lib/scheduler.js";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const rows = await db.select().from(schedulerSettingsTable);
  if (rows.length === 0) {
    const [created] = await db
      .insert(schedulerSettingsTable)
      .values({ enabled: true, intervalHours: 6, requestDelayMs: 3000, totalRuns: 0 })
      .returning();
    return created;
  }
  return rows[0];
}

function buildSchedulerResponse(settings: Awaited<ReturnType<typeof getOrCreateSettings>>, nextRun: Date | null) {
  return {
    enabled: settings.enabled,
    intervalHours: settings.intervalHours,
    requestDelayMs: settings.requestDelayMs,
    lastRun: settings.lastRun ?? null,
    nextRun: nextRun ?? null,
    totalRuns: settings.totalRuns,
  };
}

router.get("/", async (_req, res) => {
  try {
    const settings = await getOrCreateSettings();
    const nextRun = getNextRunTime();
    res.json(buildSchedulerResponse(settings, nextRun));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put("/", async (req, res) => {
  try {
    const parsed = UpdateSchedulerBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const body = parsed.data;
    if (!Number.isInteger(body.requestDelayMs)) {
      res.status(400).json({ error: "requestDelayMs must be an integer" });
      return;
    }
    const settings = await getOrCreateSettings();

    await db
      .update(schedulerSettingsTable)
      .set({
        enabled: body.enabled,
        intervalHours: body.intervalHours,
        requestDelayMs: body.requestDelayMs,
      })
      .where(eq(schedulerSettingsTable.id, settings.id));

    if (body.enabled) {
      startScheduler(body.intervalHours);
    } else {
      stopScheduler();
    }

    const nextRun = getNextRunTime();
    const updated = await getOrCreateSettings();

    res.json(buildSchedulerResponse(updated, nextRun));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
