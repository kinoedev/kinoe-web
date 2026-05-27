import { NextResponse } from "next/server";
import { sql } from "@/lib/db/client";

export async function GET() {
  try {
    const [aiRow] = await sql`
      SELECT
        COUNT(*)::int                          AS total_analyses,
        COALESCE(SUM(cost_usd), 0)::float8    AS total_cost_usd,
        COALESCE(SUM(input_tokens), 0)::int   AS total_input_tokens,
        COALESCE(SUM(output_tokens), 0)::int  AS total_output_tokens
      FROM ai_analyses
    `;

    const [journalRow] = await sql`
      SELECT
        COUNT(*)::int                                                   AS total_entries,
        COUNT(*) FILTER (WHERE source = 'agent_signal')::int           AS agent_entries,
        COUNT(*) FILTER (WHERE source = 'manual')::int                 AS manual_entries,
        COUNT(*) FILTER (WHERE outcome = 'WIN')::int                   AS wins,
        COUNT(*) FILTER (WHERE outcome = 'LOSS')::int                  AS losses,
        COUNT(*) FILTER (WHERE outcome = 'BE')::int                    AS breakevens,
        COALESCE(SUM(r_multiple) FILTER (WHERE outcome IN ('WIN','LOSS','BE')), 0)::float8 AS total_r
      FROM journal_entries
    `;

    return NextResponse.json({
      ok: true,
      ai: {
        total_analyses: aiRow.total_analyses,
        total_cost_usd: aiRow.total_cost_usd,
        total_input_tokens: aiRow.total_input_tokens,
        total_output_tokens: aiRow.total_output_tokens,
      },
      journal: {
        total_entries: journalRow.total_entries,
        agent_entries: journalRow.agent_entries,
        manual_entries: journalRow.manual_entries,
        wins: journalRow.wins,
        losses: journalRow.losses,
        breakevens: journalRow.breakevens,
        total_r: journalRow.total_r,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Stats failed" },
      { status: 500 }
    );
  }
}
