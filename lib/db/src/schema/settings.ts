import { pgTable, serial, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * App-wide settings. Single-row table (id = 1).
 * globalDiscountPercent models sitewide promotions (e.g. HKTVMall "全場85折")
 * so that displayed prices, unit prices and alert triggers reflect the price
 * you would actually pay, without mutating the scraped data.
 */
export const appSettingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  globalDiscountPercent: numeric("global_discount_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAppSettingsSchema = createInsertSchema(appSettingsTable).omit({ id: true, updatedAt: true });
export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;
export type AppSettings = typeof appSettingsTable.$inferSelect;
