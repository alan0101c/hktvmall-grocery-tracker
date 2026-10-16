import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { execSync } from "child_process";
import { existsSync } from "fs";

export interface ScrapedProduct {
  name: string;
  nameZh?: string;
  brand?: string;
  category?: string;
  currentPrice: number;
  originalPrice?: number;
  /** HKTVmall Plus member price. Plus was cancelled by HKTVmall, so new scrapes always leave this undefined. */
  plusPrice?: number;
  promotionTexts: string[];
  currency: string;
  imageUrl?: string;
  productUrl: string;
  sku?: string;
  inStock: boolean;
}

const BASE_URL = "https://www.hktvmall.com";
const PAGE_TIMEOUT = 15_000;

/**
 * Thrown when the product page can no longer be parsed because the product
 * has been removed/delisted from HKTVmall (404, redirect away from the
 * product path, or a "not found" page with no price markup).
 * Distinct from transient scrape failures (timeouts, layout changes).
 */
export class ProductUnavailableError extends Error {
  readonly name = "ProductUnavailableError";
  constructor(productUrl: string, reason: string) {
    super(`Product no longer available on HKTVmall (${reason}): ${productUrl}`);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// Markers that HKTVmall renders on removed/delisted product pages.
const UNAVAILABLE_TEXT = /product not found|找不到|不存在|已下架|no longer available|page not found|暫停發售/i;

let browserInstance: Browser | null = null;
let chromiumPath: string | null = null;

// Well-known Chrome/Chromium install locations, checked in order.
const CHROMIUM_CANDIDATES = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/snap/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
];

function which(binary: string): string | null {
  try {
    const path = execSync(`which ${binary}`, { encoding: "utf-8" }).trim();
    return path || null;
  } catch {
    return null;
  }
}

function getChromiumPath(): string {
  if (chromiumPath) return chromiumPath;
  if (process.env.CHROMIUM_PATH) {
    chromiumPath = process.env.CHROMIUM_PATH;
    return chromiumPath;
  }
  for (const binary of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    const found = which(binary);
    if (found) {
      chromiumPath = found;
      return chromiumPath;
    }
  }
  for (const candidate of CHROMIUM_CANDIDATES) {
    if (existsSync(candidate)) {
      chromiumPath = candidate;
      return chromiumPath;
    }
  }
  // Last resort — keeps the old error message pointing at the Linux default.
  chromiumPath = "/usr/bin/chromium";
  return chromiumPath;
}

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }
  browserInstance = await chromium.launch({
    headless: true,
    executablePath: getChromiumPath(),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
  browserInstance.on("disconnected", () => {
    browserInstance = null;
  });
  return browserInstance;
}

async function withPage<T>(fn: (ctx: BrowserContext) => Promise<T>): Promise<T> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "zh-HK",
  });
  try {
    return await fn(context);
  } finally {
    await context.close();
  }
}

function parsePrice(raw: string): number | undefined {
  if (!raw) return undefined;
  const match = raw.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  if (match) {
    const n = parseFloat(match[1].replace(/,/g, ""));
    return isNaN(n) || n <= 0 ? undefined : n;
  }
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return isNaN(n) || n <= 0 ? undefined : n;
}

