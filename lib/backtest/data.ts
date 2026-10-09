import { sql } from "@/lib/db/client";
import { backtestMaxDays, executeFetch, planFetches, pruneMinuteBars } from "@/lib/futures/store";
import { costLimit } from "@/lib/futures/scanner";
import type { FuturesSymbol } from "@/lib/futures/symbols";

/** Days of warm-up before the test window: 1m for the volume profile, 1h for structure. */
export const MINUTE_WARMUP_DAYS = 10;
export const HOURLY_WARMUP_DAYS = 160;

export function clampDays(days: unknown): number {
  const n = Math.floor(Number(days));
  if (!Number.isFinite(n) || n < 10) return 30;
  return Math.min(n, backtestMaxDays());
}

export type EnsureResult =
  | { ok: true; rowsDownloaded: number; cost: number }
  | { ok: false; needsConfirm: true; estimate: number; limit: number; message: string };

/** Make sure the cache holds enough history to backtest `days`. Spends credit only for what's missing. */
export async function ensureBacktestHistory(symbol: FuturesSymbol, days: number, confirm: boolean): Promise<EnsureResult> {
  const { plans } = await planFetches([symbol], {
    "ohlcv-1m": days + MINUTE_WARMUP_DAYS,
    "ohlcv-1h": days + HOURLY_WARMUP_DAYS,
  });
  const estimate = plans.reduce((s, p) => s + p.cost, 0);
  const limit = costLimit();
  if (estimate > limit && !confirm) {
    return {
      ok: false,
      needsConfirm: true,
      estimate,
      limit,
      message: `${symbol.root}: ${days} days of history needs about $${estimate.toFixed(2)} of Databento credit (limit $${limit.toFixed(2)}).`,
    };
  }
  let rows = 0;
  for (const plan of plans) rows += await executeFetch(plan);
  if (plans.some((p) => p.schema === "ohlcv-1m")) await pruneMinuteBars();
  return { ok: true, rowsDownloaded: rows, cost: estimate };
}

export async function coverage(symbol: string): Promise<Record<string, { from: number; until: number }>> {
  const rows = (await sql`
    SELECT schema, covered_from, covered_until FROM futures_coverage WHERE symbol = ${symbol}
  `) as { schema: string; covered_from: string; covered_until: string }[];
  return Object.fromEntries(
    rows.map((r) => [r.schema, { from: new Date(r.covered_from).getTime(), until: new Date(r.covered_until).getTime() }])
  );
}
