# kinoe-web — Build Guide

A private trading platform for naked forex/CFD price action. Tracks signals, journals trades, grades entries with AI, and builds a data set for future bot training. Designed as a single-user tool — one password, no user accounts.

---

## What it does

| Section | What it is |
|---|---|
| **Terminal** | Home dashboard — TradingView chart + live signal scan result |
| **Charts** | Full-screen TradingView Advanced Chart with 6-pair quick switcher and drawing tools |
| **Signals** | Rule-based market scanner (EUR/USD, GBP/USD, XAU/USD on H4). Detects Kangaroo Tail, Big Shadow, Inside Bar. Scores confidence, calculates trade plans. Claude summarises findings — never invents values. |
| **Journal** | Manual and agent-logged trade entries. AI grades each entry on process, risk, and thesis quality. |
| **Settings** | OANDA account status, AI spend, journal stats, env var health check. |

---

## Tech stack

| Layer | Tool |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Database | Neon Postgres (serverless) |
| Broker data | OANDA REST API v3 |
| AI — signals | Anthropic (`claude-sonnet-4-6` default, configurable) |
| AI — journal grader | Anthropic or OpenAI (configurable per call) |
| Charts | TradingView Lightweight/Advanced Widget (CDN embed) |
| Deployment | Vercel |
| Auth | Single-password HMAC-signed cookie (no third-party auth) |

---

## Accounts you need

1. **Vercel** — free tier works. Used for hosting and environment variables.
2. **Neon** — free tier works. Serverless Postgres. Get the `DATABASE_URL` (pooled connection string).
3. **OANDA** — practice account is free. Get an API key from your account portal. Practice and live use different base URLs (handled automatically).
4. **Anthropic API** — pay-as-you-go. Used for signal summaries and journal grading. ~$0.01 per scan, ~$0.01–0.05 per journal grade.
5. **OpenAI API** _(optional)_ — alternative AI provider for journal grading only.

---

## Environment variables

Set all of these in Vercel → Project → Settings → Environment Variables (and in `.env.local` for local dev).

| Variable | Required | Description |
|---|---|---|
| `SITE_PASSWORD` | ✅ | The login password. Pick anything strong. |
| `SITE_AUTH_SECRET` | ✅ | Secret for signing auth cookies. Generate with `openssl rand -hex 32`. |
| `DATABASE_URL` | ✅ | Neon Postgres connection string (pooled). Starts with `postgresql://`. |
| `OANDA_API_KEY` | ✅ | OANDA personal access token from your account portal. |
| `OANDA_ACCOUNT_ID` | ✅ | Your OANDA account number (e.g. `101-001-1234567-001`). |
| `OANDA_ACCOUNT_TYPE` | ✅ | `practice` or `live`. Controls which OANDA base URL is used. |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key for signal summaries and journal grading. |
| `OPENAI_API_KEY` | ⬜ | OpenAI API key. Only needed if you want to grade journal entries with GPT. |
| `AI_MODEL_SCANNER` | ⬜ | Override the signal scanner model. Defaults to `claude-sonnet-4-6`. |
| `AI_SKIP` | ⬜ | Set to `true` in `.env.local` only. Skips AI call during local testing — zero cost. Never set on Vercel. |
| `MIGRATE_TOKEN` | ⬜ | Secret token to protect the `/api/db/migrate` endpoint. Only needed if you run migrations via HTTP instead of CLI. |

### Generating secrets locally

```bash
# SITE_AUTH_SECRET
openssl rand -hex 32

# SITE_PASSWORD — just pick a strong password string
```

---

## Local development setup

```bash
# 1. Clone the repo
git clone https://github.com/your-org/kinoe-web.git
cd kinoe-web

# 2. Install dependencies
npm install

# 3. Create .env.local (never committed)
cp .env.example .env.local   # or create from scratch — see variables above
# Fill in all required variables

# 4. Run database migration
npx tsx lib/db/migrate.ts

# 5. Start dev server
npm run dev
# Opens on http://localhost:3000
```

---

## Database setup

The schema lives in [`lib/db/schema.sql`](lib/db/schema.sql). Run the migration script once after creating your Neon database:

```bash
DATABASE_URL="postgresql://..." npx tsx lib/db/migrate.ts
```

