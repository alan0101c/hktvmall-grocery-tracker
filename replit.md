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
- View price history chart per product (recharts line chart)
- Set price alert thresholds per product (bell icon on each card)
- Alerts page: view all active alerts and triggered ones (products currently below threshold)
- Scrape button: triggers a live scrape from HKTVMall supermarket category
- Discount badge shows % off from original price

### DB Tables
- `products` — tracked grocery items with current/original/plus price, brand, category, SKU, promotionTexts (jsonb), etc.
- `price_history` — price snapshots over time per product (includes plusPrice, promotionTexts)
- `alerts` — user-set price thresholds per product
- `product_types` — user-defined categories with unit labels (e.g. "Laundry Detergent" / "ml")

### API Endpoints (all under /api)
- `GET /api/products` — list products (supports ?search, ?category, ?belowAlert)
- `GET /api/products/:id` — product with price history
- `DELETE /api/products/:id` — remove a product
- `GET /api/alerts` — list all alerts
- `POST /api/alerts` — create/update alert { productId, targetPrice }
- `DELETE /api/alerts/:id` — remove alert
- `GET /api/alerts/triggered` — alerts where current price <= target
- `POST /api/scraper/scrape` — scrape HKTVMall { categoryUrl?, maxPages? }
- `GET /api/scraper/categories` — distinct categories from products

### Scraper
- Located at `artifacts/api-server/src/lib/scraper.ts`
- **Product pages**: Uses Playwright headless Chromium to render JS-heavy HKTVMall product pages. Extracts name from `og:title`, price from `div.price`/`.pricelabel`, image from `og:image`. Also captures Plus member price from `.plusPriceSection--bottom span` and all promotion texts from `.promo-name`, `.threshold-promotion-description`, `.promoMsg`, etc.
- **Search**: Uses HKTVMall's public Algolia API (app ID `8RN1Y79F02`, index `hktvProduct`) for fast keyword search — no browser needed.
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
