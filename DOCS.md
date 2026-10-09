# kinoe-web — Build Guide

A private trading platform for futures price action. Scans MNQ, MES, MGC and MCL for auto key-level zones, journals trades, grades entries with AI, and builds a data set for future bot training. Designed as a single-user tool — one password, no user accounts.

---

## What it does

| Section | What it is |
|---|---|
| **Terminal** | Home dashboard — TradingView chart (15m default, Chicago time) + compact zone scanner showing which contract is nearest a level |
| **Charts** | Full-screen TradingView Advanced Chart with a futures quick switcher. Accepts `?symbol=CME_MINI:MNQ1!` deep links from the scanner. |
| **Scanner** | Futures key-level zone scanner. Pulls CME data from Databento (cached), builds the weekly level set and 3–5 rectangle zones per contract, and ranks contracts by how close price is to a zone. |
| **Backtest** | Walk-forward backtest of the 1H / 15m / 5m zone strategy (setups A and B) on cached CME 1-minute data. Win rate, expectancy, drawdown, equity curve, and a breakdown by setup, session, direction and contract. |
| **My Strategy** | The written trading plan (`lib/strategy/plan.ts`): the evidence behind it, prep, 1H/VWAP bias, setups A/B/C, no-trade rules, risk for the current prop account with a position-size calculator and pre-trade checklist, trade management and review loop. A "Today" box shows trades/losses/P&L vs the daily limits from imported trades. |
| **Breakout Lab** | Reads every 15m close through a zone — ICT liquidity (PDH/PDL, Asia/London highs & lows, equal highs/lows), displacement + fair value gap, relative volume, stochastic divergence, 1H structure — labels it Strong / Weak / Likely trap, and measures on cached history which of those actually predict follow-through. The Scanner shows the latest break's label on each contract. |
| **Journal** | TradeZella-style journal: Tradovate imports (Performance PDF/CSV, Orders CSV), dashboard (stats, Kinoe score, cumulative P&L, P&L calendar), prop-firm tracker per account (balance, EOD-trailing drawdown floor, daily loss limit, profit target), reports (symbol, hour, weekday, hold time, playbook, mistakes, account), playbooks with rules checklists compared against backtests, daily notebook, per-trade review (playbook, rules followed, stop → R, rating, mistake/emotion tags) and AI grading. `/analytics` redirects to Journal → Reports. |
| **Market** | Session timeline, TradingView futures quotes, USD economic calendar, futures news. |
| **Settings** | Databento status and credit used, AI spend, journal stats, env var health check. |

---

## Tech stack

| Layer | Tool |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Database | Neon Postgres (serverless) |
| Market data | Databento Historical API — CME Globex (`GLBX.MDP3`), OHLCV 1m + 1h |
| AI — journal grader | Anthropic or OpenAI (configurable per call) |
| Charts | TradingView Lightweight/Advanced Widget (CDN embed) |
| Deployment | Vercel |
| Auth | Single-password HMAC-signed cookie (no third-party auth) |

---

## Accounts you need

