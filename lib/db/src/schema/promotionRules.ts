import { integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const promotionRulesTable = pgTable("promotion_rules", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  normalizedLabel: text("normalized_label").notNull().unique(),
  status: text("status").notNull().default("pending"),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }),
  application: text("application").notNull().default("not_applicable"),
  minimumQuantity: integer("minimum_quantity"),
  assumption: text("assumption"),
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPromotionRuleSchema = createInsertSchema(promotionRulesTable).omit({
  id: true,
  firstSeenAt: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPromotionRule = z.infer<typeof insertPromotionRuleSchema>;
export type PromotionRule = typeof promotionRulesTable.$inferSelect;
