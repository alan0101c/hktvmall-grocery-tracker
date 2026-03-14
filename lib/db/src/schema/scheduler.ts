import { pgTable, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const schedulerSettingsTable = pgTable("scheduler_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  intervalHours: integer("interval_hours").notNull().default(6),
  lastRun: timestamp("last_run"),
  totalRuns: integer("total_runs").notNull().default(0),
});

export const insertSchedulerSettingsSchema = createInsertSchema(schedulerSettingsTable).omit({ id: true });
export type SchedulerSettings = typeof schedulerSettingsTable.$inferSelect;
