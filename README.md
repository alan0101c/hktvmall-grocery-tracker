# HKTVMall Grocery Price Tracker

A full-stack TypeScript app for tracking HKTVMall grocery prices, comparing products by unit cost, reviewing price history, and setting price alerts.

## Features

- Search HKTVMall and track products by URL or search result.
- Refresh one product or the entire watchlist, manually or on a configurable schedule.
- View current and historical unit-price summaries by product type.
- Compare products using package quantity and item count.
- Record price, promotion, discount, and stock snapshots over time.
- Set one target-price alert per product and view triggered alerts.
- Apply product-specific campaign discounts parsed from HKTVMall price tags.
- Keep delisted products and their history, marking them unavailable until a successful refresh makes them active again.
- Organize product types with slash-separated hierarchical names.

## Stack

- Node.js 24 and pnpm workspaces
- React 19, Vite 7, Tailwind CSS 4, TanStack Query, and Wouter
- Express 5
- PostgreSQL, Drizzle ORM, and drizzle-kit
- OpenAPI 3.1 and Orval-generated React Query hooks and Zod schemas
- Playwright Chromium for product-page scraping
- HKTVMall's public Algolia API for product search

## Repository layout

```text
artifacts/
  api-server/          Express API, scraper, refresh service, and scheduler
  grocery-tracker/     React frontend
  mockup-sandbox/      Independent UI mockup sandbox
lib/
  api-spec/            OpenAPI contract and Orval configuration
  api-client-react/    Generated React Query client
  api-zod/             Generated Zod schemas and types
  db/                  Drizzle schema and PostgreSQL connection
scripts/               Workspace utility scripts
```

## Prerequisites

- Node.js 24
- pnpm
- PostgreSQL 14 or later
- Chromium, available on `PATH` or through `CHROMIUM_PATH`

For Windows-specific setup, see [DEPLOYMENT_WINDOWS.md](DEPLOYMENT_WINDOWS.md).

## Setup

Install dependencies:

```bash
pnpm install
```

Create a PostgreSQL database and provide its connection string:

```bash
export DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/grocery_tracker"
```

Apply the Drizzle schema:

```bash
pnpm --filter @workspace/db run push
```

Avoid `push-force` for routine setup; it allows drizzle-kit to force through schema changes that may require closer review.

## Development

Start the API in one terminal:

```bash
export DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/grocery_tracker"
export PORT=8080
pnpm --filter @workspace/api-server run dev
```

Start the frontend in another:

```bash
export PORT=3000
export BASE_PATH=/
pnpm --filter @workspace/grocery-tracker run dev
```

Open <http://localhost:3000>. Vite proxies `/api` requests to `http://localhost:8080`.

The normal package commands do not load `.env` automatically. Export variables in the shell or use your preferred environment loader. `redeploy.sh` does load the root `.env` file.

### Environment variables

| Variable | Used by | Required | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | API, schema tools | Yes | PostgreSQL connection string |
| `PORT` | API, frontend | API: yes; frontend: defaults to `7100` | HTTP listen port |
| `BASE_PATH` | Frontend | No | Vite base URL; defaults to `/` |
| `CHROMIUM_PATH` | Scraper | No | Explicit Chromium executable path when auto-detection fails |
| `FRONTEND_PORT` | `redeploy.sh` | No | Frontend preview port; defaults to `3000` |
| `NODE_ENV` | API, frontend | No | Set to `production` for production processes |

## Verification

Run the workspace typecheck and production builds:

```bash
pnpm run typecheck
pnpm run build
```

Run the existing overview unit tests:

```bash
pnpm --filter @workspace/api-server exec tsx --test src/lib/overview.test.ts
```

There is currently no root `test` script.

## Production

Build all packages with `pnpm run build`. Outputs are:

- API: `artifacts/api-server/dist/index.cjs`
- Frontend: `artifacts/grocery-tracker/dist/public/`

Run the API:

```bash
NODE_ENV=production PORT=8080 DATABASE_URL="postgresql://..." \
  node artifacts/api-server/dist/index.cjs
```

Serve the frontend separately, for example:

```bash
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/grocery-tracker run serve
```

On macOS or Linux, `./redeploy.sh` installs dependencies, pushes the database schema, builds the API and frontend, and restarts both on ports 8080 and 3000. Use `./redeploy.sh --build-only` to skip restarts or `./redeploy.sh --no-db` to skip the schema push. Runtime logs and PID files are written to `logs/`.

## API

All active routes are under `/api`. The OpenAPI source of truth is [`lib/api-spec/openapi.yaml`](lib/api-spec/openapi.yaml).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/healthz` | Health check |
| GET | `/products` | List tracked products; supports `search` and `belowAlert` |
| GET | `/products/overview` | Current cheapest and historical-low unit prices per product type |
| GET | `/products/search?q=...` | Search HKTVMall through Algolia |
| POST | `/products/track` | Track or re-track a product by HKTVMall URL |
| POST | `/products/refresh` | Refresh every tracked product sequentially |
| GET | `/products/:id` | Get a product and its price history |
| POST | `/products/:id/refresh` | Refresh one product |
| PUT | `/products/:id/unit` | Update product-type and quantity metadata |
| DELETE | `/products/:id` | Delete a product and its dependent history/alerts |
| GET, POST | `/product-types` | List or create product types |
| PATCH, DELETE | `/product-types/:id` | Update or delete a product type |
| GET, POST | `/alerts` | List alerts or replace a product's alert |
| DELETE | `/alerts/:id` | Delete an alert |
| GET | `/alerts/triggered` | List alerts whose adjusted price meets the target |
| GET, PUT | `/scheduler` | Read or update scheduled refresh settings |

After changing the OpenAPI contract, regenerate both clients:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Do not edit files under `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/` directly.

## Pricing and category rules

- `currentPrice` stores the scraped listed price. `adjustedPrice` applies the product's own scraped extra-discount campaign, when present.
- The former app-wide global discount and `app_settings` table no longer exist.
- Alerts compare the adjusted price with the target price.
- Unit price uses `adjustedPrice / itemCount` when both package quantity and item count are present; otherwise it uses `adjustedPrice / packageQuantity`. Missing or invalid quantity metadata produces no unit price.
- A product type owns the canonical unit, stored trimmed and lowercase. Unit comparison is case-insensitive.
- Moving a product to a type with a different unit clears its package quantity rather than displaying a potentially incorrect conversion.
- Changing a product type's unit requires reviewed member listing quantities in the same atomic PATCH transaction.
- Successful refreshes append price-history snapshots. Unavailable products retain their last known prices and history.

`plusPrice` remains in the schema and API for legacy data, but HKTVmall Plus pricing is deprecated and new scrapes do not populate it.

## Scraping and scheduling

Product pages are rendered with a shared headless Chromium instance. The scraper extracts product details, stock, promotions, and product-specific extra discounts. Search uses Algolia without launching a browser.

A failed refresh records `lastRefreshError`. HTTP 404/410, redirects away from the product page, or product-not-found content can mark a product unavailable without deleting it. A later successful scrape restores active status.

The scheduler runs inside the API process using `node-cron`. It creates default settings on first use (enabled, every six hours), persists run metadata in PostgreSQL, and can be configured from the Watchlist page. Running multiple API replicas can therefore trigger duplicate scheduled refreshes.

## Replit

Replit-specific configuration remains in [`.replit`](.replit) and [replit.md](replit.md). Coding-agent conventions are in [AGENTS.md](AGENTS.md).