The script is idempotent — every `CREATE` uses `IF NOT EXISTS`. Safe to re-run.

### Tables

**`journal_entries`** — one row per trade

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `pair` | TEXT | e.g. `EUR_USD` |
| `timeframe` | TEXT | e.g. `H4` |
| `direction` | TEXT | `LONG` or `SHORT` |
| `setup_type` | TEXT | `Kangaroo Tail`, `Big Shadow`, `Inside Bar` |
| `entry_price` | NUMERIC | |
| `stop_loss` | NUMERIC | |
| `take_profit` | NUMERIC | |
| `risk_reward` | NUMERIC | |
| `outcome` | TEXT | `WIN`, `LOSS`, `BE`, `OPEN`, `CANCELLED` |
| `r_multiple` | NUMERIC | Actual R result |
| `thesis_md` | TEXT | Pre-trade thesis (Markdown) |
| `review_md` | TEXT | Post-trade review (Markdown) |
| `emotion_tags` | TEXT[] | e.g. `["fomo","patient"]` |
| `mistake_tags` | TEXT[] | e.g. `["early_entry"]` |
| `lesson_tags` | TEXT[] | |
| `ai_grade` | TEXT | A / B / C / D / F |
| `ai_score` | INT | 0–100 |
| `ai_review_md` | TEXT | AI-generated critique |
| `source` | TEXT | `manual` or `agent_signal` |

**`backtests`** — future use, table is created but not yet wired to UI.

**`ai_analyses`** — audit log of every AI call. Stores prompt, response, token counts, and cost. Used by Settings page to show all-time AI spend. Will feed bot training data later.

---

## Auth system

Single-password, no user accounts. All pages except `/login` and `/api/auth/login` are protected by the middleware in [`proxy.ts`](proxy.ts).

**How it works:**
1. User submits password at `/login`
2. Server compares against `SITE_PASSWORD` env var
3. On match, signs a token `v1:<expiresAt>` using HMAC-SHA256 with `SITE_AUTH_SECRET`
4. Cookie `kinoe_auth` is set with 30-day TTL
5. `proxy.ts` verifies the cookie signature and expiry on every request
6. Unauthenticated API requests get `401 JSON`. Unauthenticated page requests redirect to `/login?next=<path>`.

**Why `proxy.ts` not `middleware.ts`:**
Next.js 16 silently ignores `middleware.ts` exports not named `middleware`. The auth gate is exported as `proxy` from `proxy.ts` and referenced correctly — this is the fix for the Next.js 16 breaking change.

---

## Signals engine

The scanner runs in two strict phases. AI cannot invent values.

### Phase 1 — Rule engine (`lib/signals/detection.ts`)

Called for each pair with 100 H4 candles + 50 D1 candles from OANDA. Returns a `PairAnalysisResult` with:

| Field | Description |
|---|---|
| `higherTimeframeBias` | D1 directional bias: `BULLISH`, `BEARISH`, `NEUTRAL` |
| `executionTimeframeBias` | H4 directional bias |
| `marketState` | `TRENDING`, `RANGING`, `BREAKOUT`, `REVERSAL` |
| `setupDetected` | Boolean — any valid pattern on the latest candle |
| `setupType` | `Kangaroo Tail`, `Big Shadow`, `Inside Bar`, or null |
| `keyLevels` | Up to 6 swing levels, each with `strengthScore` (0–100) and `reason` |
| `confidenceScore` | 0–100 composite score (see algorithm below) |
| `tradeStatus` | `TRADE_READY`, `WATCHLIST`, `NO_TRADE`, `AVOID` |
| `blockers` | List of reasons why this is not a clean trade |
| `triggerConditions` | What to watch for to enter |
| `potentialTradePlan` | Entry trigger, stop loss, take profit, RR, invalidation |

**Confidence score algorithm (max 100):**

```
H4 bias not NEUTRAL          +15
D1 bias matches H4           +20
Kangaroo Tail setup          +30
Big Shadow setup             +25
Inside Bar setup             +15
Market state TRENDING        +15
Market state BREAKOUT        +10
Market state REVERSAL        -10
Strong level nearby (≥70, within 0.3%)  +15
Medium level nearby (≥50, within 0.5%)  +8
RR ≥ 3:1                     +5
```