| Service | Link | Notes |
|---|---|---|
| **Vercel** | [vercel.com](https://vercel.com) | Free tier works. Hosts the app and stores env vars. |
| **Neon** | [neon.tech](https://neon.tech) | Free tier works. Serverless Postgres. Copy the pooled `DATABASE_URL`. |
| **Databento** | [databento.com](https://databento.com) | New accounts get $125 of usage credit (expires after 6 months). Historical pulls are billed against it. API key is in the portal → API Keys. |
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com) | Pay-as-you-go. ~$0.01 per scan, ~$0.01–0.05 per journal grade. |
| **OpenAI** _(optional)_ | [platform.openai.com](https://platform.openai.com) | Only needed if using OpenAI for journal grading instead of Anthropic. |
| **Telegram** | [t.me/BotFather](https://t.me/BotFather) | Create a bot → get `TELEGRAM_BOT_TOKEN`. Then message [@userinfobot](https://t.me/userinfobot) to get your `TELEGRAM_CHAT_ID`. |

---

## Environment variables

Set all of these in Vercel → Project → Settings → Environment Variables (and in `.env.local` for local dev).

| Variable | Required | Description |
|---|---|---|
| `SITE_PASSWORD` | ✅ | The login password. Pick anything strong. |
| `SITE_AUTH_SECRET` | ✅ | Secret for signing auth cookies. Generate with `openssl rand -hex 32`. |
| `DATABASE_URL` | ✅ | Neon Postgres connection string (pooled). Starts with `postgresql://`. |
| `DATABENTO_API_KEY` | ✅ | Databento API key. Used for historical CME bars. |
| `BACKTEST_MAX_DAYS` | ⬜ | Longest backtest window in days (default `90`). 1-minute bars are kept for this many days + 15. |
| `DATABENTO_MAX_COST_USD` | ⬜ | Per-scan credit limit (default `1`). A scan estimated above this asks for confirmation on the Scanner page before spending. |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key for signal summaries and journal grading. |
| `OPENAI_API_KEY` | ⬜ | OpenAI API key. Only needed if you want to grade journal entries with GPT. |
| `AI_SKIP` | ⬜ | Set to `true` in `.env.local` only. Skips AI call during local testing — zero cost. Never set on Vercel. |
| `MIGRATE_TOKEN` | ⬜ | Secret token to protect the `/api/db/migrate` endpoint. Only needed if you run migrations via HTTP instead of CLI. |
| `TELEGRAM_BOT_TOKEN` | ⬜ | Bot token from @BotFather on Telegram. Kept for upcoming zone alerts (`lib/telegram.ts`). |
| `TELEGRAM_CHAT_ID` | ⬜ | Your personal Telegram chat ID. Get it from @userinfobot. |

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
| `pair` | TEXT | Symbol, e.g. `MNQ` (column name kept from the forex version) |
| `timeframe` | TEXT | e.g. `M15` |
| `direction` | TEXT | `LONG` or `SHORT` |
| `setup_type` | TEXT | Free text, e.g. `Close-through`, `Zone rejection` |
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
| `source` | TEXT | `kierra` (manual entry) or `agent` (approved signal) |

**`backtests`** — future use, table is created but not yet wired to UI.

**`futures_bars`** — cached Databento OHLCV bars (`ohlcv-1h` ~5 months, `ohlcv-1m` last 30 days). Primary key `(symbol, schema, ts)`.

**`futures_coverage`** — the time range already downloaded per symbol/schema, so the same range is never paid for twice.

**`futures_fetch_log`** — every paid Databento pull with its estimated cost. Feeds the credit-used figures in Settings and the sidebar.

**`futures_zone_snapshots`** — one row per symbol per scan with the full zone analysis (JSONB). The Scanner page loads the latest snapshot without calling Databento.

**`backtests`** — one row per backtest run per contract: window, params, every trade (`trades_jsonb`), and stats/breakdown/skip counts (`results_jsonb`).

The forex-era `agent_*` tables are left in place (not dropped) so historic data is kept; nothing writes to them any more.

**`trading_accounts`** — prop/broker accounts: size, profit target, daily loss limit, max drawdown + type (EOD trailing / static), fee rates for CSV imports, status (evaluation, funded, blown…).

**`trade_imports`** — one row per upload (file name, format, trades added, duplicates skipped). Deleting one removes the trades it added.

**`playbooks`** — strategies with a rules checklist; optionally linked to backtest setup A or B. Two starter playbooks are created on first use.

**`daily_notes`** — pre-market plan, post-session review, mood, rating, followed-plan per CME trading day.

`journal_entries` gained: `account_id`, `import_id`, `import_hash` (unique — re-importing skips existing trades), `quantity`, `gross_pnl`, `fees`, `trading_day`, `duration_sec`, `executions_json`, `playbook_id`, `rules_followed`, `rating`. `pnl` is net of fees.

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

## Futures scanner

### Data (`lib/futures/`)

| File | Responsibility |
|---|---|
| `symbols.ts` | MNQ, MES, MGC, MCL — tick size, tick value, Databento continuous symbol (`MNQ.v.0` = highest-volume contract, rolls automatically), TradingView symbol |
| `databento.ts` | Minimal HTTP client: `getAvailableEnd`, `getCost`, `fetchBars` (JSON lines, handles pretty or fixed-point prices) |
| `store.ts` | Bar cache in Neon: plans only the missing ranges, prices them with `metadata.get_cost`, downloads, records coverage and spend |
| `sessions.ts` | CME Globex sessions (17:00 → 16:00 America/Chicago, DST-aware), aggregation, ATR |
| `scanner.ts` | `runFuturesScan()` — cost guard → download new bars → compute zones → save snapshots |

Every scan only downloads bars newer than what's already cached, so after the first backfill a weekly scan costs a few cents of credit. Databento's continuous contracts are not back-adjusted, so levels far back across a roll can be offset by the roll spread — the weekly set (last 5 sessions) is unaffected.

### Zones engine (`lib/indicators/`)

`analyzeZones()` in `zones.ts` encodes the weekly level routine:

- **Week-scoped set** — 5-session range high/low, last session's day high/low, VAH / POC / VAL (70% value area from 1m bars, `profile.ts`), low-volume nodes, and the outer swing high/low.
- **Swings nest outside the range** — the swing high is the nearest 60m pivot above the week high (and the swing low below the week low), never inside it.
- **Long-term structure** — clusters of 4+ 60m pivots over ~5 months, plus the lookback high/low.
- **Tests and breaks** — counted on 60m bars over the last 20 sessions. A visit that leaves on the side it came from is a test; one that closes out the other side is a break. A visit still in progress is flagged "testing now".
- **Volume context** — levels in thin parts of the profile (not the naturally thin edges) score higher and are labelled `low-volume`.
- **Output** — nearby levels merge into rectangle zones; 3–5 are picked, spaced at least half an hourly ATR apart, with both sides of price represented and at most two structure-only zones. Labels read `price — reason · N tests, M breaks`.

The scanner status per contract is `IN_ZONE`, `APPROACHING` (within one hourly ATR of a zone) or `CLEAR`.

---

## Journal grader

Each journal entry can be graded by AI after the trade is closed. Supports both Anthropic and OpenAI as providers.

`POST /api/journal/[id]/analyze` — reads the entry, builds a prompt with the full trade details and thesis, calls the configured AI, and writes back `ai_grade`, `ai_score`, `ai_review_md` to the entry. Also inserts a row into `ai_analyses` for audit/spend tracking.

Grades: A (90–100), B (75–89), C (60–74), D (45–59), F (0–44).

The grader evaluates: process quality, risk management, thesis clarity, emotional discipline, and outcome vs. process (a good process that lost is graded higher than a bad process that won).

---

## API routes reference

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Validates password, sets auth cookie |
| POST | `/api/auth/logout` | Clears auth cookie |
| GET | `/api/futures/scan` | Latest saved zones per symbol + credit used. Database only — never spends credit. |
| POST | `/api/futures/scan` | Download new bars (cached) and recompute zones. Body `{ symbols?: string[], confirm?: boolean }`. Returns `409 { needsConfirm, estimate }` when the estimate is over `DATABENTO_MAX_COST_USD`. |
| POST | `/api/backtest/data` | Download/caches the history a backtest needs. Body `{ symbol, days, confirm? }`. `409 needsConfirm` above the credit limit. |
| POST | `/api/backtest/run` | Run the backtest on cached bars and save it. Body `{ symbol, days, params? }`. |
| POST | `/api/breakouts/study` | Breakout Lab rows for one contract on cached history. Body `{ symbol, days }` (download history via `/api/backtest/data` first). |
| GET/POST | `/api/journal/accounts` | List / create trading accounts. `PATCH /api/journal/accounts/[id]` updates one. |
| GET/POST/DELETE | `/api/journal/import` | Recent imports · import `{ accountId, files: [{ name, text or base64 }], dryRun? }` · `?id=` undo |
| GET | `/api/journal/trades` | Closed trades `?account=&from=&to=` + accounts, playbooks, note days |
| GET/PUT | `/api/journal/notes/[day]` | Daily notebook entry + that day's trades |
| GET/POST | `/api/journal/playbooks` | Playbooks + latest backtest stats for linked setups · create/update |
| PATCH | `/api/journal/[id]/review` | Playbook, rules followed, rating, setup, stop (recomputes R) |
| GET | `/api/backtest` | Recent runs, or one full run with `?id=` |
| GET | `/api/futures/status` | Sidebar/Settings status: key configured, last scan, data-through time, credit used |
| GET | `/api/analytics/performance` | Win rate, R totals, equity curve, breakdown by pair/setup/source |
| GET | `/api/journal` | List all journal entries |
| POST | `/api/journal` | Create a new journal entry |
| GET | `/api/journal/[id]` | Get single entry |
| PATCH | `/api/journal/[id]` | Update entry (exit, review, tags) |
| DELETE | `/api/journal/[id]` | Delete entry |
| POST | `/api/journal/[id]/analyze` | AI grade a journal entry |
| GET | `/api/settings/env` | Returns `{KEY: true/false}` — never exposes values |
| GET | `/api/settings/stats` | Journal win/loss stats + AI spend totals |

---

## Backtester (`lib/backtest/`)

`runBacktest()` in `engine.ts` replays the strategy minute by minute with no look-ahead:

| Layer | Rule |
|---|---|
| **1H — map** | Zones are rebuilt at each session open with `analyzeZones()` using only data that existed then. Bias: above the week's VAH with a higher 1H swing low → longs only; below VAL with a lower 1H swing high → shorts only; inside value → both directions, only at zones within ¼ hourly ATR of VAH/VAL; anything else → no trades. |
| **15m — setup A** | A 15m close through a zone (two consecutive closes outside RTH when "2 closes at night" is on), then a retest within 4 bars. A close back through the far side cancels it. |
| **15m — setup B** | A 15m wick through a zone that closes back inside → trade the other way within 2 bars. |
| **5m — trigger** | Rejection candle at the zone (closes in the trade direction). Stop-entry 1 tick beyond it, working for 3 bars. Stop = beyond the zone, the candle (and for B the wick) by 2 ticks. Target = the near edge of the next zone. Skipped if reward < min R. |
| **Fills** | 1-minute bars. Stop checked before target in the same bar; same-minute entry + stop counts as a loss. 1 tick slippage on stop orders; targets need a 1-tick trade-through. Commission per side is configurable. |
| **Risk** | One position at a time per contract, stop for the day after N losses, no new entries after 15:30 CT, flat at 15:59 CT. |
| **News** | Approximate fixed windows (CT): 07:25–07:45 weekdays, 12:55–13:45 on FOMC days, 09:25–09:45 Wednesdays for crude (`news.ts`). |

R is measured against the risk at the actual fill. `stats.ts` computes win rate, expectancy, profit factor, max drawdown in R and a per-slice breakdown.

**Bias check:** on a pure random walk (no edge in the data) the engine returns about −0.1R per trade over 1,200+ trades — what fees and slippage alone should cost. A clearly positive result on random data would mean a look-ahead bug. Truncating future data also leaves earlier trades unchanged.

**Data:** the first run per contract downloads 1-minute history for the window (+10 days warm-up) and 1-hour history (+160 days), priced first with `metadata.get_cost` and gated by `DATABENTO_MAX_COST_USD`. Runs themselves read only the cache.

---

## Breakout Quality (`lib/indicators/breakout.ts`)

Read at the close of a 15m candle that closes through a zone (no look-ahead):

| Feature | Definition | Starting weight |
|---|---|---|
| Displacement | body ≥ 1 ATR(15m), in the break direction, closing in the outer 30% of its range | +15 (small body < 0.5 ATR: −10) |
| Fair value gap | 3-candle gap: high two bars back < break bar low (longs) | +10 |
| Relative volume | break bar volume ÷ same 15m slot's average over up to 10 prior sessions | ≥ 1.5×: +15 · < 0.8×: −10 |
| Swept opposite liquidity first | in the 8 bars before, a wick through sell-side liquidity that closed back above (longs) | +10 |
| Only wicked liquidity | the break bar wicks through resting buy-side liquidity but closes below it (longs) | −25 and labelled trap |
| Liquidity ahead | untaken buy-side liquidity within 3 ATR above (longs) | +5 |
| Stochastic divergence | new high vs the last 15m swing high, %K(14,3) ≥ 5 lower | −15 |
| 1H structure | last two 1H swing highs and lows both rising (longs) / falling | with +10 · against −10 |

Weights were reset after the first real run (1,019 breaks): only the displacement candle separated outcomes (63% vs 48%), so it carries +25 and everything else ±2–3. Score starts at 50: **Strong ≥ 70** (needs displacement), **Likely trap ≤ 35** (small or weak-closing candle), otherwise **Weak**. The Lab page re-labels rows from their features and writes a plain-English “What this means” summary. Liquidity pools: previous trading day high/low, Asia (18:00–23:00 CT) and London (01:00–04:00 CT) ranges, and equal highs/lows (two 15m swings within 0.1 ATR) — only those not yet traded through.

**Breakout Lab** (`lib/backtest/breakoutStudy.ts`, `lib/indicators/breakoutStats.ts`): walk-forward over cached bars with zones rebuilt each session. Outcome: *followed through* = 1 ATR beyond the break close within 8 bars before a 15m close back through the zone's far side; *failed* = the close-back came first. Each feature shows follow-through with vs without it; it's marked as mattering only with ≥ 30 breaks on each side and |z| ≥ 2.6 (strict, because a dozen features are tested together). The weights above are starting points — change them in `scoreBreak()` to match what the Lab shows on real data.

## Journal import (`lib/journal/`)

| File | Responsibility |
|---|---|
| `pdf.ts` | Tradovate **Performance PDF** → pair rows (unpdf text extraction, row regex) + the report's Gross P/L, fees and trade count |
| `import.ts` | CSV parsing; Tradovate **Performance CSV** → pair rows; **Orders/fills CSV** → FIFO round trips + initial stop (from stop orders) |
| `ingest.ts` | Multi-file uploads: merges overlapping exports (each distinct row keeps its highest count in any one file — identical fills can be real), then builds trades once |
| `store.ts` | Accounts, imports (dedupe by `import_hash`), trades, notes, playbooks, review updates |
| `stats.ts` | Summary, daily P&L, Kinoe score, breakdowns, prop-firm status |
| `time.ts` / `contracts.ts` / `format.ts` | Timezone parsing, CME trading day, contract point values, display formatting |

- Pair rows are rebuilt into fills and grouped **flat-to-flat** per symbol, so scale-ins/outs become one trade. Trade count is lower than Tradovate's row count.
- P&L is recomputed from prices × point value and cross-checked against the file's own P&L; the import preview shows a ✓ per file when it matches the report.
- PDF reports state total fees only: they're spread per contract and rounded cumulatively so the cents add up to the report total exactly. CSV imports use the account's fee rates (editable; changing them re-prices that account's CSV trades).
- Timestamps are read in the account's timezone (default America/Chicago). Trading day = CME session (17:00 CT rolls to the next day; weekend sessions to Monday) — matches how prop firms count days.
- Prop status is from closed trades: EOD trailing floor = max(start − DD, highest EOD balance − DD). Firm-specific trail locks aren't modelled.

---

## Removed in the futures switch

The forex agent (OANDA candles, Naked Forex pattern engine, Telegram approve/deny, OANDA stop orders, close-check) was removed. `/signals` and `/agent` redirect to `/scanner`.

If cron jobs still call `/api/agent/run` or `/api/agent/close-check`, disable them — those routes no longer exist (and are no longer public).

---

## Project structure

```
kinoe-web/
├── app/
│   ├── api/
│   │   ├── analytics/performance/ # GET — win rate, equity curve, R stats
│   │   ├── auth/                 # Login / logout
│   │   ├── backtest/             # GET runs · data/ download history · run/ run + save
│   │   ├── futures/scan/         # GET saved zones · POST run a scan
│   │   ├── futures/status/       # Databento status + credit used
│   │   ├── journal/              # CRUD + AI grader
│   │   └── settings/             # Env health + spend stats
│   ├── backtest/page.tsx         # Backtest UI — controls, stats, equity curve, trades
│   ├── charts/page.tsx           # Full-screen TradingView chart (futures switcher, deep links)
│   ├── journal/                  # Dashboard, trades, reports, playbooks, day/[date] notebook, import, accounts, [id] trade, new
│   ├── login/page.tsx            # Password login
│   ├── market/page.tsx           # Sessions, futures quotes, calendar, news
│   ├── scanner/page.tsx          # Zone scanner UI
│   ├── settings/page.tsx         # Settings dashboard
│   ├── terminal/page.tsx         # Home dashboard
│   ├── layout.tsx                # Root layout (includes BottomNav globally)
│   └── page.tsx                  # Home
│
├── components/
│   ├── BottomNav.tsx             # Mobile bottom navigation (md:hidden)
│   ├── ChartPanel.tsx            # TradingView widget (Terminal page)
│   ├── ScannerPanel.tsx          # Compact zone scanner (Terminal page)
│   ├── Sidebar.tsx               # Nav + Databento status
│   └── Topbar.tsx                # Page header + Market Pulse dropdown
│
├── lib/
│   ├── backtest/                 # engine.ts (walk-forward sim), stats.ts, news.ts, data.ts
│   ├── journal/                  # import (PDF/CSV), ingest, store, stats, time, contracts, format
│   ├── ai/                       # Journal grader (Anthropic / OpenAI), pricing, prompts
│   ├── db/                       # Neon client, migration runner, queries, schema, types
│   ├── futures/                  # Databento client, bar cache, sessions, symbols, scanner
│   ├── indicators/               # Volume profile + key-level zones engine
│   ├── telegram.ts               # Telegram helper (kept for zone alerts)
│   └── auth.ts                   # HMAC cookie sign/verify
│
├── proxy.ts                      # Auth middleware (Next.js 16 — must be named proxy.ts)
├── next.config.ts                # /signals and /agent redirect to /scanner
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
| Different contracts | Add to `FUTURES_SYMBOLS` in `lib/futures/symbols.ts` (tick size + Databento continuous symbol + TradingView symbol) |
| Zone rules | `lib/indicators/zones.ts` — base scores per level type, test lookback, zone width, 3–5 cap |
| Different data vendor | Replace `lib/futures/databento.ts`; the cache and engine only need `Bar { ts, open, high, low, close, volume }` |
| Multi-user | Replace the single-password auth with NextAuth or Clerk. The rest of the app is user-agnostic. |
| Custom domain | Set in Vercel → Domains |

---

## Cost reference

| Action | Approx cost |
|---|---|
| First futures scan (backfill ~5 months 1h + ~10 days 1m, 4 contracts) | Estimated before downloading; shown on the Scanner page |
| Later scans | Only new bars since the last scan — usually cents of Databento credit |
| Loading the Scanner / Terminal | Free — reads saved snapshots |
| First backtest per contract | 1-minute history for the window — estimated and confirmed on the Backtest page before downloading |
| Re-running a backtest | Free — reads the cache |
| Journal entry AI grade (claude-sonnet-4-6) | ~$0.01–0.05 |

Databento credit used and all-time AI spend are shown in Settings.
