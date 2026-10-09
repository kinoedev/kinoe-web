import { NextRequest, NextResponse } from "next/server";
import { costLimit, runFuturesScan } from "@/lib/futures/scanner";
import { creditSpent, latestSnapshots } from "@/lib/futures/store";
import { FUTURES_SYMBOLS, getSymbol } from "@/lib/futures/symbols";

export const maxDuration = 60;

/** Latest saved zones per symbol — reads the database only, never spends credit. */
export async function GET() {
  try {
    const [rows, spend] = await Promise.all([latestSnapshots(), creditSpent()]);
    return NextResponse.json({
      ok: true,
      results: rows.map((r) => r.analysis_json),
      savedAt: rows.reduce<string | null>((max, r) => (!max || r.created_at > max ? r.created_at : max), null),
      spend,
      limit: costLimit(),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed to load zones" }, { status: 500 });
  }
}

/** Pull any new bars from Databento (cached), recompute zones, save a snapshot. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { symbols?: string[]; confirm?: boolean };
    const symbols = body.symbols?.length
      ? body.symbols.map((s) => getSymbol(s)).filter((s): s is NonNullable<typeof s> => !!s)
      : FUTURES_SYMBOLS;
    const outcome = await runFuturesScan({ symbols, confirm: body.confirm === true });
    return NextResponse.json(outcome, { status: outcome.ok ? 200 : 409 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Scan failed" }, { status: 500 });
  }
}
