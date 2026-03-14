import { pgTable, serial, text, numeric, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameZh: text("name_zh"),
  brand: text("brand"),
  category: text("category"),
  currentPrice: numeric("current_price", { precision: 10, scale: 2 }).notNull(),
  originalPrice: numeric("original_price", { precision: 10, scale: 2 }),
  currency: text("currency").notNull().default("HKD"),
  imageUrl: text("image_url"),
  productUrl: text("product_url"),
  sku: text("sku").unique(),
  inStock: boolean("in_stock").notNull().default(true),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const priceHistoryTable = pgTable("price_history", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  targetPrice: numeric("target_price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, lastUpdated: true });
export const insertPriceHistorySchema = createInsertSchema(priceHistoryTable).omit({ id: true, recordedAt: true });
export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true, createdAt: true });

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
export type PriceHistory = typeof priceHistoryTable.$inferSelect;
export type Alert = typeof alertsTable.$inferSelect;
