import test from "node:test";
import assert from "node:assert/strict";
import type { PriceHistory, Product, ProductType } from "@workspace/db";
import { buildCategoryOverview, calculateOverviewUnitPrice } from "./overview.js";

function product(overrides: Partial<Product> & Pick<Product, "id" | "productTypeId">): Product {
  return {
    name: `Product ${overrides.id}`,
    nameZh: null,
    brand: null,
    category: null,
    currentPrice: "100",
    originalPrice: null,
    currency: "HKD",
    imageUrl: null,
    productUrl: null,
    sku: null,
    inStock: true,
    plusPrice: null,
    promotionTexts: [],
    extraDiscountPercent: null,
    extraDiscountLabel: null,
    promotionRuleId: null,
    discountApplication: null,
    discountMinimumQuantity: null,
    discountAssumption: null,
    packageQuantity: "1",
    packageUnit: "sheet",
    itemCount: 100,
    status: "active",
    lastRefreshError: null,
    lastUpdated: new Date("2026-10-24T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function history(overrides: Partial<PriceHistory> & Pick<PriceHistory, "id" | "productId">): PriceHistory {
  return {
    price: "100",
    originalPrice: null,
    plusPrice: null,
    promotionTexts: [],
    extraDiscountPercent: null,
    extraDiscountLabel: null,
    promotionRuleId: null,
    discountApplication: null,
    discountMinimumQuantity: null,
    discountAssumption: null,
    inStock: true,
    recordedAt: new Date("2026-10-01T00:00:00Z"),
    ...overrides,
  };
}

function type(id: number, name: string): ProductType {
  return { id, name, unitLabel: "sheet", createdAt: new Date("2026-01-01T00:00:00Z") };
}

test("unit price uses item count and applies the recorded discount", () => {
  assert.equal(
    calculateOverviewUnitPrice(102, 15, { packageQuantity: "1", itemCount: 60 }),
    1.445,
  );
});

test("unit price falls back to package quantity when there is no item count", () => {
  assert.equal(
    calculateOverviewUnitPrice(100, 0, { packageQuantity: "500", itemCount: null }),
    0.2,
  );
  assert.equal(
    calculateOverviewUnitPrice(100, 0, { packageQuantity: null, itemCount: 60 }),
    null,
  );
});

test("overview uses the cheapest available current listing and every listing's history", () => {
  const types = [type(1, "Baby / Diapers L / Merries"), type(2, "Dairy / Milk")];
  const products = [
    product({
      id: 11,
      productTypeId: 1,
      currentPrice: "128",
      itemCount: 80,
      productUrl: "https://www.hktvmall.com/p/merries-11",
    }),
    product({
      id: 12,
      productTypeId: 1,
      currentPrice: "90",
      itemCount: 60,
      productUrl: "https://www.hktvmall.com/p/merries-12",
    }),
    product({
      id: 13,
      productTypeId: 1,
      currentPrice: "50",
      itemCount: 100,
      productUrl: "https://www.hktvmall.com/p/unavailable-13",
      status: "unavailable",
      lastUpdated: new Date("2026-10-03T00:00:00Z"),
    }),
  ];
  const records = [
    history({ id: 101, productId: 11, price: "100", recordedAt: new Date("2026-10-01T00:00:00Z") }),
    history({ id: 102, productId: 12, price: "96", recordedAt: new Date("2026-10-02T00:00:00Z") }),
    history({ id: 103, productId: 13, price: "50", recordedAt: new Date("2026-10-03T00:00:00Z") }),
  ];

  const [row, emptyRow] = buildCategoryOverview(types, products, records);
  assert.equal(row.bigCategory, "Baby");
  assert.equal(row.subCategory, "Diapers L");
  assert.equal(row.name, "Merries");
  assert.equal(row.cheapestPricePerUnit, 1.5);
  assert.equal(row.productUrl, "https://www.hktvmall.com/p/merries-12");
  assert.equal(row.historicalLow, 0.5);
  assert.equal(row.historicalLowDate, "2026-10-03T00:00:00.000Z");
  assert.equal(row.unit, "sheet");
  assert.equal(emptyRow.cheapestPricePerUnit, null);
  assert.equal(emptyRow.productUrl, null);
  assert.equal(emptyRow.historicalLow, null);
  assert.equal(emptyRow.historicalLowDate, null);
});

test("historical lows use the discount frozen on each history record", () => {
  const types = [type(1, "Baby / Diapers L / Merries")];
  const products = [product({ id: 11, productTypeId: 1, currentPrice: "120", itemCount: 100 })];
  const records = [
    history({
      id: 101,
      productId: 11,
      price: "100",
      extraDiscountPercent: "15",
      extraDiscountLabel: "額外85折",
      recordedAt: new Date("2026-10-01T00:00:00Z"),
    }),
  ];

  const [row] = buildCategoryOverview(types, products, records);
  assert.equal(row.cheapestPricePerUnit, 1.2);
  assert.equal(row.historicalLow, 0.85);
});

test("current rules apply without rewriting frozen conditional history", () => {
  const types = [type(1, "Baby / Diapers L / Merries")];
  const products = [product({
    id: 11,
    productTypeId: 1,
    currentPrice: "100",
    itemCount: 100,
    promotionTexts: ["買2件95折"],
    lastUpdated: new Date("2026-10-24T00:00:00Z"),
  })];
  const records = [history({
    id: 101,
    productId: 11,
    price: "100",
    extraDiscountPercent: "35",
    extraDiscountLabel: "65折換購家居保",
    discountApplication: "automatic",
    recordedAt: new Date("2026-10-01T00:00:00Z"),
  })];
  const rules = [{
    id: 2,
    label: "買2件95折",
    normalizedLabel: "買2件95折",
    status: "approved",
    discountPercent: "5",
    application: "conditional",
    minimumQuantity: 2,
    assumption: "Assumes purchase of at least 2 items",
  }];

  const [beforeReview] = buildCategoryOverview(types, products, records);
  assert.equal(beforeReview.cheapestPricePerUnit, 1);
  assert.equal(beforeReview.cheapestPromotion, null);

  const [afterReview] = buildCategoryOverview(types, products, records, rules);
  assert.equal(afterReview.cheapestPricePerUnit, 0.95);
  assert.equal(afterReview.cheapestPromotion?.application, "conditional");
  assert.equal(afterReview.cheapestPromotion?.assumption, "Assumes purchase of at least 2 items");
  assert.equal(afterReview.historicalLow, 0.65);
  assert.equal(afterReview.historicalLowPromotion?.label, "65折換購家居保");

  records[0].extraDiscountPercent = "5";
  records[0].extraDiscountLabel = "買2件95折";
  records[0].discountApplication = "conditional";
  records[0].discountMinimumQuantity = 2;
  records[0].discountAssumption = "Assumes purchase of at least 2 items";
  const [frozenConditional] = buildCategoryOverview(types, products, records, []);
  assert.equal(frozenConditional.historicalLow, 0.95);
  assert.equal(frozenConditional.historicalLowPromotion?.application, "conditional");
  assert.equal(frozenConditional.historicalLowPromotion?.assumption, "Assumes purchase of at least 2 items");
});
