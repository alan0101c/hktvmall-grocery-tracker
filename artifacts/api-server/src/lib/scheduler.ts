import cron from "node-cron";
import { db } from "@workspace/db";
import { schedulerSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { refreshAllProducts } from "./refreshService.js";

let currentTask: cron.ScheduledTask | null = null;
let nextRunTime: Date | null = null;

function intervalToCron(hours: number): string {
  if (hours < 1) return "0 * * * *"; // every hour
  if (hours === 1) return "0 * * * *";
  if (hours === 24) return "0 0 * * *";
  return `0 */${hours} * * *`;
}

async function getSettings() {
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

function computeNextRun(intervalHours: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setMilliseconds(0);
  next.setSeconds(0);
  const currentHour = now.getHours();
  const nextHourBlock = Math.ceil((currentHour + 1) / intervalHours) * intervalHours;
  if (nextHourBlock >= 24) {
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
  } else {
    next.setHours(nextHourBlock, 0, 0, 0);
  }
  return next;
}

async function runRefresh() {
  console.log("[Scheduler] Running scheduled price refresh...");
  try {
    const result = await refreshAllProducts();
    console.log(`[Scheduler] Done: ${result.refreshed} updated, ${result.failed} failed, ${result.priceDrops} price drops`);

    const settings = await getSettings();
    await db
      .update(schedulerSettingsTable)
      .set({ lastRun: new Date(), totalRuns: settings.totalRuns + 1 })
      .where(eq(schedulerSettingsTable.id, settings.id));

    nextRunTime = computeNextRun(settings.intervalHours);
  } catch (err) {
    console.error("[Scheduler] Error:", err);
  }
}

export async function initScheduler() {
  const settings = await getSettings();
  if (settings.enabled) {
    startScheduler(settings.intervalHours);
  }
  console.log(`[Scheduler] Initialized — enabled=${settings.enabled}, interval=${settings.intervalHours}h`);
}

export function startScheduler(intervalHours: number) {
  stopScheduler();
  const cronExpr = intervalToCron(intervalHours);
  currentTask = cron.schedule(cronExpr, runRefresh);
  nextRunTime = computeNextRun(intervalHours);
  console.log(`[Scheduler] Started with cron "${cronExpr}", next run ~${nextRunTime.toISOString()}`);
}

export function stopScheduler() {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    nextRunTime = null;
  }
}

export function getNextRunTime(): Date | null {
  return nextRunTime;
}
