import { NextResponse } from "next/server";
import { sql } from "@/lib/db/client";

export async function GET() {
  try {
    // Overall summary
    const [overall] = await sql`
      SELECT
        COUNT(*)::int                                                          AS total_trades,
        COUNT(*) FILTER (WHERE outcome = 'WIN')::int                          AS wins,
        COUNT(*) FILTER (WHERE outcome = 'LOSS')::int                         AS losses,
        COUNT(*) FILTER (WHERE outcome = 'BE')::int                           AS breakevens,
        COUNT(*) FILTER (WHERE outcome = 'OPEN' OR outcome IS NULL)::int      AS open_trades,
        COALESCE(AVG(r_multiple) FILTER (WHERE outcome IN ('WIN','LOSS','BE')), 0)::float8  AS avg_r,
        COALESCE(SUM(r_multiple) FILTER (WHERE outcome IN ('WIN','LOSS','BE')), 0)::float8  AS total_r,
        COALESCE(SUM(r_multiple) FILTER (WHERE outcome = 'WIN'), 0)::float8   AS gross_profit_r,
        COALESCE(ABS(SUM(r_multiple) FILTER (WHERE outcome = 'LOSS')), 0)::float8 AS gross_loss_r,
        COALESCE(AVG(r_multiple) FILTER (WHERE outcome = 'WIN'), 0)::float8   AS avg_win_r,
        COALESCE(AVG(r_multiple) FILTER (WHERE outcome = 'LOSS'), 0)::float8  AS avg_loss_r,
        COALESCE(MAX(r_multiple), 0)::float8                                  AS best_trade_r,
        COALESCE(MIN(r_multiple), 0)::float8                                  AS worst_trade_r
      FROM journal_entries
      WHERE outcome IN ('WIN','LOSS','BE')
    `;

    // By source (agent vs kierra)
    const bySource = await sql`
      SELECT
        source,
        COUNT(*)::int                                               AS total,
        COUNT(*) FILTER (WHERE outcome = 'WIN')::int               AS wins,
        COUNT(*) FILTER (WHERE outcome = 'LOSS')::int              AS losses,
        COALESCE(AVG(r_multiple) FILTER (WHERE outcome IN ('WIN','LOSS','BE')), 0)::float8 AS avg_r,
        COALESCE(SUM(r_multiple) FILTER (WHERE outcome IN ('WIN','LOSS','BE')), 0)::float8 AS total_r
      FROM journal_entries
      WHERE outcome IN ('WIN','LOSS','BE')
      GROUP BY source
    `;

    // By pair
    const byPair = await sql`
      SELECT
        pair,
        COUNT(*)::int                                               AS total,
        COUNT(*) FILTER (WHERE outcome = 'WIN')::int               AS wins,
        COUNT(*) FILTER (WHERE outcome = 'LOSS')::int              AS losses,
        COALESCE(AVG(r_multiple) FILTER (WHERE outcome IN ('WIN','LOSS','BE')), 0)::float8 AS avg_r,
        COALESCE(SUM(r_multiple) FILTER (WHERE outcome IN ('WIN','LOSS','BE')), 0)::float8 AS total_r
      FROM journal_entries
      WHERE outcome IN ('WIN','LOSS','BE')
      GROUP BY pair
      ORDER BY total DESC
    `;

    // By setup type
    const bySetup = await sql`
      SELECT
        COALESCE(setup_type, 'Unknown') AS setup_type,
        COUNT(*)::int                                               AS total,
        COUNT(*) FILTER (WHERE outcome = 'WIN')::int               AS wins,
        COUNT(*) FILTER (WHERE outcome = 'LOSS')::int              AS losses,
        COALESCE(AVG(r_multiple) FILTER (WHERE outcome IN ('WIN','LOSS','BE')), 0)::float8 AS avg_r,
        COALESCE(SUM(r_multiple) FILTER (WHERE outcome IN ('WIN','LOSS','BE')), 0)::float8 AS total_r
      FROM journal_entries
      WHERE outcome IN ('WIN','LOSS','BE')
      GROUP BY setup_type
      ORDER BY total DESC
    `;

    // Recent closed trades (last 20)
    const recent = await sql`
      SELECT id, pair, direction, setup_type, source, outcome,
             entry_price, exit_price, stop_loss, take_profit,
             r_multiple, pnl, entered_at, exited_at, ai_grade, ai_score
      FROM journal_entries
      WHERE outcome IN ('WIN','LOSS','BE')
      ORDER BY exited_at DESC NULLS LAST
      LIMIT 20
    `;

    // Equity curve — cumulative R by trade date
    const equityCurve = await sql`
      SELECT
        exited_at::date AS trade_date,
        SUM(r_multiple) OVER (ORDER BY exited_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::float8 AS cumulative_r,
        r_multiple::float8,
        outcome
      FROM journal_entries
      WHERE outcome IN ('WIN','LOSS','BE') AND exited_at IS NOT NULL
      ORDER BY exited_at ASC
    `;

    const closed = Number(overall.wins) + Number(overall.losses) + Number(overall.breakevens);
    const winRate = closed > 0 ? Number(overall.wins) / closed : 0;
    const profitFactor = Number(overall.gross_loss_r) > 0
      ? Number(overall.gross_profit_r) / Number(overall.gross_loss_r)
      : null;

    return NextResponse.json({
      ok: true,
      overall: {
        total_trades: Number(overall.total_trades),
        wins: Number(overall.wins),
        losses: Number(overall.losses),
        breakevens: Number(overall.breakevens),
        open_trades: Number(overall.open_trades),
        win_rate: winRate,
        avg_r: Number(overall.avg_r),
        total_r: Number(overall.total_r),
        profit_factor: profitFactor,
        avg_win_r: Number(overall.avg_win_r),
        avg_loss_r: Number(overall.avg_loss_r),
        best_trade_r: Number(overall.best_trade_r),
        worst_trade_r: Number(overall.worst_trade_r),
      },
      bySource: bySource.map((r) => ({
        source: r.source,
        total: Number(r.total),
        wins: Number(r.wins),
        losses: Number(r.losses),
        win_rate: Number(r.total) > 0 ? Number(r.wins) / Number(r.total) : 0,
        avg_r: Number(r.avg_r),
        total_r: Number(r.total_r),
      })),
      byPair: byPair.map((r) => ({
        pair: r.pair,
        total: Number(r.total),
        wins: Number(r.wins),
        losses: Number(r.losses),
        win_rate: Number(r.total) > 0 ? Number(r.wins) / Number(r.total) : 0,
        avg_r: Number(r.avg_r),
        total_r: Number(r.total_r),
      })),
      bySetup: bySetup.map((r) => ({
        setup_type: r.setup_type,
        total: Number(r.total),
        wins: Number(r.wins),
        losses: Number(r.losses),
        win_rate: Number(r.total) > 0 ? Number(r.wins) / Number(r.total) : 0,
        avg_r: Number(r.avg_r),
        total_r: Number(r.total_r),
      })),
      recent: recent,
      equityCurve: equityCurve.map((r) => ({
        trade_date: r.trade_date,
        cumulative_r: Number(r.cumulative_r),
        r_multiple: Number(r.r_multiple),
        outcome: r.outcome,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Analytics failed" },
      { status: 500 }
    );
  }
}
