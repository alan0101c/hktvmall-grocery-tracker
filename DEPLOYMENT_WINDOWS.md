# Deployment Guide — Windows

This guide covers running and deploying the HKTVMall Grocery Price Tracker on a Windows machine.

---

## Prerequisites

Install the following before you begin.

### 1. Node.js (v20 or later)
Download and install from https://nodejs.org (LTS version recommended).

Verify:
```powershell
node --version   # should be v20 or later
npm --version
```

### 2. pnpm (v9 or later)
```powershell
npm install -g pnpm
pnpm --version
```

### 3. PostgreSQL (v14 or later)
Download the installer from https://www.postgresql.org/download/windows/

During installation, note:
- The **port** (default: `5432`)
- The **password** you set for the `postgres` superuser

After installation, create a database for this app:
```powershell
psql -U postgres
```
```sql
CREATE DATABASE grocery_tracker;
\q
```

### 4. Chromium (for price scraping)
The scraper uses a headless browser. Install Playwright's bundled Chromium:
```powershell
npx playwright install chromium
```
This places Chromium in `%USERPROFILE%\AppData\Local\ms-playwright\`.

---

## Setup

### 1. Clone the repository
```powershell
git clone https://github.com/alan0101c/hktvmall-grocery-tracker.git
cd hktvmall-grocery-tracker
```

### 2. Install dependencies
> **Note:** The root `package.json` has a `preinstall` script that calls `sh`. On Windows, run pnpm via **Git Bash** or **WSL**, or install Git for Windows which provides `sh` in `PATH`.

```powershell
pnpm install
```

### 3. Configure environment variables
Create a `.env` file in the **project root** (it is gitignored):

```
# PostgreSQL connection string
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/grocery_tracker

# API server port
PORT=8080

# Path to Chromium (only needed if the auto-detection fails)
# Find yours by running: npx playwright install chromium --dry-run
# CHROMIUM_PATH=C:\Users\YOU\AppData\Local\ms-playwright\chromium-XXXX\chrome-win\chrome.exe
```

> The app reads `DATABASE_URL` at startup and will throw a clear error if it is missing.

### 4. Set up the database schema
Push the Drizzle schema to your PostgreSQL database:
```powershell
$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/grocery_tracker"
pnpm --filter @workspace/db run push
```
This creates all required tables (`products`, `price_history`, `alerts`, `scheduler_settings`).

---

## Running in Development

You need **two terminals** running simultaneously.

### Terminal 1 — API server (port 8080)
```powershell
$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/grocery_tracker"
$env:PORT="8080"
pnpm --filter @workspace/api-server run dev
```

### Terminal 2 — Frontend (port 3000)
```powershell
$env:PORT="3000"
$env:BASE_PATH="/"
pnpm --filter @workspace/grocery-tracker run dev
```

Then open http://localhost:3000 in your browser.

> **Tip:** You can also put the env vars in a `.env` file and load them with a tool like `dotenv-cli`:
> ```powershell
> npm install -g dotenv-cli
> dotenv -- pnpm --filter @workspace/api-server run dev
> ```

---

## Chromium Path on Windows

The scraper calls `which chromium` to find the browser on Linux/macOS. On Windows this will fail and fall back gracefully, but you may see a browser launch error.

**Fix:** Set `CHROMIUM_PATH` to the exact path of `chrome.exe` installed by Playwright:

```powershell
# Find the path
dir "$env:USERPROFILE\AppData\Local\ms-playwright\" -Recurse -Filter "chrome.exe" | Select FullName
```

Then add it to your environment:
```powershell
$env:CHROMIUM_PATH="C:\Users\YOU\AppData\Local\ms-playwright\chromium-XXXX\chrome-win\chrome.exe"
```

Or add the `CHROMIUM_PATH` line to your `.env` file (see step 3 above).

---

## Production Build

### 1. Build all packages
```powershell
$env:DATABASE_URL="..."
pnpm run build
```

This compiles the frontend to `artifacts/grocery-tracker/dist/public/` and bundles the API server to `artifacts/api-server/dist/`.

### 2. Run the production API server
```powershell
$env:NODE_ENV="production"
$env:DATABASE_URL="postgresql://..."
$env:PORT="8080"
node artifacts/api-server/dist/index.js
```

### 3. Serve the frontend
The frontend build output is a folder of static files (`artifacts/grocery-tracker/dist/public/`). In production you can:

- **Serve via the API server** — configure Express to serve the `dist/public` folder as static files (simplest approach for a single-server setup).
- **Use a web server** — serve the folder with Nginx, IIS, or `serve`:
  ```powershell
  npm install -g serve
  serve -s artifacts/grocery-tracker/dist/public -l 3000
  ```

---

## Environment Variable Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | Yes | Port for the API server (e.g. `8080`) or frontend (e.g. `3000`) |
| `BASE_PATH` | Frontend only | URL base path for the frontend — use `/` for root |
| `CHROMIUM_PATH` | No | Absolute path to `chrome.exe` if auto-detection fails |
| `NODE_ENV` | No | Set to `production` for production builds |

---

## Using WSL (Windows Subsystem for Linux)

If you prefer a Linux-like environment, WSL 2 (Ubuntu) removes all Windows-specific friction:

```bash
# In WSL terminal
sudo apt update && sudo apt install -y chromium-browser postgresql
# Then follow the standard Linux setup — no Windows workarounds needed
```

The Replit-hosted version of this app runs on NixOS and is the closest match to WSL.

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `pnpm install` fails on `preinstall` | `sh` not in PATH | Run from Git Bash, or install Git for Windows |
| `DATABASE_URL must be set` error | Missing env var | Check your `.env` file or set `$env:DATABASE_URL` in PowerShell |
| Browser launch failed | Chromium not found | Set `CHROMIUM_PATH` (see Chromium section above) |
| Port already in use | Another process on same port | Change `PORT` to a free port (e.g. `8081`) |
| `psql` not found | PostgreSQL not in PATH | Add `C:\Program Files\PostgreSQL\XX\bin` to System PATH |
