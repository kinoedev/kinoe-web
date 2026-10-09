/**
 * Bar cache: download each range from Databento once, keep it in Neon, and only
 * fetch what's new on later scans. This is what keeps the free credit alive.
 */
import { sql } from "@/lib/db/client";
import { fetchBars, getAvailableEnd, getCost } from "./databento";
import type { FuturesSymbol } from "./symbols";
import { SCHEMA_MS, type Bar, type BarSchema } from "./types";

export const LOOKBACK_DAYS: Record<BarSchema, number> = {
  "ohlcv-1h": 150, // ~5 months of 60m bars for structure and outer swings
  "ohlcv-1m": 10, // the last two weeks of 1m bars for the volume profile
};

const DAY_MS = 86_400_000;

/** Longest backtest window allowed, in days of 1-minute history. */
export function backtestMaxDays(): number {
  const n = Number(process.env.BACKTEST_MAX_DAYS);
  return Number.isFinite(n) && n >= 10 ? Math.floor(n) : 90;
}

/** 1m bars are kept long enough for the longest backtest (plus a week of warm-up for the profile). */
function minuteRetentionDays(): number {
  return Math.max(30, backtestMaxDays() + 15);
}

type Coverage = { covered_from: string; covered_until: string };

export type FetchPlan = {
  symbol: FuturesSymbol;
  schema: BarSchema;
  start: Date;
  end: Date;
  cost: number;
};

async function getCoverage(symbol: string, schema: BarSchema): Promise<Coverage | null> {
  const rows = (await sql`
    SELECT covered_from, covered_until FROM futures_coverage WHERE symbol = ${symbol} AND schema = ${schema}
  `) as Coverage[];
  return rows[0] ?? null;
}

/** Work out which ranges still need downloading, and what they will cost. */
export async function planFetches(
  symbols: FuturesSymbol[],
  lookbackDays: Record<BarSchema, number> = LOOKBACK_DAYS
): Promise<{ plans: FetchPlan[]; availableEnd: Record<BarSchema, Date> }> {
  const schemas: BarSchema[] = ["ohlcv-1h", "ohlcv-1m"];
  const availableEnd = {} as Record<BarSchema, Date>;
  for (const schema of schemas) {
    const end = await getAvailableEnd(schema);
    const step = SCHEMA_MS[schema];
    availableEnd[schema] = new Date(Math.floor(end.getTime() / step) * step);
  }

  const plans: FetchPlan[] = [];
  for (const symbol of symbols) {
    for (const schema of schemas) {
      const end = availableEnd[schema];
      const desiredStart = new Date(end.getTime() - lookbackDays[schema] * DAY_MS);
      const cov = await getCoverage(symbol.root, schema);
      const ranges: [Date, Date][] = [];
      if (!cov) {
        ranges.push([desiredStart, end]);
      } else {
        const from = new Date(cov.covered_from);
        const until = new Date(cov.covered_until);
        if (desiredStart < from) ranges.push([desiredStart, from]);
        if (until < end) ranges.push([until > desiredStart ? until : desiredStart, end]);
      }
      for (const [start, stop] of ranges) {
        if (stop.getTime() - start.getTime() < SCHEMA_MS[schema]) continue;
        const cost = await getCost({ symbol: symbol.databento, schema, start, end: stop });
        plans.push({ symbol, schema, start, end: stop, cost });
      }
    }
  }
  return { plans, availableEnd };
}

async function insertBars(symbol: string, schema: BarSchema, bars: Bar[]) {
  const CHUNK = 5000;
  for (let i = 0; i < bars.length; i += CHUNK) {
    const chunk = bars.slice(i, i + CHUNK);
    await sql.query(
      `INSERT INTO futures_bars (symbol, schema, ts, open, high, low, close, volume)
       SELECT $1, $2, t.ts, t.o, t.h, t.l, t.c, t.v
       FROM unnest($3::timestamptz[], $4::float8[], $5::float8[], $6::float8[], $7::float8[], $8::bigint[])
         AS t(ts, o, h, l, c, v)
       ON CONFLICT (symbol, schema, ts) DO UPDATE
         SET open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
             close = EXCLUDED.close, volume = EXCLUDED.volume`,
      [
        symbol,
        schema,
        chunk.map((b) => new Date(b.ts).toISOString()),
        chunk.map((b) => b.open),
        chunk.map((b) => b.high),
        chunk.map((b) => b.low),
        chunk.map((b) => b.close),
        chunk.map((b) => Math.round(b.volume)),
      ]
    );
  }
}

