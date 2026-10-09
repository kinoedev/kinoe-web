import { NextRequest, NextResponse } from "next/server";
import { clampDays, ensureBacktestHistory } from "@/lib/backtest/data";
import { getSymbol } from "@/lib/futures/symbols";

export const maxDuration = 60;

/** Download (and cache) the history a backtest needs. Body: { symbol, days, confirm? } */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { symbol?: string; days?: number; confirm?: boolean };
    const symbol = getSymbol(body.symbol ?? "");
    if (!symbol) return NextResponse.json({ ok: false, error: "Unknown symbol" }, { status: 400 });
    const result = await ensureBacktestHistory(symbol, clampDays(body.days), body.confirm === true);
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Download failed" }, { status: 500 });
  }
}
