"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

type OverallStats = {
  total_trades: number; wins: number; losses: number; breakevens: number; open_trades: number;
  win_rate: number; avg_r: number; total_r: number; profit_factor: number | null;
  avg_win_r: number; avg_loss_r: number; best_trade_r: number; worst_trade_r: number;
};

type BreakdownRow = {
  total: number; wins: number; losses: number; win_rate: number; avg_r: number; total_r: number;
};

type PairRow = BreakdownRow & { pair: string };
type SetupRow = BreakdownRow & { setup_type: string };
type SourceRow = BreakdownRow & { source: string };

type EquityPoint = { trade_date: string; cumulative_r: number; r_multiple: number; outcome: string };

type RecentTrade = {
  id: string; pair: string; direction: string; setup_type: string | null; source: string;
  outcome: string; entry_price: string | null; exit_price: string | null;
  r_multiple: string | null; pnl: string | null; exited_at: string | null; ai_grade: string | null;
};

type AnalyticsData = {
  ok: boolean;
  overall: OverallStats;
  byPair: PairRow[];
  bySetup: SetupRow[];
  bySource: SourceRow[];
  equityCurve: EquityPoint[];
  recent: RecentTrade[];
};

function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }
function r(n: number | null) {
  if (n === null || n === undefined) return "—";
  const s = n.toFixed(2);
  return n > 0 ? `+${s}R` : `${s}R`;
}