function extractSku(url: string): string | undefined {
  const m = url.match(/\/p\/([^/?#]+)/);
  return m?.[1] ?? undefined;
}

export async function scrapeProductByUrl(
  productUrl: string
): Promise<ScrapedProduct | null> {
  const fullUrl = productUrl.startsWith("http")
    ? productUrl
    : `${BASE_URL}${productUrl}`;

  return withPage(async (context) => {
    const page = await context.newPage();
    try {
      const response = await page.goto(fullUrl, {
        waitUntil: "domcontentloaded",
        timeout: PAGE_TIMEOUT,
      });

      const status = response?.status() ?? 0;
      if (status === 404 || status === 410) {
        throw new ProductUnavailableError(fullUrl, `HTTP ${status}`);
      }

      // HKTVmall redirects delisted product URLs away from /p/<sku>.
      const urlPath = (u: string) => { try { return new URL(u).pathname; } catch { return ""; } };
      if (/\/p\//.test(urlPath(fullUrl)) && !/\/p\//.test(urlPath(page.url()))) {
        throw new ProductUnavailableError(fullUrl, "redirected away from product page");
      }

      try {
        await page.waitForSelector("div.price, .pricelabel, .priceTypeText", {
          timeout: PAGE_TIMEOUT,
        });
      } catch (waitErr) {
        // Timed out waiting for price markup. If the page says the product
        // is gone (rather than just slow or changed layout), report it as
        // unavailable so the tracker can flag it instead of a generic error.
        const bodyText = await page
          .evaluate(() => document.body?.innerText?.slice(0, 2000) ?? "")
          .catch(() => "");
        if (UNAVAILABLE_TEXT.test(bodyText)) {
          throw new ProductUnavailableError(fullUrl, "product-not-found page content");
        }
        throw waitErr;
      }

      await page.waitForTimeout(2000);

      const data = await page.evaluate(() => {
        const ogTitle =
          document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
        const ogImage =
          document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";

        const pageTitle = document.title;

        let name = ogTitle;
        if (!name && pageTitle) {
          const parts = pageTitle.split("|");
          name = parts.length > 1 ? parts.slice(0, -1).join("|").trim() : parts[0].trim();
        }

        let brand = "";
        if (pageTitle.includes("|")) {
          brand = pageTitle.split("|")[0].trim();
          if (name.startsWith(brand + " | ")) {
            name = name.substring(brand.length + 3).trim();
          }
        }

        const priceEl = document.querySelector(
          ".page-productDetails div.price, .product-detail-info-top div.price, div.price"
        );
        const currentPriceStr = priceEl?.textContent?.trim() || "";

        const priceLabelEl = document.querySelector(
          ".page-productDetails .pricelabel, .product-detail-info-top .pricelabel, .pricelabel"
        );
        let originalPriceStr = "";
        if (priceLabelEl) {
          const labelText = priceLabelEl.textContent?.trim() || "";
          const allPrices = labelText.match(/\$\s*[\d,.]+/g) || [];
          if (allPrices.length >= 2) {
            originalPriceStr = allPrices[0];
          }
        }

        const priceTypeEl = document.querySelector(".priceTypeText");
        const isSpecialPrice = priceTypeEl?.textContent?.trim() === "特價";

        const imageUrl =
          ogImage ||
          (document.querySelector(
            ".product-detail-info-top img, .gallery img, [class*=\"product-image\"] img"
          ) as HTMLImageElement)?.src ||
          "";

        const hasOutOfStockClass = !!document.querySelector(
          '[class*="out-of-stock"], [class*="outOfStock"], [class*="sold-out"], [class*="soldOut"], [class*="unavailable"], .addToCartDisabled'
        );

        const pageText = document.body.innerText || "";
        const hasOutOfStockText = /out[\s-]?of[\s-]?stock|已售罄|缺貨|无货|售罄/i.test(pageText);

        const addToCartBtn = document.querySelector(
          'button[class*="addToCart"], button[class*="add-to-cart"], [data-testid*="add-to-cart"], button[class*="AddCart"], button[class*="buyNow"], button[class*="buy-now"]'
        ) as HTMLButtonElement | null;
        const addToCartClearlyAvailable = addToCartBtn !== null
          && !addToCartBtn.disabled
          && addToCartBtn.getAttribute("aria-disabled") !== "true";

        const isOutOfStock = hasOutOfStockClass || hasOutOfStockText || !addToCartClearlyAvailable;

        const promotionTexts: string[] = [];
        const seenPromos = new Set<string>();
        // Note: deliberately NOT capturing `.threshold-promotion-description`
        // (duplicates the .promo-name entries glued into one string) or
        // `.promotionLabel` / `[class*='promotion-tag']` (rotating cross-sell
        // carousel injected on every product page — causes ever-growing,
        // unstable label walls). Multi-buy selectors are kept because
        // "買2件95折"-style promos are real product-level discounts.
        const promoSelectors = [
          ".promo-name",
          ".promoMsg",
          ".multi-buy-promotion",
          "[class*='multi-buy']",
          "[class*='multibuy']",
          "[class*='promo-label']",
          "[class*='promoLabel']",
        ];
        for (const sel of promoSelectors) {
          document.querySelectorAll(sel).forEach((el) => {
            const txt = (el.textContent?.trim() || "").replace(/\s+/g, " ");
            if (txt.length > 0 && txt.length < 200 && !seenPromos.has(txt)) {
              seenPromos.add(txt);
              promotionTexts.push(txt);
            }
          });
        }
        // Containment dedupe: HKTVMall nests duplicated promo markup, so some
        // captured strings fully contain another captured string. Keep the
        // shorter, cleaner text and drop the concatenated duplicates.
        const cleanedPromoTexts = promotionTexts.filter(
          (t) => !promotionTexts.some((o) => o !== t && o.length < t.length && t.includes(o))
        );

        // Best-effort category from the breadcrumb trail. Absent on many
        // pages — callers fall back to the category they already have.
        let categoryName = "";
        const crumbSelectors = [
          'nav[aria-label*="readcrumb"] li',
          ".breadcrumb li",
          '[class*="breadcrumb"] li',
          '[class*="breadcrumb"] a',
        ];
        const crumbs: string[] = [];
        for (const sel of crumbSelectors) {
          const nodeList = document.querySelectorAll(sel);
          for (let i = 0; i < nodeList.length; i++) {
            const node = nodeList[i] as { textContent: string | null } | null;
            const txt = (node?.textContent?.trim() || "").replace(/\s+/g, " ");
            if (txt) crumbs.push(txt);
          }
          if (crumbs.length > 0) break;
        }
        const isRootCrumb = (c: string) => /^(hktvmall|home|主頁|首页)$/i.test(c);
        const meaningfulCrumbs = crumbs.filter((c) => c && !isRootCrumb(c) && c !== name);
        if (meaningfulCrumbs.length > 0) {
          categoryName = meaningfulCrumbs[meaningfulCrumbs.length - 1];
        }

        return {
          name,
          brand,
          categoryName,
          currentPriceStr,
          originalPriceStr,
          imageUrl,
          isOutOfStock,
          isSpecialPrice,
          promotionTexts: cleanedPromoTexts,
        };
      });

      const currentPrice = parsePrice(data.currentPriceStr);
      const originalPrice = parsePrice(data.originalPriceStr);

      if (!data.name || !currentPrice) return null;

      return {
        name: data.name,
        brand: data.brand || undefined,
        category: data.categoryName || undefined,
        currentPrice,
        originalPrice:
          originalPrice && originalPrice !== currentPrice
            ? originalPrice
            : undefined,
        // HKTVmall cancelled the Plus membership, so new scrapes always
        // carry no Plus price even if the page still renders the section.
        plusPrice: undefined,
        promotionTexts: data.promotionTexts,
        currency: "HKD",
        imageUrl: data.imageUrl || undefined,
        productUrl: fullUrl,
        sku: extractSku(fullUrl),
        inStock: !data.isOutOfStock,
      };
    } catch (err) {
      if (err instanceof ProductUnavailableError) throw err;
      console.error(`Scrape failed for ${fullUrl}:`, err);
      throw new Error(`Failed to scrape ${fullUrl}: ${err}`);
    }
  });
}

const ALGOLIA_APP_ID = "8RN1Y79F02";
const ALGOLIA_API_KEY = "a4a336abc62ab842842a81de642b484a";
const ALGOLIA_INDEX = "hktvProduct";

interface AlgoliaHit {
  code: string;
  nameZh?: string;
  nameEn?: string;
  brandZh?: string;
  brand?: string;
  sellingPrice?: number;
  priceList?: Array<{ originPrice?: number }>;
  savedPrice?: number;
  images?: Array<{ url?: string }>;
  urlZh?: string;
  hasStock?: boolean;
  storeNameZh?: string;
  mainCatNameZh?: string[];
}

export async function searchHKTVMall(
  query: string,
  limit = 10
): Promise<ScrapedProduct[]> {
  try {
    const algoliaUrl = `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries?x-algolia-application-id=${ALGOLIA_APP_ID}&x-algolia-api-key=${ALGOLIA_API_KEY}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PAGE_TIMEOUT);

    const response = await fetch(algoliaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            indexName: ALGOLIA_INDEX,
            params: `query=${encodeURIComponent(query)}&hitsPerPage=${limit}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Algolia API returned ${response.status}`);
    }

    const data = await response.json();
    const hits: AlgoliaHit[] = data.results?.[0]?.hits || [];

    return hits
      .map((hit): ScrapedProduct | null => {
        const name = hit.nameZh || hit.nameEn || "";
        const currentPrice = hit.sellingPrice;
        if (!name || !currentPrice || currentPrice <= 0) return null;

        let originalPrice: number | undefined;
        if (hit.priceList?.[0]?.originPrice && hit.priceList[0].originPrice > currentPrice) {
          originalPrice = hit.priceList[0].originPrice;
        } else if (hit.savedPrice && hit.savedPrice > 0) {
          originalPrice = currentPrice + hit.savedPrice;
        }

        const imageUrl = hit.images?.[0]?.url || undefined;
        const productUrl = `${BASE_URL}/p/${hit.code}`;

        return {
          name,
          brand: hit.brandZh || hit.brand || undefined,
          category: hit.mainCatNameZh?.[0] || "Supermarket",
          currentPrice,
          originalPrice:
            originalPrice && originalPrice !== currentPrice
              ? originalPrice
              : undefined,
          promotionTexts: [],
          currency: "HKD",
          imageUrl,
          productUrl,
          sku: hit.code,
          inStock: hit.hasStock === true,
        };
      })
      .filter((x): x is ScrapedProduct => x !== null);
  } catch (err) {
    console.error(`Search failed for "${query}":`, err);
    throw new Error(`Search failed: ${err}`);
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
