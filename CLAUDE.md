# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development & Server
- **Run Cloudflare Worker locally**: `npm run dev` or `npm start` (runs `wrangler dev` on port 8787)
- **Run Frontend React dev server**: `npm run client:dev` (runs Vite on port 5173 with proxy `/api` -> `http://localhost:8787`)
- **Build Frontend**: `npm run client:build` (builds SPA to `dist/client`)
- **Preview Frontend build**: `npm run client:preview`
- **Deploy Worker to Cloudflare**: `npm run deploy` (`wrangler deploy`)
- **Generate Cloudflare Worker Types**: `npm run cf-typegen` (`wrangler types`)

### Testing & Verification
- **Run all tests**: `npm test -- --run`
- **Run tests in watch mode**: `npm test`
- **Run a single test file**: `npx vitest run test/index.spec.ts`
- **Run matching tests by pattern**: `npx vitest run -t "Custom Aliases"`
- **TypeScript Typecheck**: `npx tsc --noEmit`

### Database Migrations (Cloudflare D1)
- **Apply migrations locally**: `npm run d1:migrate:local`
- **Apply migrations to remote Cloudflare D1**: `npm run d1:migrate:remote`

---

## Architecture & Structure

This repository is a full-stack URL shortener hosted on Cloudflare Workers and Cloudflare D1 with a React + Tailwind CSS single-page application.

### Backend (Cloudflare Worker & D1)
- **Entry point**: `src/index.ts`
  - Routes:
    - `POST /api/shorten`: Shortens a candidate URL. Accepts `{ url, expiresIn?, alias? }`. Defaults `expiresIn` to 24h (`86400000` ms). Validates URL protocol (`http:`/`https:`), length (<= 2048 chars), and hostname. Validates optional custom aliases (3–50 chars, alphanumeric with `-` and `_`, non-reserved). Returns status `201` on success, `409` if alias is duplicated, `400` on validation errors.
    - `GET /api/links`: Returns all saved URLs with `code`, `shortUrl`, `originalUrl`, `clicks`, `expiresIn` (calculated remaining ms), and `active` status.
    - `GET /api/validate/:code`: Non-destructive inspection endpoint for UI preview / validator. Returns JSON inspection data (status 302, 404, or 410 with `reason: "inactive" | "expired"`) avoiding browser opaque redirect limits (`status: 0`).
    - `GET /api/analytics/:code`: Retrieves click count and visitor logs (`userAgent` and `visitedAt`).
    - `GET /:code`: Direct redirection route. Executes redirect (`302 Found` with `Location` header to avoid permanent caching) and records click count + visitor analytics (`User-Agent`, `visited_at`). If link is missing (404) or inactive/expired (410), serves content-negotiated JSON (for API) or responsive dark-mode HTML error page (for browser) with a return button pointing to the frontend root.
    - `OPTIONS *`: CORS preflight handling.
- **In-Memory & D1 Dual-Store**:
  `UrlShortenerService` contains an in-memory fallback cache alongside prepared D1 database queries, ensuring that unit tests and environments without active D1 bindings execute smoothly.
- **D1 Schema & Migrations** (`migrations/`):
  - `urls`: `id`, `code` (unique), `original_url`, `clicks`, `created_at`, `expires_at`, `active`.
  - `url_analytics`: `id`, `code`, `user_agent`, `visited_at`.

### Frontend (React 19 + Tailwind CSS v4 + Vite)
- **Root**: `src/client/`
- **Configuration**: Root-level `vite.config.ts` points `root` to `src/client` and proxies `/api` to `http://localhost:8787`.
- **Styling**: Tailwind CSS v4 using `@import "tailwindcss";` in `src/client/index.css`.
- **Components**:
  - `src/client/App.tsx`: Main dashboard layout coordinating shortener form, redirection status checker, saved URLs table, and analytics modal.
  - `src/client/components/UrlForm.tsx`: Creation form with client-side URL validation, custom alias input, preset & custom `expiresIn` dropdown, and immediate QR code display.
  - `src/client/components/QrCodeDisplay.tsx`: High-resolution canvas/image QR generator using `qrcode`, supporting 1-click PNG download.
  - `src/client/components/AnalyticsModal.tsx`: Visitor logs breakdown and click counter.
  - `src/client/services/api.ts`: Typed fetch client for backend endpoints.
