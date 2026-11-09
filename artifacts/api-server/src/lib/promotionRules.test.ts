import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePromotionLabel,
  productPromotionLabels,
  promotionFromSnapshot,
  resolveApprovedPromotion,
  suggestPromotion,
  type PromotionRuleLike,
} from "./promotionRules.js";

function rule(overrides: Partial<PromotionRuleLike> & Pick<PromotionRuleLike, "id" | "label">): PromotionRuleLike {
  const normalizedLabel = overrides.normalizedLabel ?? normalizePromotionLabel(overrides.label);
  return {
    normalizedLabel,
    status: "pending",
    discountPercent: null,
    application: "not_applicable",
    minimumQuantity: null,
    assumption: null,
    ...overrides,
  };
}

test("normalization folds width, letter case, and whitespace", () => {
  assert.equal(normalizePromotionLabel("  買２件９５折   AXA  "), "買2件95折 axa");
  assert.deepEqual(
    productPromotionLabels({ promotionTexts: ["買2件95折", " 買2件95折 "], extraDiscountLabel: "買2件95折" }),
    ["買2件95折"],
  );
});

test("direct and multi-buy suggestions require human review before use", () => {
  assert.deepEqual(suggestPromotion("額外8折"), {
    discountPercent: 20,
    application: "automatic",
    minimumQuantity: null,
    assumption: null,
  });
  assert.deepEqual(suggestPromotion("買2件95折"), {
    discountPercent: 5,
    application: "conditional",
    minimumQuantity: 2,
    assumption: "Assumes purchase of at least 2 items",
  });
});

test("insurance, redemption, and coupon-code labels are not suggested as product discounts", () => {
  for (const label of ["65折換購家居保", "64折買AXA旅遊保", "優惠碼 SAVE20", "加購價 $20"]) {
    assert.equal(suggestPromotion(label).application, "not_applicable", label);
    assert.equal(suggestPromotion(label).discountPercent, null, label);
  }
});

test("pending and rejected rules never adjust prices", () => {
  const labels = ["額外8折"];
  const pending = rule({ id: 1, label: labels[0], status: "pending", discountPercent: 20, application: "automatic" });
  const rejected = rule({ id: 1, label: labels[0], status: "rejected", discountPercent: 20, application: "automatic" });
  assert.equal(resolveApprovedPromotion(labels, [pending]), null);
  assert.equal(resolveApprovedPromotion(labels, [rejected]), null);
});

test("approved conditional rules expose the quantity assumption", () => {
  const multiBuy = rule({
    id: 2,
    label: "買2件95折",
    status: "approved",
    discountPercent: "5.00",
    application: "conditional",
    minimumQuantity: 2,
    assumption: "Assumes purchase of at least 2 items",
  });
  assert.deepEqual(resolveApprovedPromotion(["買2件95折"], [multiBuy]), {
    ruleId: 2,
    label: "買2件95折",
    discountPercent: 5,
    application: "conditional",
    minimumQuantity: 2,
    assumption: "Assumes purchase of at least 2 items",
  });
});

test("multiple approved tags do not stack and automatic rules take precedence", () => {
  const automatic = rule({
    id: 1,
    label: "額外9折",
    status: "approved",
    discountPercent: 10,
    application: "automatic",
  });
  const conditional = rule({
    id: 2,
    label: "買2件8折",
    status: "approved",
    discountPercent: 20,
    application: "conditional",
    minimumQuantity: 2,
    assumption: "Assumes purchase of at least 2 items",
  });
  assert.equal(resolveApprovedPromotion(["買2件8折", "額外9折"], [conditional, automatic])?.ruleId, 1);
  assert.equal(resolveApprovedPromotion(["額外9折"], [automatic])?.discountPercent, 10);
});

test("history snapshots retain their frozen promotion independently of current rules", () => {
  const frozen = promotionFromSnapshot({
    promotionRuleId: 2,
    extraDiscountLabel: "買2件95折",
    extraDiscountPercent: "5",
    discountApplication: "conditional",
    discountMinimumQuantity: 2,
    discountAssumption: "Assumes purchase of at least 2 items",
  });
  assert.equal(frozen?.discountPercent, 5);
  assert.equal(frozen?.application, "conditional");
  assert.equal(frozen?.assumption, "Assumes purchase of at least 2 items");
  assert.equal(
    promotionFromSnapshot({ extraDiscountLabel: "65折換購家居保", extraDiscountPercent: "35" })?.application,
    "automatic",
  );
});
