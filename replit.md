# Replit Workspace

This file contains only Replit-specific notes. See [README.md](README.md) for the current application architecture, features, setup, API, and deployment instructions. Coding agents should also read [AGENTS.md](AGENTS.md).

**GitHub**: https://github.com/alan0101c/hktvmall-grocery-tracker

## Environment

`.replit` configures:

- Node.js 24 and PostgreSQL 16 modules
- Chromium through Nix
- The pnpm workspace agent stack
- Autoscale deployment and the application router
- `scripts/post-merge.sh` after merges

The scraper auto-detects Chromium. Set `CHROMIUM_PATH` only when auto-detection does not find the installed executable.

## Local helper scripts

- `./run_api_server.sh` loads the gitignored `import.sh`, sets `PORT=8080`, and starts the Express development server.
- `./run_frontend.sh` sets `PORT=3000` and `BASE_PATH=/`, then starts Vite.
- `./redeploy.sh` loads root `.env` or the database URL from `import.sh`, installs dependencies, pushes the Drizzle schema, builds the API and frontend, and restarts both preview services. Logs and PID files go to `logs/`.

`import.sh`, `.env`, and `logs/` are local-only and gitignored. Do not commit credentials or runtime logs.

The production API entry point is `artifacts/api-server/dist/index.cjs`; the frontend build is `artifacts/grocery-tracker/dist/public/`.