**Trade status rules:**
- `AVOID` — H4 and D1 biases conflict (trap risk)
- `TRADE_READY` — setup detected + confidence ≥ 65 + no hard blockers
- `WATCHLIST` — confidence ≥ 35 OR (bias + setup present)
- `NO_TRADE` — everything else

**Pattern definitions:**
- **Kangaroo Tail** — Rejection candle. Wick > 60% of range, body < 30% of range. Must align with H4 trend bias.
- **Big Shadow** — Engulfing candle. High > previous high AND low < previous low. Body > 70% of range.
- **Inside Bar** — Current candle fully inside prior candle (high < prev high, low > prev low). Compression signal.

**Key level strength scoring:**
- Base: 40
- Tested 3+ times: +25 | Tested 2 times: +12
- Very recent (≤10 candles ago): +20 | Recent (≤30 candles): +10
- Round number (0.01 / 0.005 / nearest 100 / 50): +15

### Phase 2 — AI summary (`lib/ai/scanner.ts`)

After all pairs are analysed by the rule engine, the full `PairAnalysisResult[]` is sent to Claude in a single call. Claude receives the pre-calculated data and writes:
- `overallSummary` — 2–3 sentences on the broad market picture
- `aiSummary` per pair — 2–3 sentences explaining what the rule engine found

The system prompt explicitly forbids inventing prices, scores, or setups. Claude is an explainer, not an analyst.

**To skip AI during testing** — set `AI_SKIP=true` in `.env.local`. The scan still runs the full rule engine and returns all structured data. AI summaries are left empty.

---

## Journal grader

Each journal entry can be graded by AI after the trade is closed. Supports both Anthropic and OpenAI as providers.

`POST /api/journal/[id]/analyze` — reads the entry, builds a prompt with the full trade details and thesis, calls the configured AI, and writes back `ai_grade`, `ai_score`, `ai_review_md` to the entry. Also inserts a row into `ai_analyses` for audit/spend tracking.

Grades: A (90–100), B (75–89), C (60–74), D (45–59), F (0–44).

The grader evaluates: process quality, risk management, thesis clarity, emotional discipline, and outcome vs. process (a good process that lost is graded higher than a bad process that won).

---

## OANDA integration

Two environment variables control which API is used:

| `OANDA_ACCOUNT_TYPE` | Base URL |
|---|---|
| `practice` | `https://api-fxpractice.oanda.com` |
| `live` | `https://api-fxtrade.oanda.com` |

### Endpoints used

| Purpose | OANDA endpoint |
|---|---|
| Account balance / NAV | `GET /v3/accounts/{id}/summary` |
| Candle data | `GET /v3/instruments/{pair}/candles?granularity=H4&count=100&price=M` |

The status dot in the sidebar polls `/api/agent/status` every 60 seconds. If OANDA returns a valid account summary, the dot goes green and shows the balance.

---

## API routes reference

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Validates password, sets auth cookie |
| POST | `/api/auth/logout` | Clears auth cookie |
| GET | `/api/agent/status` | OANDA account ping — returns balance + connectivity |
| GET | `/api/agent/signal` | Single-pair KT scan on EUR_USD H4 (used by Terminal page) |
| POST | `/api/agent/signal/log` | Auto-log current signal to journal (dedupes within 4h) |
| POST | `/api/signals/scan` | Full 3-pair scan: rule engine → AI summaries |
| GET | `/api/journal` | List all journal entries |
| POST | `/api/journal` | Create a new journal entry |
| GET | `/api/journal/[id]` | Get single entry |
| PATCH | `/api/journal/[id]` | Update entry (exit, review, tags) |
| DELETE | `/api/journal/[id]` | Delete entry |
| POST | `/api/journal/[id]/analyze` | AI grade a journal entry |
| GET | `/api/oanda/account` | Full OANDA account summary |
| GET | `/api/settings/env` | Returns `{KEY: true/false}` — never exposes values |
| GET | `/api/settings/stats` | Journal win/loss stats + AI spend totals |

---

## Project structure