function StatCard({ label, value, sub, color = "white" }: { label: string; value: string; sub?: string; color?: string }) {
  const colorMap: Record<string, string> = {
    white: "text-white", green: "text-emerald-300", red: "text-red-300",
    yellow: "text-yellow-300", purple: "text-purple-300", blue: "text-blue-300",
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] uppercase tracking-widest text-white/30">{label}</div>
      <div className={`mt-1.5 text-2xl font-semibold font-mono ${colorMap[color] ?? "text-white"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-white/30">{sub}</div>}
    </div>
  );
}

function WinBar({ wins, losses, breakevens }: { wins: number; losses: number; breakevens: number }) {
  const total = wins + losses + breakevens;
  if (total === 0) return <div className="h-2 rounded-full bg-white/5" />;
  return (
    <div className="flex h-2 overflow-hidden rounded-full">
      <div className="bg-emerald-500/70" style={{ width: `${(wins / total) * 100}%` }} />
      <div className="bg-white/20" style={{ width: `${(breakevens / total) * 100}%` }} />
      <div className="bg-red-500/70" style={{ width: `${(losses / total) * 100}%` }} />
    </div>
  );
}

function BreakdownTable<T extends BreakdownRow & { [key: string]: unknown }>({
  rows, labelKey, labelFn,
}: { rows: T[]; labelKey: keyof T; labelFn?: (v: string) => string }) {
  if (rows.length === 0) return <div className="text-xs text-white/30 py-4 text-center">No data yet</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-white/30 text-left border-b border-white/5">
            <th className="pb-2 pr-4 font-medium">Name</th>
            <th className="pb-2 pr-3 font-medium text-right">Trades</th>
            <th className="pb-2 pr-3 font-medium text-right">Win%</th>
            <th className="pb-2 pr-3 font-medium text-right">Avg R</th>
            <th className="pb-2 font-medium text-right">Total R</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const label = String(row[labelKey]);
            const display = labelFn ? labelFn(label) : label.replace("_", "/");
            return (
              <tr key={i} className="border-b border-white/5 last:border-0">
                <td className="py-2 pr-4 font-medium text-white/80">{display}</td>
                <td className="py-2 pr-3 text-right font-mono text-white/50">{row.total}</td>
                <td className="py-2 pr-3 text-right font-mono">
                  <span className={row.win_rate >= 0.5 ? "text-emerald-300" : row.win_rate >= 0.4 ? "text-yellow-300" : "text-red-300"}>
                    {pct(row.win_rate)}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right font-mono">
                  <span className={row.avg_r > 0 ? "text-emerald-300" : row.avg_r < 0 ? "text-red-300" : "text-white/40"}>
                    {r(row.avg_r)}
                  </span>
                </td>
                <td className="py-2 text-right font-mono">
                  <span className={row.total_r > 0 ? "text-emerald-300" : row.total_r < 0 ? "text-red-300" : "text-white/40"}>
                    {r(row.total_r)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EquityCurveChart({ points }: { points: EquityPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-white/30">
        No closed trades yet
      </div>
    );
  }
  const min = Math.min(0, ...points.map((p) => p.cumulative_r));
  const max = Math.max(0.1, ...points.map((p) => p.cumulative_r));
  const range = max - min || 1;
  const w = 100 / Math.max(1, points.length - 1);

  return (
    <div className="relative h-32 w-full">
      <svg viewBox={`0 0 100 100`} className="h-full w-full" preserveAspectRatio="none">
        {/* Zero line */}
        <line
          x1="0" y1={`${((max - 0) / range) * 100}`}
          x2="100" y2={`${((max - 0) / range) * 100}`}
          stroke="rgba(255,255,255,0.08)" strokeWidth="0.5"
        />
        {/* Equity line */}
        <polyline
          points={points.map((p, i) => `${i * w},${((max - p.cumulative_r) / range) * 100}`).join(" ")}
          fill="none"
          stroke={points[points.length - 1].cumulative_r >= 0 ? "#34d399" : "#f87171"}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        {/* Dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={i * w}
            cy={((max - p.cumulative_r) / range) * 100}
            r="1"
            fill={p.outcome === "WIN" ? "#34d399" : p.outcome === "LOSS" ? "#f87171" : "#9ca3af"}
          />
        ))}
      </svg>
      <div className="absolute bottom-0 right-0 text-[9px] text-white/30 font-mono">
        {r(points[points.length - 1].cumulative_r)}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics/performance")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
        setData(json);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const overall = data?.overall;

  return (
    <div className="relative min-h-screen bg-black text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-56 -left-56 h-[700px] w-[700px] rounded-full bg-purple-600/20 blur-3xl" />
        <div className="absolute -bottom-56 -right-56 h-[700px] w-[700px] rounded-full bg-fuchsia-600/20 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen">
        <Sidebar />
        <main className="flex-1">
          <Topbar />

          <div className="p-4 pb-24 md:p-6 md:pb-8">
            <div className="mb-6">
              <div className="text-sm text-white/80">Analytics</div>
              <div className="mt-1 text-xs text-white/40">Performance across all closed trades</div>
            </div>

            {loading ? (
              <div className="mt-10 text-center text-sm text-white/30">Loading performance data...</div>
            ) : error ? (
              <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">{error}</div>
            ) : !overall ? null : overall.total_trades === 0 ? (
              <div className="mt-16 flex flex-col items-center gap-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-purple-500/20 bg-purple-500/5">
                  <div className="text-2xl text-purple-300">📊</div>
                </div>
                <div className="text-sm text-white/60">No closed trades yet</div>
                <div className="max-w-sm text-xs text-white/30">
                  Analytics will populate once you close trades. Start by{" "}
                  <Link href="/journal/new" className="text-purple-300 hover:text-purple-200">logging a trade</Link>{" "}
                  or letting the agent find setups.
                </div>
              </div>
            ) : (
              <div className="space-y-6">

                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <StatCard
                    label="Win Rate"
                    value={pct(overall.win_rate)}
                    sub={`${overall.wins}W · ${overall.losses}L · ${overall.breakevens}BE`}
                    color={overall.win_rate >= 0.5 ? "green" : overall.win_rate >= 0.4 ? "yellow" : "red"}
                  />
                  <StatCard
                    label="Total R"
                    value={r(overall.total_r)}
                    sub={`${overall.total_trades} trades closed`}
                    color={overall.total_r > 0 ? "green" : overall.total_r < 0 ? "red" : "white"}
                  />
                  <StatCard
                    label="Avg R / Trade"
                    value={r(overall.avg_r)}
                    sub={`Win ${r(overall.avg_win_r)} · Loss ${r(overall.avg_loss_r)}`}
                    color={overall.avg_r > 0 ? "green" : overall.avg_r < 0 ? "red" : "white"}
                  />
                  <StatCard
                    label="Profit Factor"
                    value={overall.profit_factor !== null ? overall.profit_factor.toFixed(2) : "—"}
                    sub={`Best ${r(overall.best_trade_r)} · Worst ${r(overall.worst_trade_r)}`}
                    color={overall.profit_factor !== null && overall.profit_factor >= 1.5 ? "green" : overall.profit_factor !== null && overall.profit_factor >= 1 ? "yellow" : "red"}
                  />
                </div>

                {/* Win bar */}
                <div>
                  <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/30">W / BE / L distribution</div>
                  <WinBar wins={overall.wins} losses={overall.losses} breakevens={overall.breakevens} />
                  <div className="mt-1 flex gap-3 text-[9px] text-white/30">
                    <span><span className="text-emerald-400">{overall.wins}</span> wins</span>
                    <span><span className="text-white/50">{overall.breakevens}</span> BE</span>
                    <span><span className="text-red-400">{overall.losses}</span> losses</span>
                  </div>
                </div>

                {/* Equity curve */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="mb-3 text-[10px] uppercase tracking-widest text-white/30">Equity Curve (cumulative R)</div>
                  <EquityCurveChart points={data?.equityCurve ?? []} />
                </div>

                {/* Agent vs Kierra */}
                {data && data.bySource.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="mb-3 text-[10px] uppercase tracking-widest text-white/30">Agent vs You</div>
                    <BreakdownTable
                      rows={data.bySource}
                      labelKey="source"
                      labelFn={(s) => s === "agent" ? "Agent Signals" : s === "kierra" ? "Kierra (manual)" : s}
                    />
                  </div>
                )}

                {/* By pair */}
                {data && data.byPair.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="mb-3 text-[10px] uppercase tracking-widest text-white/30">By Pair</div>
                    <BreakdownTable rows={data.byPair} labelKey="pair" />
                  </div>
                )}

                {/* By setup */}
                {data && data.bySetup.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="mb-3 text-[10px] uppercase tracking-widest text-white/30">By Setup</div>
                    <BreakdownTable rows={data.bySetup} labelKey="setup_type" labelFn={(s) => s} />
                  </div>
                )}

                {/* Recent closed trades */}
                {data && data.recent.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="mb-3 text-[10px] uppercase tracking-widest text-white/30">Recent Closed Trades</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-white/30 text-left border-b border-white/5">
                            <th className="pb-2 pr-3 font-medium">Pair</th>
                            <th className="pb-2 pr-3 font-medium">Setup</th>
                            <th className="pb-2 pr-3 font-medium">Dir</th>
                            <th className="pb-2 pr-3 font-medium">Source</th>
                            <th className="pb-2 pr-3 font-medium">Outcome</th>
                            <th className="pb-2 pr-3 font-medium text-right">R</th>
                            <th className="pb-2 pr-3 font-medium">Grade</th>
                            <th className="pb-2 font-medium">Closed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.recent.map((t) => (
                            <tr key={t.id} className="border-b border-white/5 last:border-0">
                              <td className="py-2 pr-3 font-medium text-white/80">
                                <Link href={`/journal/${t.id}`} className="hover:text-purple-300 transition">
                                  {t.pair.replace("_", "/")}
                                </Link>
                              </td>
                              <td className="py-2 pr-3 text-white/50">{t.setup_type ?? "—"}</td>
                              <td className="py-2 pr-3">
                                <span className={t.direction === "LONG" ? "text-emerald-400" : "text-red-400"}>
                                  {t.direction}
                                </span>
                              </td>
                              <td className="py-2 pr-3">
                                <span className={t.source === "agent" ? "text-purple-300" : "text-blue-300"}>
                                  {t.source === "agent" ? "Agent" : "You"}
                                </span>
                              </td>
                              <td className="py-2 pr-3">
                                <span className={
                                  t.outcome === "WIN" ? "text-emerald-300" :
                                  t.outcome === "LOSS" ? "text-red-300" : "text-white/40"
                                }>
                                  {t.outcome}
                                </span>
                              </td>
                              <td className="py-2 pr-3 text-right font-mono">
                                {t.r_multiple !== null
                                  ? <span className={Number(t.r_multiple) > 0 ? "text-emerald-300" : "text-red-300"}>
                                      {r(Number(t.r_multiple))}
                                    </span>
                                  : "—"}
                              </td>
                              <td className="py-2 pr-3">
                                <span className={t.ai_grade ? "text-yellow-300" : "text-white/20"}>
                                  {t.ai_grade ?? "—"}
                                </span>
                              </td>
                              <td className="py-2 text-white/30">
                                {t.exited_at
                                  ? new Date(t.exited_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
