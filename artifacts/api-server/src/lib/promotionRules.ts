export type PromotionStatus = "pending" | "approved" | "rejected";
export type PromotionApplication = "automatic" | "conditional" | "not_applicable";

export interface PromotionRuleLike {
  id: number;
  label: string;
  normalizedLabel: string;
  status: string;
  discountPercent: string | number | null;
  application: string;
  minimumQuantity: number | null;
  assumption: string | null;
}

export interface PromotionSuggestion {
  discountPercent: number | null;
  application: PromotionApplication;
  minimumQuantity: number | null;
  assumption: string | null;
}

export interface AppliedPromotion {
  ruleId: number;
  label: string;
  discountPercent: number;
  application: "automatic" | "conditional";
  minimumQuantity: number | null;
  assumption: string | null;
}

export interface PromotionSnapshotLike {
  promotionRuleId?: number | null;
  extraDiscountLabel: string | null;
  extraDiscountPercent: string | number | null;
  discountApplication?: string | null;
  discountMinimumQuantity?: number | null;
  discountAssumption?: string | null;
}

const noAdjustment: PromotionSuggestion = {
  discountPercent: null,
  application: "not_applicable",
  minimumQuantity: null,
  assumption: null,
};

export function normalizePromotionLabel(label: string): string {
  return label.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function discountFromPayPercent(payPercent: number): number | null {
  const discount = payPercent > 10 ? 100 - payPercent : 100 - payPercent * 10;
  return discount > 0 && discount < 100 ? Math.round(discount * 100) / 100 : null;
}

export function suggestPromotion(label: string): PromotionSuggestion {
  const normalized = normalizePromotionLabel(label);
  if (!normalized || /換購|加購|即送|贈|優惠碼|保險|家居保|旅遊保|折\s*買/.test(normalized)) {
    return { ...noAdjustment };
  }

  const multiBuy = normalized.match(/買\s*(\d+)\s*件\s*(\d{1,2}(?:\.\d+)?)\s*折/);
  if (multiBuy) {
    const minimumQuantity = Number.parseInt(multiBuy[1], 10);
    const discountPercent = discountFromPayPercent(Number(multiBuy[2]));
    if (minimumQuantity >= 2 && discountPercent != null) {
      return {
        discountPercent,
        application: "conditional",
        minimumQuantity,
        assumption: `Assumes purchase of at least ${minimumQuantity} items`,
      };
    }
  }

  const direct = normalized.match(/^(?:今日|額外|限時)\s*(\d{1,2}(?:\.\d+)?)\s*折(?:\s*\$\d+(?:\.\d+)?(?:自取|送貨)(?:\s*\/\s*\$\d+(?:\.\d+)?(?:自取|送貨))?)?\s*$/);
  if (direct) {
    const discountPercent = discountFromPayPercent(Number(direct[1]));
    if (discountPercent != null) {
      return { ...noAdjustment, discountPercent, application: "automatic" };
    }
  }

  return { ...noAdjustment };
}

export function productPromotionLabels(product: {
  promotionTexts: string[] | null;
  extraDiscountLabel: string | null;
}): string[] {
  const labels = [...(product.promotionTexts ?? []), ...(product.extraDiscountLabel ? [product.extraDiscountLabel] : [])];
  const seen = new Set<string>();
  return labels.filter((label) => {
    const normalized = normalizePromotionLabel(label);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function reviewedPromotion(rule: PromotionRuleLike): AppliedPromotion | null {
  if (rule.status !== "approved") return null;
  if (rule.application !== "automatic" && rule.application !== "conditional") return null;
  const discountPercent = Number(rule.discountPercent);
  if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent >= 100) return null;
  if (
    rule.application === "conditional" &&
    (rule.minimumQuantity == null || rule.minimumQuantity < 2 || !rule.assumption?.trim())
  ) return null;

  return {
    ruleId: rule.id,
    label: rule.label,
    discountPercent,
    application: rule.application,
    minimumQuantity: rule.application === "conditional" ? rule.minimumQuantity : null,
    assumption: rule.application === "conditional" ? rule.assumption : null,
  };
}

export function resolveApprovedPromotion(
  labels: readonly string[],
  rules: readonly PromotionRuleLike[],
): AppliedPromotion | null {
  const ruleMap = new Map(rules.map((rule) => [rule.normalizedLabel, rule]));
  const matches: { rule: PromotionRuleLike; promotion: AppliedPromotion }[] = [];
  const seen = new Set<string>();

  for (const label of labels) {
    const normalized = normalizePromotionLabel(label);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const rule = ruleMap.get(normalized);
    if (!rule) continue;
    const promotion = reviewedPromotion(rule);
    if (promotion) matches.push({ rule, promotion });
  }

  matches.sort((a, b) => {
    if (a.promotion.application !== b.promotion.application) {
      return a.promotion.application === "automatic" ? -1 : 1;
    }
    if (a.promotion.discountPercent !== b.promotion.discountPercent) {
      return b.promotion.discountPercent - a.promotion.discountPercent;
    }
    const quantityDifference = (a.promotion.minimumQuantity ?? Number.MAX_SAFE_INTEGER) -
      (b.promotion.minimumQuantity ?? Number.MAX_SAFE_INTEGER);
    return quantityDifference || a.rule.normalizedLabel.localeCompare(b.rule.normalizedLabel);
  });

  return matches[0]?.promotion ?? null;
}

export function promotionFromSnapshot(record: PromotionSnapshotLike): AppliedPromotion | null {
  if (record.extraDiscountPercent == null || !record.extraDiscountLabel) return null;
  const application = record.discountApplication ?? "automatic";
  if (application !== "automatic" && application !== "conditional") return null;
  const discountPercent = Number(record.extraDiscountPercent);
  if (!Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent >= 100) return null;
  if (
    application === "conditional" &&
    (record.discountMinimumQuantity == null || record.discountMinimumQuantity < 2 || !record.discountAssumption?.trim())
  ) return null;

  return {
    ruleId: record.promotionRuleId ?? 0,
    label: record.extraDiscountLabel,
    discountPercent,
    application,
    minimumQuantity: application === "conditional" ? record.discountMinimumQuantity ?? null : null,
    assumption: application === "conditional" ? record.discountAssumption ?? null : null,
  };
}
