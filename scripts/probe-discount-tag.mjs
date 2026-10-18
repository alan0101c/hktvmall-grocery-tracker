// One-off probe: find where HKTVmall renders the 「額外85折 / 額外95折」 tag.
// 1) Inspect a raw Algolia hit for promo-related fields.
// 2) Load a product page and dump any element whose text mentions 額外 / 85折 / 95折 / Extra,
//    with outerHTML + class names, so we can pick a stable selector.
import { createRequire } from "module";
const require = createRequire("/Users/alanchen/Documents/GitHub/hktvmall-grocery-tracker/artifacts/api-server/package.json");
const { chromium } = require("playwright-core");

const ALGOLIA_APP_ID = "8RN1Y79F02";
const ALGOLIA_API_KEY = "a4a336abc62ab842842a81de642b484a";

async function algoliaProbe() {
  const url = `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries?x-algolia-application-id=${ALGOLIA_APP_ID}&x-algolia-api-key=${ALGOLIA_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ indexName: "hktvProduct", params: `query=${encodeURIComponent("牛奶")}&hitsPerPage=3` }],
    }),
  });
  const data = await res.json();
  const hits = data.results?.[0]?.hits || [];
  for (const [i, hit] of hits.entries()) {
    console.log(`\n=== Algolia hit #${i} (${hit.code}) ===`);
    // print keys whose name smells like promo/discount/label, plus a couple of base fields
    for (const k of Object.keys(hit).sort()) {
      if (/promo|discount|label|tag|campaign|offer|price|save/i.test(k)) {
        console.log(`  ${k}:`, JSON.stringify(hit[k])?.slice(0, 300));
      }
    }
    console.log("  nameZh:", hit.nameZh, "| sellingPrice:", hit.sellingPrice);
  }
}

async function pageProbe(productUrl) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "zh-HK",
  });
  const page = await ctx.newPage();
  await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(4000);

  const matches = await page.evaluate(() => {
    const out = [];
    const re = /額外|85折|95折|extra\s*\d+|15%\s*off|5%\s*off/i;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      // only leaf-ish elements to avoid ancestor spam
      if (node.children.length > 0) continue;
      const txt = (node.textContent || "").trim();
      if (txt && txt.length < 120 && re.test(txt)) {
        const el = node;
        out.push({
          tag: el.tagName.toLowerCase(),
          className: typeof el.className === "string" ? el.className : "",
          id: el.id || "",
          text: txt.replace(/\s+/g, " "),
          parentClass: el.parentElement?.className?.toString?.() ?? "",
          parentTag: el.parentElement?.tagName?.toLowerCase() ?? "",
          grandparentClass: el.parentElement?.parentElement?.className?.toString?.() ?? "",
          outerHTML: el.outerHTML.slice(0, 500),
        });
      }
    }
    return out;
  });

  console.log(`\n=== Page probe: ${productUrl} ===`);
  console.log(`matched leaf elements: ${matches.length}`);
  for (const m of matches) {
    console.log("\n---");
    console.log(`text: ${m.text}`);
    console.log(`tag: ${m.tag}  class: ${m.className}  id: ${m.id}`);
    console.log(`parent: <${m.parentTag} class="${m.parentClass}">  grandparent class: ${m.grandparentClass}`);
    console.log(`outerHTML: ${m.outerHTML}`);
  }

  // Also dump what the existing promo selectors would capture, for comparison
  const promoDump = await page.evaluate(() => {
    const sels = [".promo-name", ".promoMsg", ".multi-buy-promotion", "[class*='promo-label']", "[class*='promoLabel']", "[class*='discount']", "[class*='Discount']"];
    const out = {};
    for (const s of sels) {
      const arr = [];
      document.querySelectorAll(s).forEach((el) => {
        const t = (el.textContent || "").trim().replace(/\s+/g, " ");
        if (t && t.length < 200) arr.push({ cls: el.className?.toString?.() ?? "", text: t.slice(0, 150) });
      });
      if (arr.length) out[s] = arr.slice(0, 10);
    }
    return out;
  });
  console.log("\n=== Existing promo selector dump ===");
  console.log(JSON.stringify(promoDump, null, 2));

  await browser.close();
}

const target = process.argv[2];
if (target && target.startsWith("http")) {
  await pageProbe(target);
} else {
  await algoliaProbe();
}
