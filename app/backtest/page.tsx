"use client";

import { safeJson } from "@/lib/http";
import { useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { DEFAULT_PARAMS, type BacktestParams, type SkipCounts, type Trade } from "@/lib/backtest/engine";
import { breakdown, computeStats, verdict, type Stats } from "@/lib/backtest/stats";
import { FUTURES_SYMBOLS, formatPrice, getSymbol } from "@/lib/futures/symbols";

const CURVE = "#a855f7";

type RunInfo = { symbol: string; from: number; to: number; sessionsTested: number; setupsSeen: number; notes: string[] };
type Recent = { id: string; created_at: string; pair: string; window_start: string; window_end: string; trades_count: number; win_rate: string; avg_r: string };

const EMPTY_SKIPS: SkipCounts = {
  biasBlocked: 0,
  notAtValueEdge: 0,
  weakZone: 0,
  noTarget: 0,
  rrTooLow: 0,
  news: 0,
  dailyStop: 0,
  sessionOff: 0,
  tooLate: 0,
  busy: 0,
  orderNotFilled: 0,
};

const SKIP_LABELS: Record<keyof SkipCounts, string> = {
  weakZone: "Zone broke more than it held",
  biasBlocked: "Against the 1H bias",
  notAtValueEdge: "Ranging, but not at VAH/VAL",
  noTarget: "No next zone to target",
  rrTooLow: "Next zone closer than min R",
  news: "News blackout",
  dailyStop: "Daily loss stop hit",
  sessionOff: "Session switched off",
  tooLate: "After 3:30 CT",
  busy: "Already in a trade",
  orderNotFilled: "Entry order never filled",
};

function ct(ms: number) {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const fmtR = (r: number) => `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`;
const fmtUsd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const fmtPf = (pf: number) => (pf === Infinity ? "∞" : pf.toFixed(2));

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-lg border px-3 py-1.5 text-xs transition ${
        on ? "border-purple-400/60 bg-purple-500/20 text-purple-50" : "border-white/10 bg-white/[0.03] text-white/45 hover:text-white/70"
      }`}
    >
      {children}
    </button>
  );
}

function NumberField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-white/50">
      {label}
      <input
        type="number"
        value={value}
        step={step}
        min={0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-xs text-white outline-none focus:border-purple-400/60"
      />
    </label>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-white/40">{label}</div>
      <div className="mt-1 font-mono text-xl text-white">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-white/40">{sub}</div> : null}
    </div>
  );
}

/** Cumulative R by trade, with a crosshair tooltip. */
function EquityCurve({ trades }: { trades: Trade[] }) {
  const ordered = useMemo(() => [...trades].sort((a, b) => a.exitTs - b.exitTs), [trades]);
  const points = useMemo(() => {
    const out: number[] = [];
    for (const t of ordered) out.push((out.length ? out[out.length - 1] : 0) + t.r);
    return out;
  }, [ordered]);
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(800);

  // Draw at the real pixel width so text stays readable on phones.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length === 0) return null;
  const H = 240;
  const pad = { l: 44, r: 12, t: 12, b: 24 };
  const all = [0, ...points];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => pad.l + (i / Math.max(1, points.length)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / span) * (H - pad.t - pad.b);
  const path = all.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const ticks = [lo, (lo + hi) / 2, hi];

  const onMove = (e: React.PointerEvent) => {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * points.length);
    setHover(Math.min(points.length, Math.max(1, i)));
  };

  const t = hover ? ordered[hover - 1] : null;

  return (
    <div className="relative" ref={wrap}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Cumulative R over ${points.length} trades, ending at ${fmtR(points[points.length - 1])}`}
      >
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.06)" />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" className="fill-white/35 font-mono" fontSize="10">
              {v.toFixed(1)}R
            </text>
          </g>
        ))}
        {lo < 0 && hi > 0 ? <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.25)" /> : null}
        <text x={W - pad.r} y={H - 6} textAnchor="end" className="fill-white/30" fontSize="10">
          trade #{points.length}
        </text>
        <path d={path} fill="none" stroke={CURVE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover ? (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(points[hover - 1])} r={4} fill={CURVE} stroke="#09090b" strokeWidth={2} />
          </>
        ) : null}
      </svg>
      {t && hover ? (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-[11px] shadow-xl"
          style={{ left: `${Math.min(70, (x(hover) / W) * 100)}%` }}
        >
          <div className="font-mono text-sm text-white">{fmtR(points[hover - 1])}</div>
          <div className="text-white/50">
            Trade {hover} · {t.symbol} {t.setup} {t.dir === "LONG" ? "long" : "short"} · {fmtR(t.r)}
          </div>
          <div className="text-white/35">{ct(t.exitTs)} CT</div>
        </div>
      ) : null}
    </div>
  );
}

