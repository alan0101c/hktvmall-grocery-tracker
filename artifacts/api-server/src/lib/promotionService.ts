import { db, promotionRulesTable } from "@workspace/db";
import {
  normalizePromotionLabel,
  resolveApprovedPromotion,
  type AppliedPromotion,
} from "./promotionRules.js";

async function ensureDefaultPromotionRules(): Promise<void> {
  await db.insert(promotionRulesTable).values([
    {
      label: "65折換購家居保",
      normalizedLabel: "65折換購家居保",
      status: "rejected",
      reviewedAt: new Date(),
    },
    {
      label: "64折買AXA旅遊保",
      normalizedLabel: "64折買axa旅遊保",
      status: "rejected",
      reviewedAt: new Date(),
    },
    {
      label: "買2件95折",
      normalizedLabel: "買2件95折",
      status: "approved",
      discountPercent: "5",
      application: "conditional",
      minimumQuantity: 2,
      assumption: "Assumes purchase of at least 2 items",
      reviewedAt: new Date(),
    },
  ]).onConflictDoNothing({ target: promotionRulesTable.normalizedLabel });
}

export async function discoverPromotionRules(labels: readonly string[]): Promise<void> {
  await ensureDefaultPromotionRules();

  const seen = new Set<string>();
  const values: { label: string; normalizedLabel: string; lastSeenAt: Date }[] = [];
  const now = new Date();

  for (const rawLabel of labels) {
    const label = rawLabel.trim();
    const normalizedLabel = normalizePromotionLabel(label);
    if (!normalizedLabel || seen.has(normalizedLabel)) continue;
    seen.add(normalizedLabel);
    values.push({ label, normalizedLabel, lastSeenAt: now });
  }

  if (values.length === 0) return;
  await db.insert(promotionRulesTable).values(values).onConflictDoUpdate({
    target: promotionRulesTable.normalizedLabel,
    set: { lastSeenAt: now },
  });
}

export async function resolveScrapedPromotion(labels: readonly string[]): Promise<AppliedPromotion | null> {
  await discoverPromotionRules(labels);
  const rules = await db.select().from(promotionRulesTable);
  return resolveApprovedPromotion(labels, rules);
}

export async function loadPromotionRules() {
  await ensureDefaultPromotionRules();
  return db.select().from(promotionRulesTable);
}

export function promotionSnapshot(promotion: AppliedPromotion | null) {
  return {
    extraDiscountPercent: promotion == null ? null : String(promotion.discountPercent),
    extraDiscountLabel: promotion?.label ?? null,
    promotionRuleId: promotion?.ruleId ?? null,
    discountApplication: promotion?.application ?? null,
    discountMinimumQuantity: promotion?.minimumQuantity ?? null,
    discountAssumption: promotion?.assumption ?? null,
  };
}
