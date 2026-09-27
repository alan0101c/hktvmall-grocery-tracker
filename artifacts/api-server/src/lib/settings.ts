import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const SETTINGS_ROW_ID = 1;

/**
 * Returns the app-wide discount percentage (0–100).
 * The app_settings table is a single-row table; if the row is missing
 * (e.g. migration not applied yet), it is created with the default of 0.
 */
export async function getGlobalDiscountPercent(): Promise<number> {
  const rows = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.id, SETTINGS_ROW_ID));

  if (rows.length > 0) {
    return parseFloat(rows[0].globalDiscountPercent);
  }

  const [created] = await db
    .insert(appSettingsTable)
    .values({ id: SETTINGS_ROW_ID, globalDiscountPercent: "0" })
    .onConflictDoNothing()
    .returning();

  if (created) return parseFloat(created.globalDiscountPercent);

  const retry = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.id, SETTINGS_ROW_ID));
  return retry.length > 0 ? parseFloat(retry[0].globalDiscountPercent) : 0;
}

export async function setGlobalDiscountPercent(percent: number): Promise<void> {
  const clamped = Math.min(100, Math.max(0, Math.round(percent * 100) / 100));
  await db
    .insert(appSettingsTable)
    .values({ id: SETTINGS_ROW_ID, globalDiscountPercent: clamped.toString() })
    .onConflictDoUpdate({
      target: appSettingsTable.id,
      set: { globalDiscountPercent: clamped.toString(), updatedAt: new Date() },
    });
}

/** Applies the global discount to a listed price, rounded to 2 decimals. */
export function applyDiscount(price: number, discountPercent: number): number {
  if (!discountPercent || discountPercent <= 0) return price;
  return Math.round(price * (1 - discountPercent / 100) * 100) / 100;
}