/** Run a plan: download, cache, record coverage and spend. */
export async function executeFetch(plan: FetchPlan): Promise<number> {
  const { symbol, schema, start, end, cost } = plan;
  const bars = await fetchBars({ symbol: symbol.databento, schema, start, end });
  await insertBars(symbol.root, schema, bars);

  await sql`
    INSERT INTO futures_coverage (symbol, schema, covered_from, covered_until, updated_at)
    VALUES (${symbol.root}, ${schema}, ${start.toISOString()}, ${end.toISOString()}, now())
    ON CONFLICT (symbol, schema) DO UPDATE SET
      covered_from  = LEAST(futures_coverage.covered_from, EXCLUDED.covered_from),
      covered_until = GREATEST(futures_coverage.covered_until, EXCLUDED.covered_until),
      updated_at    = now()
  `;
  await sql`
    INSERT INTO futures_fetch_log (symbol, schema, range_start, range_end, rows, cost_usd)
    VALUES (${symbol.root}, ${schema}, ${start.toISOString()}, ${end.toISOString()}, ${bars.length}, ${cost})
  `;
  return bars.length;
}

export async function pruneMinuteBars() {
  const cutoff = new Date(Date.now() - minuteRetentionDays() * DAY_MS).toISOString();
  await sql`DELETE FROM futures_bars WHERE schema = 'ohlcv-1m' AND ts < ${cutoff}`;
  await sql`
    UPDATE futures_coverage SET covered_from = GREATEST(covered_from, ${cutoff}::timestamptz)
    WHERE schema = 'ohlcv-1m'
  `;
}

type BarRow = { ts: string; open: number; high: number; low: number; close: number; volume: string | number };

export async function loadBars(symbol: string, schema: BarSchema, sinceDays: number): Promise<Bar[]> {
  return loadBarsRange(symbol, schema, Date.now() - sinceDays * DAY_MS, Date.now() + DAY_MS);
}

/** Load bars in [from, to). Large ranges are read in slices to keep each HTTP response small. */
export async function loadBarsRange(symbol: string, schema: BarSchema, from: number, to: number): Promise<Bar[]> {
  const slice = schema === "ohlcv-1m" ? 10 * DAY_MS : 400 * DAY_MS;
  const out: Bar[] = [];
  for (let start = from; start < to; start += slice) {
    const end = Math.min(to, start + slice);
    const rows = (await sql`
      SELECT ts, open, high, low, close, volume FROM futures_bars
      WHERE symbol = ${symbol} AND schema = ${schema}
        AND ts >= ${new Date(start).toISOString()} AND ts < ${new Date(end).toISOString()}
      ORDER BY ts
    `) as BarRow[];
    out.push(...rows.map(toBar));
  }
  return out;
}

function toBar(r: BarRow): Bar {
  return {
    ts: new Date(r.ts).getTime(),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  };
}

export async function creditSpent(): Promise<{ total: number; last30d: number; pulls: number }> {
  const rows = (await sql`
    SELECT COALESCE(SUM(cost_usd), 0) AS total,
           COALESCE(SUM(cost_usd) FILTER (WHERE created_at > now() - interval '30 days'), 0) AS last30d,
           COUNT(*) AS pulls
    FROM futures_fetch_log
  `) as { total: string; last30d: string; pulls: string }[];
  const r = rows[0];
  return { total: Number(r?.total ?? 0), last30d: Number(r?.last30d ?? 0), pulls: Number(r?.pulls ?? 0) };
}

export async function saveSnapshot(a: {
  symbol: string;
  weekStart: string;
  weekEnd: string;
  asOf: number;
  lastPrice: number;
  analysis: unknown;
}) {
  await sql`
    INSERT INTO futures_zone_snapshots (symbol, week_start, week_end, as_of, last_price, analysis_json)
    VALUES (${a.symbol}, ${a.weekStart}, ${a.weekEnd}, ${new Date(a.asOf).toISOString()}, ${a.lastPrice}, ${JSON.stringify(a.analysis)})
  `;
}

export async function latestSnapshots(): Promise<{ symbol: string; created_at: string; analysis_json: unknown }[]> {
  return (await sql`
    SELECT DISTINCT ON (symbol) symbol, created_at, analysis_json
    FROM futures_zone_snapshots
    ORDER BY symbol, created_at DESC
  `) as { symbol: string; created_at: string; analysis_json: unknown }[];
}
