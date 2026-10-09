import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { clampDays, coverage, HOURLY_WARMUP_DAYS, MINUTE_WARMUP_DAYS } from "@/lib/backtest/data";
import { DEFAULT_PARAMS, runBacktest, type BacktestParams } from "@/lib/backtest/engine";
import { breakdown, computeStats } from "@/lib/backtest/stats";
import { loadBarsRange } from "@/lib/futures/store";
import { getSymbol } from "@/lib/futures/symbols";

export const maxDuration = 60;

const DAY = 86_400_000;

function cleanParams(raw: unknown): Partial<BacktestParams> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, def] of Object.entries(DEFAULT_PARAMS)) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof def === "boolean" && typeof v === "boolean") out[k] = v;
    if (typeof def === "number" && typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out as Partial<BacktestParams>;
}

/** Run the backtest on cached bars (no credit spent). Body: { symbol, days, params? } */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { symbol?: string; days?: number; params?: unknown };
    const symbol = getSymbol(body.symbol ?? "");
    if (!symbol) return NextResponse.json({ ok: false, error: "Unknown symbol" }, { status: 400 });
    const days = clampDays(body.days);

    const cov = await coverage(symbol.root);
    const m = cov["ohlcv-1m"];
    const h = cov["ohlcv-1h"];
    if (!m || !h) return NextResponse.json({ ok: false, error: `${symbol.root}: no cached history — download it first.` }, { status: 409 });
    const to = Math.min(m.until, h.until);
    const from = to - days * DAY;
    if (m.from > from - MINUTE_WARMUP_DAYS * DAY + DAY) {
      return NextResponse.json({ ok: false, error: `${symbol.root}: 1-minute history doesn't reach back ${days} days yet — download it first.` }, { status: 409 });
    }

    const [minute, hourly] = await Promise.all([
      loadBarsRange(symbol.root, "ohlcv-1m", from - MINUTE_WARMUP_DAYS * DAY, to),
      loadBarsRange(symbol.root, "ohlcv-1h", from - HOURLY_WARMUP_DAYS * DAY, to),
    ]);
    const result = runBacktest({ symbol, minute, hourly, from, to, params: cleanParams(body.params) });
    const stats = computeStats(result.trades);
    const groups = breakdown(result.trades);

    const rows = (await sql`
      INSERT INTO backtests (pair, timeframe, strategy, window_start, window_end, params_jsonb, trades_jsonb,
                             trades_count, wins, losses, win_rate, avg_r, results_jsonb)
      VALUES (${symbol.root}, '1h/15m/5m', 'zones-A-B', ${new Date(from).toISOString()}, ${new Date(to).toISOString()},
              ${JSON.stringify(result.params)}, ${JSON.stringify(result.trades)}, ${stats.trades}, ${stats.wins}, ${stats.losses},
              ${stats.winRate}, ${stats.expectancyR},
              ${JSON.stringify({ stats, breakdown: groups, skips: result.skips, notes: result.notes, sessionsTested: result.sessionsTested, setupsSeen: result.setupsSeen })})
      RETURNING id
    `) as { id: string }[];

    return NextResponse.json({ ok: true, id: rows[0]?.id, result, stats, breakdown: groups });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Backtest failed" }, { status: 500 });
  }
}
