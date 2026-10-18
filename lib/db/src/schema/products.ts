import { pgTable, serial, text, numeric, boolean, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productTypesTable = pgTable("product_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  unitLabel: text("unit_label").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
  plusPrice: numeric("plus_price", { precision: 10, scale: 2 }),
  promotionTexts: jsonb("promotion_texts").$type<string[]>(),
  /**
   * Per-product extra-off campaign parsed from the product's own HKTVmall price
   * tag (div.marketing-label-description): 15 = 「今日85折」, 5 = 「今日95折」.
   * Null = no tag on the page / not campaign-eligible. Takes precedence over
   * the app-wide global discount when computing the effective price. On
   * price_history it is frozen per scrape (campaign tags are day-scoped).
   */
  extraDiscountPercent: numeric("extra_discount_percent", { precision: 5, scale: 2 }),
  /** Raw tag text the rate was parsed from, e.g. 「今日85折$99自取/$699送貨」. */
  extraDiscountLabel: text("extra_discount_label"),
  productTypeId: integer("product_type_id").references(() => productTypesTable.id, { onDelete: "set null" }),
  packageQuantity: numeric("package_quantity", { precision: 10, scale: 3 }),
  /**
   * The unit the package quantity was entered in (ml, g, pack, …).
   * The category (product_types.unit_label) owns the canonical unit: assigning a
   * product to a category is rejected when this differs from the category's unit,
   * and products without a recorded unit adopt the category's on assignment.
   */
  packageUnit: text("package_unit"),
  itemCount: integer("item_count"),
  /**
   * "active" = product page parses normally on HKTVmall.
   * "unavailable" = the product could no longer be parsed (removed/delisted
   * from HKTVmall). The record is kept for price history either way.
   */
  status: text("status").notNull().default("active"),
  /** Message from the last failed refresh attempt, if any. */
  lastRefreshError: text("last_refresh_error"),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const priceHistoryTable = pgTable("price_history", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  originalPrice: numeric("original_price", { precision: 10, scale: 2 }),
  plusPrice: numeric("plus_price", { precision: 10, scale: 2 }),
  promotionTexts: jsonb("promotion_texts").$type<string[]>(),
  /**
   * Per-product extra-off campaign parsed from the product's own HKTVmall price
   * tag (div.marketing-label-description): 15 = 「今日85折」, 5 = 「今日95折」.
   * Null = no tag on the page / not campaign-eligible. Takes precedence over
   * the app-wide global discount when computing the effective price. On
   * price_history it is frozen per scrape (campaign tags are day-scoped).
   */
  extraDiscountPercent: numeric("extra_discount_percent", { precision: 5, scale: 2 }),
  /** Raw tag text the rate was parsed from, e.g. 「今日85折$99自取/$699送貨」. */
  extraDiscountLabel: text("extra_discount_label"),
  inStock: boolean("in_stock").notNull().default(true),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
});

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  targetPrice: numeric("target_price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProductTypeSchema = createInsertSchema(productTypesTable).omit({ id: true, createdAt: true });
export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, lastUpdated: true });
export const insertPriceHistorySchema = createInsertSchema(priceHistoryTable).omit({ id: true, recordedAt: true });
export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true, createdAt: true });

export type InsertProductType = z.infer<typeof insertProductTypeSchema>;
export type ProductType = typeof productTypesTable.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
export type PriceHistory = typeof priceHistoryTable.$inferSelect;
export type Alert = typeof alertsTable.$inferSelect;
