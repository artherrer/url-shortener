# URL Shortener (Cloudflare Workers + D1 + React)

> **Development Time Window:**
> - **Start:** 2026-10-08 10:53:58 -0600 (Scaffold Commit `28216f2`)
> - **End:** 2026-10-08 11:53:31 -0600 (Final Testing Commit `029eab7`)
> - **Total Active Duration:** ~59 minutes 33 seconds

A high-performance, serverless full-stack URL shortener built on **Cloudflare Workers**, **Cloudflare D1 (serverless SQLite)**, and a modern frontend using **React 19**, **Vite**, and **Tailwind CSS v4**.

---

## Session Evidence & AI Collaboration

- **AI Development Notes:** [`AI_NOTES.md`](./AI_NOTES.md) (covers tool usage, key prompts, bugs caught, and resolutions).
- **Session Chat History:** Full export available in [`claude_history.txt`](./claude_history.txt) and root session transcripts.
- **Git Commit History:** 7 granular, non-squashed commits with original timestamps demonstrating the iterative development process from initial scaffold to unit tests.

---

## Prerequisites

- [Node.js](https://nodejs.org/) (version 20+ recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (installed automatically as devDependency)

---

## Installation & Setup

1. **Clone the repository and enter the directory:**
   ```bash
   git clone <repository-url>
   cd url-shortener
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Apply Database Migrations (Cloudflare D1):**
   - For local development with simulated D1 database:
     ```bash
     npm run d1:migrate:local
     ```
   - For remote Cloudflare environment:
     ```bash
     npm run d1:migrate:remote
     ```

---

## Running the Application

This is a full-stack project with two services running concurrently during local development:

### 1. Start Cloudflare Worker (Backend API)
Runs the serverless worker locally with D1 binding support on port `8787`:
```bash
npm run dev
# or
npm start
```
*Backend runs at `http://localhost:8787`*

### 2. Start React SPA (Frontend Client)
Runs the Vite development server with hot reload and automated `/api` proxying:
```bash
npm run client:dev
```
*Frontend runs at `http://localhost:5173`*

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Runs Cloudflare Worker locally via Wrangler on port 8787 |
| `npm run client:dev` | Runs Vite frontend dev server on port 5173 |
| `npm run client:build` | Compiles the React + Tailwind application into `dist/client` |
| `npm run client:preview` | Previews the production frontend build locally |
| `npm run deploy` | Deploys Cloudflare Worker to production edge network |
| `npm test` | Runs test suite in watch mode |
| `npm test -- --run` | Executes all unit and integration tests once (Vitest, 22 test cases) |
| `npm run cf-typegen` | Generates TypeScript definitions for Cloudflare bindings |
| `npm run d1:migrate:local` | Applies SQL migrations to local SQLite D1 storage |
| `npm run d1:migrate:remote` | Applies SQL migrations to remote Cloudflare D1 database |

---

## Architecture & Code Structure

```
├── migrations/                     # Cloudflare D1 SQLite database migrations
│   ├── 0001_create_urls_table.sql  # URLs table with indices
│   └── 0002_create_analytics_table.sql # Visitor logs table
├── src/
│   ├── index.ts                    # Cloudflare Worker API & UrlShortenerService
│   └── client/                     # Frontend Single Page Application
│       ├── components/
│       │   ├── AnalyticsModal.tsx  # Visitor logs and click stats modal
│       │   ├── QrCodeDisplay.tsx   # Sharp QR generator & PNG downloader
│       │   └── UrlForm.tsx         # URL shortening form with client validation
│       ├── services/
│       │   └── api.ts              # Typed fetch client for /api endpoints
│       ├── types.ts                # Shared client-side interfaces
│       ├── App.tsx                 # Main layout and view coordination
│       ├── index.css               # Tailwind CSS v4 entry point
│       └── main.tsx                # React DOM root mounting
├── test/
│   └── index.spec.ts               # Vitest integration tests (22 test cases)
├── AI_NOTES.md                     # Detailed AI collaboration reflection
├── CLAUDE.md                       # Repository instructions for AI assistants
├── vite.config.ts                  # Vite + React + Tailwind v4 + Proxy config
├── vitest.config.mts               # Cloudflare Vitest plugin setup
├── wrangler.jsonc                  # Cloudflare Worker & D1 binding configuration
└── tsconfig.json                   # TypeScript compiler options
```

---

## Features & Justifications

### 1. Serverless Edge Computing with Cloudflare Workers & D1
- **What it does:** Executes URL redirection and API requests globally at the edge with millisecond latency, backed by Cloudflare D1 distributed SQLite.
- **Justification:** Eliminates central server bottlenecks, provides automatic global scaling, minimizes redirection latency for users worldwide, and reduces operational hosting costs to near zero.

### 2. Temporary Redirection (`302 Found`)
- **What it does:** Uses HTTP `302 Found` instead of `301 Moved Permanently`.
- **Justification:** Prevents browsers and intermediaries from permanently caching the destination. This guarantees that every visit passes through the Worker, ensuring 100% accurate click tracking, active status enforcement, and visitor analytics logging.

### 3. Customizable Link Lifetime (`expiresIn`)
- **What it does:** Allows configuring URL expiration (defaults to 24 hours / `86,400,000` ms, customizable to 1 hour, 7 days, 30 days, or custom milliseconds).
- **Justification:** Provides ephemeral link capabilities for time-sensitive promotions, temporary files, and security-critical shares without cluttering the database indefinitely.

### 4. Custom Aliases
- **What it does:** Enables choosing custom, readable short paths (e.g., `/:my-custom-promo`) alongside randomly generated 6-character codes.
- **Justification:** Improves link trust, brand recognition, and click-through rates on social platforms and marketing materials. Enforces uniqueness with `409 Conflict` checks and guards against reserved route names.

### 5. Content-Negotiated Error Pages & Inspection API
- **What it does:** Validates short codes via `GET /api/validate/:code` returning clean JSON for frontend previews, and renders responsive dark-mode HTML pages (`404 Not Found`, `410 Link Expired`, `410 Link Inactive`) for browser visitors.
- **Justification:** Solves the W3C fetch `opaqueredirect` limitation in single-page apps while giving direct browser visitors a polished, informative error experience with a one-click return to the home screen.

### 6. Visitor Analytics Logging
- **What it does:** Captures visit timestamps (`visited_at`) and client signatures (`User-Agent`) on each redirect visit, exposed via `GET /api/analytics/:code` and rendered in a detailed modal.
- **Justification:** Gives link creators actionable insights into campaign traffic, peak access times, and visitor platforms (browsers, mobile devices, API bots).

### 7. Instant QR Code Generation & PNG Download
- **What it does:** Generates high-density QR codes for every shortened URL directly in the browser with 1-click PNG export.
- **Justification:** Bridges physical-to-digital workflows (print flyers, presentations, packaging, mobile scanning) without requiring third-party QR generation APIs.

---

## Upcoming Features Roadmap (What to Build Next With More Time)

### 1. Bulk URL Creation
- **Feature Description:**
  An interface and API endpoint (`POST /api/shorten/bulk`) capable of ingesting batch URL lists via CSV upload or multi-line text input, generating shortened links, custom aliases, and downloadable CSV/JSON exports in a single transaction.
- **Justification:**
  Marketing, enterprise, and operations teams frequently need to shorten dozens or hundreds of URLs simultaneously for SMS campaigns, newsletters, and catalog links. Creating them one by one is inefficient; batch processing significantly improves workflow throughput and leverages D1 batch statements (`db.batch([...])`) for transactional consistency.

### 2. Geographic & Device Analytics
- **Feature Description:**
  Enhancing the analytics engine by extracting Cloudflare edge request properties (`request.cf` object: country, city, continent, ASN) alongside sophisticated User-Agent parsing (Device Type: Mobile/Tablet/Desktop, OS: iOS/Android/macOS/Windows, Browser Family). The frontend will feature visual geographic maps and platform distribution donut charts.
- **Justification:**
  Basic User-Agent strings provide limited business intelligence. Utilizing Cloudflare's native edge geo-headers adds zero-latency geolocation without expensive third-party IP lookup services, empowering users to understand target audience demographics, regional engagement, and device optimization requirements.
