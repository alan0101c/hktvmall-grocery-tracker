# Agent Guide

Read [README.md](README.md) for setup, architecture, active API routes, and product behavior. Use [replit.md](replit.md) only for Replit-specific operation.

## Workspace

This is a pnpm monorepo using TypeScript project references. Use pnpm, not npm or yarn.

- `artifacts/api-server`: Express 5 API, Playwright scraper, refresh service, and in-process scheduler.
- `artifacts/grocery-tracker`: React/Vite frontend; `@/` maps to its `src/` directory.
- `artifacts/mockup-sandbox`: separate UI sandbox, not the production frontend.
- `lib/db`: Drizzle PostgreSQL schema and connection.
- `lib/api-spec`: OpenAPI contract and Orval configuration.
- `lib/api-client-react`: generated frontend API hooks.
- `lib/api-zod`: generated backend validation schemas and shared types.

## Commands

```bash
pnpm run typecheck
pnpm run build
pnpm --filter @workspace/api-server exec tsx --test src/lib/overview.test.ts
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/db run push
```

Run typecheck and relevant tests after changes. Build when changing production code or build configuration. There is no root test script. Do not use `db:push-force` or `push-force` for routine verification.

Development requires `DATABASE_URL`; the API also requires `PORT`. The frontend development server proxies `/api` to port 8080. Normal dev commands do not auto-load `.env`.

## API changes

Treat `lib/api-spec/openapi.yaml` as the HTTP contract source of truth.

1. Update the OpenAPI operation and schemas.
2. Run `pnpm --filter @workspace/api-spec run codegen`.
3. Implement the Express route using generated Zod validators where applicable.
4. Consume generated React Query hooks in the frontend and invalidate affected query keys after mutations.

Never edit `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/` directly; codegen cleans those directories. `lib/api-client-react/src/custom-fetch.ts` is hand-written.

`artifacts/api-server/src/routes/scraper.ts` is legacy and is not mounted by `src/routes/index.ts`. Do not describe its bulk-scrape/category endpoints as active API without deliberately reconnecting and specifying them.

## Domain invariants

Preserve these behaviors when changing pricing or product code:

- Scraped prices and discounts remain raw in PostgreSQL; calculate adjusted prices in responses and comparisons.
- Only product-specific `extraDiscountPercent` applies. Global discounts and `app_settings` were removed.
- Alerts trigger when adjusted price is at or below target.
- With both package quantity and item count, unit price is adjusted price divided by item count. Otherwise divide by package quantity. Do not invent unit conversions.
- Product types own canonical lowercase units. Cross-unit assignment quarantines quantity by clearing it.
- A product-type unit change and its reviewed listing quantities must commit in one transaction.
- Refresh failures retain products and price history. Delisting sets `status='unavailable'`; success restores `active` and clears `lastRefreshError`.
- Every successful product refresh appends a history snapshot, including the frozen per-product discount and stock state.
- `plusPrice` is legacy-only; do not reintroduce Plus-price scraping.

Overview calculations live in `artifacts/api-server/src/lib/overview.ts` and have Node tests in `overview.test.ts`. Product-list calculations currently live in `src/routes/products.ts`; keep their rounding and denominator behavior consistent with overview calculations.

## Scraper and scheduler

The scraper is `artifacts/api-server/src/lib/scraper.ts`. Product pages use a shared Chromium browser; search uses Algolia. Preserve promotion containment deduplication and the deliberate exclusion of rotating cross-sell/carousel labels. Check actual page behavior before changing selectors, and avoid broad live refresh runs when a targeted scrape is sufficient.

The scheduler runs inside each API process. Multiple replicas can duplicate refreshes. Scheduled and manual refreshes share `refreshService.ts` and process products sequentially.

Close Chromium through the existing shutdown path when changing server lifecycle code.

## Database and documentation

Schema definitions are under `lib/db/src/schema/`. Use ordinary drizzle-kit push for intentional local schema application; review potentially destructive changes rather than forcing them.

Keep README, OpenAPI descriptions, and this guide synchronized with behavior changes. In particular, do not revive removed global-settings or active bulk-scraper documentation from older revisions.

Do not read or commit secrets. `.env` and `import.sh` may contain local database credentials and are gitignored.
