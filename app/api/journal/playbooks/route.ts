import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { computeStats } from "@/lib/backtest/stats";
import type { Trade } from "@/lib/backtest/engine";
import { ensureDefaultPlaybooks, listPlaybooks, savePlaybook, type Playbook } from "@/lib/journal/store";

/** Playbooks + the latest backtest result for their linked setup (latest run per contract, combined). */
export async function GET() {
  try {
    await ensureDefaultPlaybooks();
    const playbooks = await listPlaybooks();
    const runs = (await sql`
      SELECT DISTINCT ON (pair) pair, created_at, window_start, window_end, trades_jsonb
      FROM backtests WHERE strategy = 'zones-A-B'
      ORDER BY pair, created_at DESC
    `) as { pair: string; created_at: string; window_start: string; window_end: string; trades_jsonb: Trade[] | null }[];
    const all = runs.flatMap((r) => r.trades_jsonb ?? []);
    const backtest: Record<string, unknown> = {};
    for (const setup of ["A", "B"] as const) {
      const ts = all.filter((t) => t.setup === setup);
      backtest[setup] = ts.length
        ? { stats: computeStats(ts), contracts: runs.map((r) => r.pair), ranAt: runs.map((r) => r.created_at).sort().pop() }
        : null;
    }
    return NextResponse.json({ ok: true, playbooks, backtest });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Playbook> & { id?: string };
    const playbook = await savePlaybook(body);
    return NextResponse.json({ ok: true, playbook });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
