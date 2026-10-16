# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

**GitHub**: https://github.com/alan0101c/hktvmall-grocery-tracker

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── grocery-tracker/    # React + Vite frontend (HKTVMall Price Tracker)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
└── ...
```

## App: HKTVMall Grocery Price Tracker

A full-stack grocery price tracking app for HKTVMall (https://www.hktvmall.com/hktv/zh/supermarket).

### Features
- Browse tracked grocery products with search, category filter, and price-drop filter
- Products removed from HKTVmall are flagged "No longer available" (status='unavailable') on refresh — record and price history are kept; they flip back to active automatically if the product returns
- Within each category, products are ordered by per-item cost (pricePerUnit, cheapest first); alert-hit products stay pinned at the top and items without a unit price sort last
- View price history chart per product (recharts line chart)
- Set price alert thresholds per product (bell icon on each card)
- Alerts page: view all active alerts and triggered ones (products currently below threshold)
- Scrape button: triggers a live scrape from HKTVMall supermarket category
- Discount badge shows % off from original price

### DB Tables
- `products` — tracked grocery items with current/original price, brand, category, SKU, promotionTexts (jsonb), etc. (plusPrice column kept but deprecated — HKTVmall cancelled Plus; always null for new scrapes). Also `status` ('active' | 'unavailable') and `last_refresh_error` — set when a refresh can no longer parse the product page (delisted from HKTVmall) or otherwise fails; the row is never deleted, prices stay at last known values
- `price_history` — price snapshots over time per product (includes deprecated plusPrice, promotionTexts)
- `alerts` — user-set price thresholds per product
- `product_types` — user-defined categories with unit labels (e.g. "Laundry Detergent" / "ml"). The category owns the canonical unit (stored lowercase): it is adopted when a product is assigned, comparison is case-insensitive, and a product moved to a different-unit category gets its quantity cleared (quarantined) so no wrong per-unit price is ever shown. Changing a category's unit is only possible via the category edit dialog, which submits the reviewed member quantities in the same atomic PATCH (unit + quantities land together)
- `app_settings` — single-row app-wide settings (id=1): `globalDiscountPercent` models sitewide promotions (e.g. 全場85折); displayed prices, unit prices and alert triggers use the adjusted price, scraped data stays untouched

### API Endpoints (all under /api)
- `GET /api/products` — list products (supports ?search, ?category, ?belowAlert); each product includes `status` and `lastRefreshError`
- `GET /api/products/:id` — product with price history
- `POST /api/products/track` — track a product by HKTVMall URL (400 with clear message if the product is no longer available)
- `POST /api/products/refresh` — refresh all products; returns `{ refreshed, failed, unavailable, priceDrops, errors }`
- `POST /api/products/:id/refresh` — refresh one product
- `DELETE /api/products/:id` — remove a product
- `GET /api/alerts` — list all alerts
- `POST /api/alerts` — create/update alert { productId, targetPrice }
- `DELETE /api/alerts/:id` — remove alert
- `GET /api/alerts/triggered` — alerts where current price <= target
- `POST /api/scraper/scrape` — scrape HKTVMall { categoryUrl?, maxPages? }
- `GET /api/scraper/categories` — distinct categories from products
- `GET /api/settings` — app-wide settings (globalDiscountPercent)
- `PUT /api/settings` — update global discount { globalDiscountPercent } (0–100)

### Scraper
- Located at `artifacts/api-server/src/lib/scraper.ts`
- **Product pages**: Uses Playwright headless Chromium to render JS-heavy HKTVMall product pages. Extracts name from `og:title`, price from `div.price`/`.pricelabel`, image from `og:image`. Captures product-level promotion texts from `.promo-name`, `.promoMsg`, and multi-buy selectors only — deliberately excluding `.threshold-promotion-description` (duplicated concatenations) and `.promotionLabel`/promotion-tag selectors (rotating cross-sell carousel that made label walls grow), with a containment dedupe as a safety net. (Plus member price parsing was removed — HKTVmall cancelled the membership; the column remains for legacy data.)
- **Search**: Uses HKTVMall's public Algolia API (app ID `8RN1Y79F02`, index `hktvProduct`) for fast keyword search — no browser needed.
- **Delisted products**: Throws `ProductUnavailableError` when a product page returns 404/410, redirects away from the `/p/` product path, or renders product-not-found content (找不到/已下架) with no price markup. `refreshService` catches it to flag the product `status='unavailable'` (record kept); a later successful scrape flips it back to `active`.
- **Browser singleton**: A single Chromium instance is reused across scrape calls; gracefully closed on SIGTERM/SIGINT.
- **System dep**: Chromium installed via Nix (`installSystemDependencies`). The scraper resolves the path at runtime via `which chromium`. For custom paths, set `CHROMIUM_PATH` env var.

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)
Express 5 API server. Routes: health, products, alerts, scraper.
Depends on: `@workspace/db`, `@workspace/api-zod`, playwright-core

### `artifacts/grocery-tracker` (`@workspace/grocery-tracker`)
React + Vite frontend. Uses React Query hooks from `@workspace/api-client-react`.
Packages: recharts, framer-motion, lucide-react, date-fns, wouter

### `lib/db` (`@workspace/db`)
Database layer. Tables: products, price_history, alerts.

### `lib/api-spec` (`@workspace/api-spec`)
OpenAPI 3.1 spec. Run codegen: `pnpm --filter @workspace/api-spec run codegen`
