import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { execSync } from "child_process";

export interface ScrapedProduct {
  name: string;
  nameZh?: string;
  brand?: string;
  category?: string;
  currentPrice: number;
  originalPrice?: number;
  promotionText?: string;
  currency: string;
  imageUrl?: string;
  productUrl: string;
  sku?: string;
  inStock: boolean;
}

const BASE_URL = "https://www.hktvmall.com";
const PAGE_TIMEOUT = 15_000;

let browserInstance: Browser | null = null;
let chromiumPath: string | null = null;

function getChromiumPath(): string {
  if (chromiumPath) return chromiumPath;
  if (process.env.CHROMIUM_PATH) {
    chromiumPath = process.env.CHROMIUM_PATH;
    return chromiumPath;
  }
  try {
    chromiumPath = execSync("which chromium", { encoding: "utf-8" }).trim();
  } catch {
    chromiumPath = "/usr/bin/chromium";
  }
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
      await page.goto(fullUrl, {
        waitUntil: "domcontentloaded",
        timeout: PAGE_TIMEOUT,
      });

      await page.waitForSelector("div.price, .pricelabel, .priceTypeText", {
        timeout: PAGE_TIMEOUT,
      });

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

        const isOutOfStock = !!document.querySelector(
          '[class*="out-of-stock"], [class*="outOfStock"], [class*="sold-out"], [class*="soldOut"], [class*="unavailable"], .addToCartDisabled'
        );

        // Detect promotion text (multi-buy deals like "兩件半價 | 平均1件$21")
        const promoSelectors = [
          ".multi-buy-promotion",
          ".promotionLabel",
          ".promotion-label",
          "[class*='multi-buy']",
          "[class*='multibuy']",
          "[class*='promotion-tag']",
          "[class*='promotionTag']",
          "[class*='promo-label']",
          "[class*='promoLabel']",
        ];
        let promotionText = "";
        for (const sel of promoSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const txt = el.textContent?.trim() || "";
            if (txt.length > 0 && txt.length < 200) {
              promotionText = txt;
              break;
            }
          }
        }

        return {
          name,
          brand,
          currentPriceStr,
          originalPriceStr,
          imageUrl,
          isOutOfStock,
          isSpecialPrice,
          promotionText,
        };
      });

      const currentPrice = parsePrice(data.currentPriceStr);
      const originalPrice = parsePrice(data.originalPriceStr);

      if (!data.name || !currentPrice) return null;

      return {
        name: data.name,
        brand: data.brand || undefined,
        category: "Supermarket",
        currentPrice,
        originalPrice:
          originalPrice && originalPrice !== currentPrice
            ? originalPrice
            : undefined,
        promotionText: data.promotionText || undefined,
        currency: "HKD",
        imageUrl: data.imageUrl || undefined,
        productUrl: fullUrl,
        sku: extractSku(fullUrl),
        inStock: !data.isOutOfStock,
      };
    } catch (err) {
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
          currency: "HKD",
          imageUrl,
          productUrl,
          sku: hit.code,
          inStock: hit.hasStock ?? true,
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