function BreakdownTable({ trades }: { trades: Trade[] }) {
  const rows = breakdown(trades);
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/40">
          <tr>
            <th className="px-3 py-2">Slice</th>
            <th className="px-3 py-2 text-right">Trades</th>
            <th className="px-3 py-2 text-right">Win %</th>
            <th className="px-3 py-2 text-right">Avg win</th>
            <th className="px-3 py-2 text-right">Expectancy</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2 text-right">PF</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, stats: s }) => (
            <tr key={label} className="border-t border-white/5 text-white/75">
              <td className="px-3 py-2">{label}</td>
              <td className="px-3 py-2 text-right font-mono">{s.trades}</td>
              <td className="px-3 py-2 text-right font-mono">{(s.winRate * 100).toFixed(0)}%</td>
              <td className="px-3 py-2 text-right font-mono">{fmtR(s.avgWinR)}</td>
              <td className={`px-3 py-2 text-right font-mono ${s.expectancyR > 0 ? "text-emerald-300" : "text-red-300"}`}>
                {fmtR(s.expectancyR)}
              </td>
              <td className="px-3 py-2 text-right font-mono">{fmtR(s.totalR)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmtPf(s.profitFactor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradesTable({ trades }: { trades: Trade[] }) {
  const [all, setAll] = useState(false);
  const ordered = [...trades].sort((a, b) => b.entryTs - a.entryTs);
  const shown = all ? ordered : ordered.slice(0, 50);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[860px] text-left text-[11px]">
          <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-3 py-2">Entry (CT)</th>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Setup</th>
              <th className="px-3 py-2">Session</th>
              <th className="px-3 py-2 text-right">Entry</th>
              <th className="px-3 py-2 text-right">Stop</th>
              <th className="px-3 py-2 text-right">Target</th>
              <th className="px-3 py-2 text-right">Exit</th>
              <th className="px-3 py-2 text-right">R</th>
              <th className="px-3 py-2">Zone</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => {
              const tick = getSymbol(t.symbol)?.tick ?? 0.01;
              return (
                <tr key={`${t.symbol}-${t.entryTs}`} className="border-t border-white/5 text-white/70">
                  <td className="whitespace-nowrap px-3 py-1.5">{ct(t.entryTs)}</td>
                  <td className="px-3 py-1.5">{t.symbol}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    {t.setup} · {t.dir === "LONG" ? "long" : "short"}
                  </td>
                  <td className="px-3 py-1.5">{t.session}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatPrice(t.entry, tick)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatPrice(t.stop, tick)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatPrice(t.target, tick)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">
                    {formatPrice(t.exit, tick)} <span className="text-white/35">{t.exitReason.toLowerCase()}</span>
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono ${t.r > 0 ? "text-emerald-300" : "text-red-300"}`}>{fmtR(t.r)}</td>
                  <td className="max-w-[260px] truncate px-3 py-1.5 text-white/45" title={t.zone}>
                    {t.zone}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ordered.length > 50 ? (
        <button onClick={() => setAll((v) => !v)} className="text-xs text-purple-200/80 hover:text-purple-100">
          {all ? "Show latest 50" : `Show all ${ordered.length} trades`}
        </button>
      ) : null}
    </div>
  );
}

function Rules() {
  return (
    <details className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-white/60">
      <summary className="cursor-pointer text-white/80">The rules being tested</summary>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-widest text-white/35">1H · the map</div>
          Zones rebuilt each session from data available at the open. Above the week&apos;s value with higher 1H lows → longs only. Below
          value with lower highs → shorts only. Inside value → both, only at VAH/VAL.
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-widest text-white/35">15m · the setup</div>
          <b className="text-white/80">A</b> — 15m close through a zone (two closes at night), then a retest within 4 bars.{" "}
          <b className="text-white/80">B</b> — 15m wick through a zone that closes back inside; trade back the other way.
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-widest text-white/35">5m · the trigger</div>
          Rejection candle at the zone; stop-entry 1 tick past it. Stop beyond the zone and candle. Target the next zone — skipped
          if it&apos;s under the min R. Fills on 1m bars, stop checked before target, 1 tick slippage on stops.
        </div>
      </div>
    </details>
  );
}

export default function BacktestPage() {
  const [symbols, setSymbols] = useState<string[]>(["MNQ"]);
  const [days, setDays] = useState(60);
  const [maxDays, setMaxDays] = useState(90);
  const [params, setParams] = useState<BacktestParams>(DEFAULT_PARAMS);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ message: string } | null>(null);
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [skips, setSkips] = useState<SkipCounts>(EMPTY_SKIPS);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);

  const loadRecent = () =>
    fetch("/api/backtest", { cache: "no-store" })
      .then(safeJson)
      .then((d) => {
        if (d.ok) {
          setRecent(d.runs);
          if (d.maxDays) setMaxDays(d.maxDays);
        }
      })
      .catch(() => null);

  useEffect(() => {
    loadRecent();
  }, []);

  const set = <K extends keyof BacktestParams>(k: K, v: BacktestParams[K]) => setParams((p) => ({ ...p, [k]: v }));
  const flip = (k: keyof BacktestParams) => setParams((p) => ({ ...p, [k]: !p[k] }));

  const run = async (confirmSpend = false) => {
    setRunning(true);
    setError(null);
    setConfirm(null);
    const allTrades: Trade[] = [];
    const allSkips: SkipCounts = { ...EMPTY_SKIPS };
    const infos: RunInfo[] = [];
    try {
      for (const sym of symbols) {
        setProgress(`${sym}: checking history…`);
        const d = await fetch("/api/backtest/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: sym, days, confirm: confirmSpend }),
        }).then(safeJson);
        if (!d.ok) {
          if (d.needsConfirm) {
            setConfirm({ message: d.message });
            return;
          }
          throw new Error(d.error ?? `${sym}: download failed`);
        }
        setProgress(`${sym}: running ${days} days…`);
        const res = await fetch("/api/backtest/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: sym, days, params }),
        }).then(safeJson);
        if (!res.ok) throw new Error(res.error ?? `${sym}: backtest failed`);
        allTrades.push(...res.result.trades);
        for (const k of Object.keys(allSkips) as (keyof SkipCounts)[]) allSkips[k] += res.result.skips[k] ?? 0;
        infos.push({
          symbol: sym,
          from: res.result.from,
          to: res.result.to,
          sessionsTested: res.result.sessionsTested,
          setupsSeen: res.result.setupsSeen,
          notes: res.result.notes,
        });
      }
      setTrades(allTrades);
      setSkips(allSkips);
      setRuns(infos);
      loadRecent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const loadRun = async (id: string) => {
    setError(null);
    const d = await fetch(`/api/backtest?id=${id}`, { cache: "no-store" }).then(safeJson);
    if (!d.ok) return setError(d.error ?? "Failed to load run");
    const r = d.run;
    setTrades(r.trades_jsonb ?? []);
    setSkips({ ...EMPTY_SKIPS, ...(r.results_jsonb?.skips ?? {}) });
    setRuns([
      {
        symbol: r.pair,
        from: new Date(r.window_start).getTime(),
        to: new Date(r.window_end).getTime(),
        sessionsTested: r.results_jsonb?.sessionsTested ?? 0,
        setupsSeen: r.results_jsonb?.setupsSeen ?? 0,
        notes: r.results_jsonb?.notes ?? [],
      },
    ]);
    if (r.params_jsonb) setParams({ ...DEFAULT_PARAMS, ...r.params_jsonb });
  };

  const stats: Stats | null = trades ? computeStats(trades) : null;
  const v = stats ? verdict(stats) : null;
  const skipRows = (Object.keys(SKIP_LABELS) as (keyof SkipCounts)[]).filter((k) => skips[k] > 0).sort((a, b) => skips[b] - skips[a]);
  const setupsSeen = runs.reduce((s, r) => s + r.setupsSeen, 0);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-56 -left-56 h-[700px] w-[700px] rounded-full bg-purple-600/15 blur-3xl" />
        <div className="absolute -bottom-56 -right-56 h-[700px] w-[700px] rounded-full bg-fuchsia-600/15 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <Topbar />
          <div className="mx-auto max-w-7xl space-y-5 p-4 pb-24 md:p-6 md:pb-8">
            <Rules />

            {/* Controls */}
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center gap-2">
                {FUTURES_SYMBOLS.map((s) => (
                  <Toggle
                    key={s.root}
                    on={symbols.includes(s.root)}
                    onClick={() =>
                      setSymbols((cur) => (cur.includes(s.root) ? cur.filter((x) => x !== s.root) : [...cur, s.root]))
                    }
                  >
                    {s.root}
                  </Toggle>
                ))}
                <span className="mx-1 h-5 w-px bg-white/10" />
                {[30, 60, 90].filter((d) => d <= maxDays).map((d) => (
                  <Toggle key={d} on={days === d} onClick={() => setDays(d)}>
                    {d} days
                  </Toggle>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Toggle on={params.setupA} onClick={() => flip("setupA")}>Setup A</Toggle>
                <Toggle on={params.setupB} onClick={() => flip("setupB")}>Setup B</Toggle>
                <span className="mx-1 h-5 w-px bg-white/10" />
                <Toggle on={params.rth} onClick={() => flip("rth")}>RTH</Toggle>
                <Toggle on={params.eth} onClick={() => flip("eth")}>Evening</Toggle>
                <span className="mx-1 h-5 w-px bg-white/10" />
                <Toggle on={params.biasFilter} onClick={() => flip("biasFilter")}>1H bias</Toggle>
                <Toggle on={params.zoneQualityFilter} onClick={() => flip("zoneQualityFilter")}>Skip weak zones</Toggle>
                <Toggle on={params.newsFilter} onClick={() => flip("newsFilter")}>News blackout</Toggle>
                <Toggle on={params.nightDoubleClose} onClick={() => flip("nightDoubleClose")}>2 closes at night</Toggle>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <NumberField label="Min R" value={params.minRR} step={0.5} onChange={(n) => set("minRR", n)} />
                <NumberField label="Losses / day" value={params.maxLossesPerDay} step={1} onChange={(n) => set("maxLossesPerDay", n)} />
                <NumberField label="Fees / side $" value={params.commissionPerSide} step={0.01} onChange={(n) => set("commissionPerSide", n)} />
                <button
                  onClick={() => run(false)}
                  disabled={running || symbols.length === 0 || (!params.setupA && !params.setupB)}
                  className="ml-auto rounded-xl border border-purple-400/50 bg-purple-500/20 px-5 py-2 text-sm text-purple-50 transition hover:bg-purple-500/30 disabled:opacity-50"
                >
                  {running ? progress ?? "Running…" : "Run backtest"}
                </button>
              </div>
            </div>

            {confirm ? (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-yellow-400/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-50">
                <span>{confirm.message}</span>
                <div className="ml-auto flex gap-2">
                  <button onClick={() => setConfirm(null)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70">
                    Cancel
                  </button>
                  <button
                    onClick={() => run(true)}
                    className="rounded-lg border border-yellow-300/50 bg-yellow-400/20 px-3 py-1.5 text-xs text-yellow-50"
                  >
                    Spend it and run
                  </button>
                </div>
              </div>
            ) : null}
            {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}

            {stats && v ? (
              <>
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    v.tone === "good"
                      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-50"
                      : v.tone === "bad"
                        ? "border-red-400/30 bg-red-500/10 text-red-50"
                        : "border-yellow-400/30 bg-yellow-500/10 text-yellow-50"
                  }`}
                >
                  {v.text}
                  <div className="mt-1 text-[11px] opacity-60">
                    {runs.map((r) => `${r.symbol} ${new Date(r.from).toLocaleDateString()}–${new Date(r.to).toLocaleDateString()}`).join(" · ")}
                    {" · "}
                    {setupsSeen} setups seen
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                  <Tile label="Trades" value={String(stats.trades)} sub={`${stats.wins} W · ${stats.losses} L`} />
                  <Tile label="Win rate" value={`${(stats.winRate * 100).toFixed(0)}%`} />
                  <Tile label="Expectancy" value={fmtR(stats.expectancyR)} sub="per trade" />
                  <Tile label="Avg win" value={fmtR(stats.avgWinR)} sub={`avg loss ${fmtR(stats.avgLossR)}`} />
                  <Tile label="Total" value={fmtR(stats.totalR)} />
                  <Tile label="Max drawdown" value={`−${stats.maxDrawdownR.toFixed(2)}R`} sub={`PF ${fmtPf(stats.profitFactor)}`} />
                  <Tile label="Net, 1 contract" value={fmtUsd(stats.totalUsd)} sub="after fees" />
                </div>

                {stats.trades > 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="mb-2 text-xs text-white/50">Cumulative R</div>
                    <EquityCurve trades={trades ?? []} />
                  </div>
                ) : null}

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                  <BreakdownTable trades={trades ?? []} />
                  {skipRows.length ? (
                    <div className="rounded-2xl border border-white/10 p-4">
                      <div className="mb-2 text-[10px] uppercase tracking-widest text-white/40">Setups filtered out</div>
                      <div className="space-y-1.5">
                        {skipRows.map((k) => (
                          <div key={k} className="flex justify-between gap-3 text-xs text-white/60">
                            <span>{SKIP_LABELS[k]}</span>
                            <span className="font-mono text-white/80">{skips[k]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {runs.flatMap((r) => r.notes).map((n, i) => (
                  <div key={i} className="text-xs text-white/40">
                    {n}
                  </div>
                ))}

                {stats.trades > 0 ? <TradesTable trades={trades ?? []} /> : null}
              </>
            ) : !running ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-12 text-center text-sm text-white/50">
                Pick contracts and a window, then run. The first run per contract downloads 1-minute history from Databento — you&apos;ll
                see the cost before anything is spent.
              </div>
            ) : null}

            {recent.length ? (
              <div className="rounded-2xl border border-white/10 p-4">
                <div className="mb-2 text-[10px] uppercase tracking-widest text-white/40">Recent runs</div>
                <div className="divide-y divide-white/5">
                  {recent.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => loadRun(r.id)}
                      className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 py-2 text-left text-xs text-white/60 hover:text-white"
                    >
                      <span className="w-12 text-white/85">{r.pair}</span>
                      <span>
                        {new Date(r.window_start).toLocaleDateString()} – {new Date(r.window_end).toLocaleDateString()}
                      </span>
                      <span className="font-mono">{r.trades_count} trades</span>
                      <span className="font-mono">{(Number(r.win_rate) * 100).toFixed(0)}% win</span>
                      <span className={`font-mono ${Number(r.avg_r) > 0 ? "text-emerald-300" : "text-red-300"}`}>{fmtR(Number(r.avg_r))}</span>
                      <span className="ml-auto text-white/30">{new Date(r.created_at).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