```
kinoe-web/
├── app/
│   ├── api/
│   │   ├── agent/signal/         # Single-pair KT scan + journal log
│   │   ├── agent/status/         # OANDA connectivity check
│   │   ├── auth/                 # Login / logout
│   │   ├── journal/              # CRUD + AI grader
│   │   ├── oanda/account/        # Account summary
│   │   ├── settings/             # Env health + spend stats
│   │   └── signals/scan/         # Full market scan
│   ├── charts/page.tsx           # Full-screen TradingView chart
│   ├── journal/                  # List, new entry, single entry pages
│   ├── login/page.tsx            # Password login
│   ├── settings/page.tsx         # Settings dashboard
│   ├── signals/page.tsx          # Market scan UI
│   ├── terminal/page.tsx         # Home dashboard
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Redirects to /terminal
│
├── components/
│   ├── ChartPanel.tsx            # TradingView widget (Terminal page)
│   ├── Sidebar.tsx               # Nav + OANDA status dot
│   ├── SignalPanel.tsx           # Single-pair KT signal card
│   └── Topbar.tsx                # Page header
│
├── lib/
│   ├── ai/
│   │   ├── anthropic.ts          # Anthropic client wrapper
│   │   ├── grader.ts             # Journal grading logic
│   │   ├── openai.ts             # OpenAI client wrapper
│   │   ├── pricing.ts            # Token cost calculator (Anthropic + OpenAI)
│   │   ├── prompts.ts            # Shared prompt templates
│   │   ├── scanner.ts            # Signal summariser (summary-only, no invented values)
│   │   └── types.ts              # Shared AI types (Usage, etc.)
│   ├── db/
│   │   ├── client.ts             # Neon SQL client
│   │   ├── migrate.ts            # Migration runner (CLI)
│   │   ├── queries.ts            # All database queries
│   │   ├── schema.sql            # Table definitions
│   │   └── types.ts              # TypeScript types for DB rows
│   ├── signals/
│   │   └── detection.ts          # Full rule engine — patterns, scoring, trade plans
│   └── auth.ts                   # HMAC cookie sign/verify
│
├── proxy.ts                      # Auth middleware (Next.js 16 — must be named proxy.ts)
├── next.config.ts
├── tailwind.config.ts
└── package.json
```

---

## Deployment (Vercel)

1. Push the repo to GitHub.
2. Import the repo in Vercel. Framework preset: **Next.js**. No build config changes needed.
3. Add all required environment variables in Vercel → Settings → Environment Variables.
4. Deploy. On first deploy, run the database migration:

```bash
# Option A — CLI (recommended)
DATABASE_URL="your_neon_url" npx tsx lib/db/migrate.ts

# Option B — via HTTP endpoint (if you set MIGRATE_TOKEN)
curl -X POST https://your-site.vercel.app/api/db/migrate \
  -H "Authorization: Bearer your_migrate_token"
```

5. Visit your domain and log in with `SITE_PASSWORD`.

**Important — Next.js 16 middleware:**
The auth gate is in `proxy.ts` (not `middleware.ts`). Next.js 16 silently ignores `middleware.ts` if the export name doesn't match. Do not rename `proxy.ts` back to `middleware.ts`.

---

## Adapting for a different user / broker

| Change | Where |
|---|---|
| Different pairs | Edit `PAIRS` array in `app/api/signals/scan/route.ts` |
| Different timeframe | Change `granularity=H4` in the OANDA fetch calls + update `runFullPairAnalysis` |
| Different broker (not OANDA) | Swap the fetch calls in scan route and status route. `parseCandles()` in `detection.ts` expects `{complete, time, mid: {o,h,l,c}}` — adapt the parser to your broker's candle format. |
| Add more patterns | Add detection functions in `lib/signals/detection.ts`, wire into `runFullPairAnalysis`, update confidence scoring |
| Multi-user | Replace the single-password auth with NextAuth or Clerk. The rest of the app is user-agnostic. |
| Custom domain | Set in Vercel → Domains |

---

## AI cost reference

Approximate costs per action (claude-sonnet-4-6):

| Action | Approx cost |
|---|---|
| 3-pair signal scan with summaries | ~$0.01 |
| Journal entry AI grade | ~$0.01–0.05 |
| Single-pair KT scan (Terminal page) | Free — no AI, rule engine only |

Scan cost is shown live in the Signals page top bar after each scan. All-time AI spend is shown in Settings.
