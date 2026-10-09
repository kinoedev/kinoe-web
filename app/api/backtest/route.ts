import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { backtestMaxDays } from "@/lib/futures/store";

/** Recent backtest runs (summary), or one full run with ?id= */
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const rows = await sql`
        SELECT id, created_at, pair, window_start, window_end, params_jsonb, trades_jsonb, results_jsonb
        FROM backtests WHERE id = ${id}
      `;
      if (!rows[0]) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true, run: rows[0] });
    }
    const runs = await sql`
      SELECT id, created_at, pair, window_start, window_end, trades_count, win_rate, avg_r, params_jsonb
      FROM backtests WHERE strategy = 'zones-A-B'
      ORDER BY created_at DESC LIMIT 20
    `;
    return NextResponse.json({ ok: true, runs, maxDays: backtestMaxDays() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
