/**
 * One-off validation: check that every product's recorded unit matches its
 * category's unit, and that no category contains mixed units.
 * Run: DATABASE_URL=... node --import tsx scripts/validate-units.ts
 */
import { db, pool, productTypesTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const norm = (s: string | null | undefined) => s?.trim().toLowerCase() ?? null;

async function main() {
  const types = await db.select().from(productTypesTable);
  const products = await db.select().from(productsTable);

  const typeById = new Map(types.map((t) => [t.id, t]));

  console.log(`Categories: ${types.length}, products: ${products.length}\n`);

  // ── 1. Per-category unit consistency (case-insensitive) ──
  console.log("== Category unit consistency ==");
  let mixedCategories = 0;
  for (const t of types) {
    const members = products.filter((p) => p.productTypeId === t.id);
    if (members.length === 0) {
      console.log(`  [empty]  "${t.name}" (${t.unitLabel}) — no products`);
      continue;
    }
    const unitVariants = new Map<string, string[]>();
    for (const p of members) {
      const key = norm(p.packageUnit) ?? "(none)";
      const variants = unitVariants.get(key) ?? [];
      variants.push(p.packageUnit ?? "NULL");
      unitVariants.set(key, variants);
    }
    if (unitVariants.size > 1) {
      mixedCategories++;
      console.log(`  [MIXED]  "${t.name}" (category unit: ${t.unitLabel})`);
      for (const [key, variants] of unitVariants) {
        console.log(`           variant "${key}": raw values [${[...new Set(variants)].join(", ")}]`);
      }
    } else {
      const only = [...unitVariants.keys()][0];
      const status = only === norm(t.unitLabel) ? "ok" : `MISMATCH (products use "${only}")`;
      console.log(`  [${status}] "${t.name}" (category unit: ${t.unitLabel}, ${members.length} products)`);
    }
  }

  // ── 2. Product-level mismatches against their category ──
  console.log("\n== Product vs category mismatches ==");
  let mismatches = 0;
  let caseOnly = 0;
  let missingUnit = 0;
  for (const p of products) {
    if (p.productTypeId == null) continue;
    const t = typeById.get(p.productTypeId);
    if (!t) {
      console.log(`  [ORPHAN] product #${p.id} "${p.name}" -> productTypeId ${p.productTypeId} does not exist`);
      mismatches++;
      continue;
    }
    const productUnit = p.packageUnit?.trim() ?? null;
    if (!productUnit) {
      missingUnit++;
      console.log(`  [NO UNIT] product #${p.id} "${p.name}" in "${t.name}" has no recorded unit (qty=${p.packageQuantity})`);
      continue;
    }
    if (productUnit === t.unitLabel) continue; // exact match
    if (norm(productUnit) === norm(t.unitLabel)) {
      caseOnly++;
      console.log(`  [CASE] product #${p.id} "${p.name}" in "${t.name}": recorded "${productUnit}" vs category "${t.unitLabel}"`);
    } else {
      mismatches++;
      console.log(`  [MISMATCH] product #${p.id} "${p.name}" in "${t.name}": recorded "${productUnit}" vs category "${t.unitLabel}"`);
    }
  }

  // ── 3. Uncategorised products ──
  console.log("\n== Uncategorised products ==");
  const uncategorised = products.filter((p) => p.productTypeId == null);
  const withQty = uncategorised.filter((p) => p.packageQuantity != null);
  const withUnit = uncategorised.filter((p) => p.packageUnit != null);
  console.log(`  ${uncategorised.length} uncategorised, ${withQty.length} with a package quantity, ${withUnit.length} with a recorded unit`);

  // ── Summary ──
  console.log("\n== Summary ==");
  console.log(`  exact matches: ${products.filter((p) => p.productTypeId != null && p.packageUnit?.trim() === typeById.get(p.productTypeId!)?.unitLabel).length}`);
  console.log(`  case-only differences: ${caseOnly}`);
  console.log(`  real mismatches: ${mismatches}`);
  console.log(`  members missing a unit: ${missingUnit}`);
  console.log(`  categories with mixed units: ${mixedCategories}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
