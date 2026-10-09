import { NextRequest, NextResponse } from "next/server";
import { clampDays, coverage, HOURLY_WARMUP_DAYS, MINUTE_WARMUP_DAYS } from "@/lib/backtest/data";
import { runBreakoutStudy } from "@/lib/backtest/breakoutStudy";
import { loadBarsRange } from "@/lib/futures/store";
import { getSymbol } from "@/lib/futures/symbols";

export const maxDuration = 60;
const DAY = 86_400_000;

/** Run the Breakout Lab on cached bars (no credit spent). Body: { symbol, days } */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { symbol?: string; days?: number };
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
    const { rows, sessions } = runBreakoutStudy({ symbol, minute, hourly, from, to });
    return NextResponse.json({ ok: true, symbol: symbol.root, from, to, sessions, rows });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Study failed" }, { status: 500 });
  }
}
