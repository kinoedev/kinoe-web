"use client";

import { safeJson } from "@/lib/http";
import { useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { FUTURES_SYMBOLS } from "@/lib/futures/symbols";
import { scoreBreak, type Quality } from "@/lib/indicators/breakout";
import { explainFailures, explainStudy, failureSummary, significant, studySummary, type Bucket, type FailureRow, type StudyRow } from "@/lib/indicators/breakoutStats";

const QUALITY_STYLE: Record<Quality, string> = {
  STRONG: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
  WEAK: "border-white/15 bg-white/5 text-white/60",
  TRAP: "border-red-400/40 bg-red-500/10 text-red-100",
};
const QUALITY_TEXT: Record<Quality, string> = { STRONG: "Strong", WEAK: "Weak", TRAP: "Likely trap" };

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-lg border px-3 py-1.5 text-xs transition ${on ? "border-purple-400/60 bg-purple-500/20 text-purple-50" : "border-white/10 bg-white/[0.03] text-white/45 hover:text-white/70"}`}
    >
      {children}
    </button>
  );
}

function FollowBar({ b, base }: { b: Bucket; base: number }) {
  return (
    <div className="relative h-2 w-full rounded-full bg-white/10" title={`${pct(b.follow)} followed through · ${pct(b.fail)} failed`}>
      <div className="absolute inset-y-0 left-0 rounded-full bg-purple-400" style={{ width: `${b.follow * 100}%` }} />
      <div className="absolute -inset-y-1 w-px bg-white/60" style={{ left: `${base * 100}%` }} />
    </div>
  );
}

export default function BreakoutLabPage() {
  const [symbols, setSymbols] = useState<string[]>(FUTURES_SYMBOLS.map((s) => s.root));
  const [days, setDays] = useState(60);
  const [rows, setRows] = useState<StudyRow[] | null>(null);
  const [fails, setFails] = useState<FailureRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const run = async (confirmSpend = false) => {
    setRunning(true);
    setError(null);
    setConfirm(null);
    const all: StudyRow[] = [];
    const allFails: FailureRow[] = [];
    try {
      for (const sym of symbols) {
        setProgress(`${sym}: checking history…`);
        const d = await fetch("/api/backtest/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: sym, days, confirm: confirmSpend }),
        }).then(safeJson);
        if (!d.ok) {
          if (d.needsConfirm) return setConfirm(d.message);
          throw new Error(d.error ?? `${sym}: download failed`);
        }
        setProgress(`${sym}: reading every break…`);
        const s = await fetch("/api/breakouts/study", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol: sym, days }),
        }).then(safeJson);
        if (!s.ok) throw new Error(s.error ?? `${sym}: study failed`);
        all.push(...s.rows);
        allFails.push(...(s.failures ?? []));
      }
      setRows(all);
      setFails(allFails);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Study failed");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  // Labels are recomputed from the features so every run reflects the current weights.
  const relabelled = useMemo(() => rows?.map((r) => ({ ...r, ...scoreBreak(r.features) })) ?? null, [rows]);
  const summary = useMemo(() => (relabelled ? studySummary(relabelled) : null), [relabelled]);
  const plain = useMemo(() => (summary ? explainStudy(summary) : null), [summary]);
  const fsum = useMemo(() => (fails ? failureSummary(fails) : null), [fails]);
  const fplain = useMemo(() => (fsum ? explainFailures(fsum, summary ? summary.overall.follow : null) : null), [fsum, summary]);
  const recent = useMemo(() => (relabelled ? [...relabelled].sort((a, b) => b.ts - a.ts).slice(0, 15) : []), [relabelled]);

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
            <details className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs leading-5 text-white/60">
              <summary className="cursor-pointer text-white/80">What this measures</summary>
              <div className="mt-2 space-y-1.5">
                <p>
                  Every 15m candle that <b className="text-white/80">closes</b> through one of your zones is read at the close — liquidity sweeps (PDH/PDL, Asia &amp; London
                  highs/lows, equal highs/lows), displacement &amp; fair value gaps, volume vs the same time on prior days, stochastic divergence and 1H structure — and
                  labelled Strong, Weak or Likely trap.
                </p>
                <p>
                  Then it checks what happened: <b className="text-white/80">followed through</b> = price ran 1 ATR beyond the close within 2 hours before closing back through
                  the zone. <b className="text-white/80">Failed</b> = it closed back through first. Each feature is kept only if breaks with it follow through clearly more
                  often than breaks without it.
                </p>
              </div>
            </details>

            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              {FUTURES_SYMBOLS.map((s) => (
                <Toggle key={s.root} on={symbols.includes(s.root)} onClick={() => setSymbols((c) => (c.includes(s.root) ? c.filter((x) => x !== s.root) : [...c, s.root]))}>
                  {s.root}
                </Toggle>
              ))}
              <span className="mx-1 h-5 w-px bg-white/10" />
              {[30, 60, 90].map((d) => (
                <Toggle key={d} on={days === d} onClick={() => setDays(d)}>
                  {d} days
                </Toggle>
              ))}
              <button
                onClick={() => run(false)}
                disabled={running || !symbols.length}
                className="ml-auto rounded-xl border border-purple-400/50 bg-purple-500/20 px-5 py-2 text-sm text-purple-50 hover:bg-purple-500/30 disabled:opacity-50"
              >
                {running ? progress ?? "Running…" : "Run study"}
              </button>
            </div>

            {confirm ? (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-yellow-400/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-50">
                <span>{confirm}</span>
                <div className="ml-auto flex gap-2">
                  <button onClick={() => setConfirm(null)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70">
                    Cancel
                  </button>
                  <button onClick={() => run(true)} className="rounded-lg border border-yellow-300/50 bg-yellow-400/20 px-3 py-1.5 text-xs text-yellow-50">
                    Spend it and run
                  </button>
                </div>
              </div>
            ) : null}
            {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}

            {summary ? (
              <>
                {plain ? (
                  <div className="space-y-4 rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 to-black p-5">
                    <div className="text-[10px] uppercase tracking-widest text-purple-200/70">What this means</div>
                    <p className="text-sm leading-6 text-white/85">{plain.headline}</p>
                    <p className="text-sm leading-6 text-white/70">{plain.label}</p>
                    {plain.helps.length || plain.warns.length ? (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {[...plain.helps.map((h) => ({ ...h, good: true })), ...plain.warns.map((w) => ({ ...w, good: false }))].map((x) => (
                          <div key={x.feature} className={`rounded-xl border p-3 ${x.good ? "border-emerald-400/30 bg-emerald-500/[0.06]" : "border-red-400/30 bg-red-500/[0.06]"}`}>
                            <div className={`text-xs font-medium ${x.good ? "text-emerald-200" : "text-red-200"}`}>
                              {x.good ? "Rule to keep" : "Warning sign"} · {x.feature}
                            </div>
                            <div className="mt-1 text-sm text-white/85">{x.rule}</div>
                            <div className="mt-1 text-[11px] text-white/45">
                              {x.what}. {x.detail}.
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-white/60">No single feature clearly separates good breaks from bad ones yet.</p>
                    )}
                    {plain.unclear.length ? (
                      <div className="text-xs text-white/50">
                        <div className="mb-1 text-white/60">Interesting but not proven:</div>
                        <ul className="list-disc space-y-0.5 pl-5">
                          {plain.unclear.map((u) => (
                            <li key={u}>{u}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {plain.caveat ? <div className="text-[11px] text-white/40">{plain.caveat}</div> : null}
                    <div className="text-[11px] text-white/35">
                      Everything not listed above moved the result by less than chance would — it&apos;s noise on these contracts. Details below; the white tick on each bar is
                      the {pct(summary.overall.follow)} baseline.
                    </div>
                  </div>
                ) : null}

                {fsum && fplain ? (
                  <div className="space-y-3 rounded-2xl border border-sky-500/25 bg-sky-950/20 p-5">
                    <div className="text-[10px] uppercase tracking-widest text-sky-200/70">Failure tests — the course setup</div>
                    {fplain.map((line) => (
                      <p key={line} className="text-sm leading-6 text-white/80">
                        {line}
                      </p>
                    ))}
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[480px] text-left text-xs">
                        <thead className="text-[10px] uppercase tracking-wider text-white/40">
                          <tr>
                            <th className="px-3 py-1.5">Feature</th>
                            <th className="px-3 py-1.5 text-right">Fade worked with</th>
                            <th className="px-3 py-1.5 text-right">Without</th>
                            <th className="px-3 py-1.5">Verdict</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fsum.features.map((f) => {
                            const sig = significant(f.with, f.without);
                            return (
                              <tr key={f.feature} className="border-t border-white/5 text-white/75">
                                <td className="px-3 py-1.5">{f.feature}</td>
                                <td className="px-3 py-1.5 text-right font-mono">
                                  {f.with.n ? pct(f.with.follow) : "—"} <span className="text-white/30">({f.with.n})</span>
                                </td>
                                <td className="px-3 py-1.5 text-right font-mono">
                                  {f.without.n ? pct(f.without.follow) : "—"} <span className="text-white/30">({f.without.n})</span>
                                </td>
                                <td className="px-3 py-1.5">
                                  {sig ? (
                                    <span className={f.lift > 0 ? "text-emerald-300" : "text-red-300"}>{f.lift > 0 ? "✓ helps" : "✓ hurts"}</span>
                                  ) : (
                                    <span className="text-white/35">{f.with.n < 30 ? "too few" : "noise"}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-[11px] text-white/40">
                      Worked = price moved 1 ATR back toward value before a 15m candle closed past the wick (your stop). Divergence = RSI(14) failed to confirm the new
                      high/low vs the last swing.
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="mb-3 text-xs text-white/60">Does the label work?</div>
                    <div className="space-y-3">
                      {summary.byQuality.map((q, i) => {
                        const key = (["STRONG", "WEAK", "TRAP"] as Quality[])[i];
                        return (
                          <div key={q.label}>
                            <div className="mb-1 flex items-center gap-2 text-xs">
                              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${QUALITY_STYLE[key]}`}>{q.label}</span>
                              <span className="text-white/40">{q.n} breaks</span>
                              <span className="ml-auto font-mono text-white/85">{q.n ? pct(q.follow) : "—"}</span>
                            </div>
                            <FollowBar b={q} base={summary.overall.follow} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 text-[11px] text-white/40">Strong should sit clearly right of the tick and Likely trap clearly left. If they don&apos;t, the weights need changing.</div>
                    <div className="mt-4 space-y-1">
                      {summary.bySymbol.map((b) => (
                        <div key={b.label} className="flex justify-between text-xs text-white/55">
                          <span>{b.label}</span>
                          <span className="font-mono">
                            {b.n} · {pct(b.follow)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/40">
                        <tr>
                          <th className="px-3 py-2">Feature</th>
                          <th className="px-3 py-2 text-right">With</th>
                          <th className="px-3 py-2 text-right">Without</th>
                          <th className="px-3 py-2 text-right">Diff</th>
                          <th className="px-3 py-2">Verdict</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.features.map((f) => {
                          const sig = significant(f.with, f.without);
                          return (
                            <tr key={f.feature} className="border-t border-white/5 text-white/75">
                              <td className="px-3 py-2">{f.feature}</td>
                              <td className="px-3 py-2 text-right font-mono">
                                {f.with.n ? pct(f.with.follow) : "—"} <span className="text-white/30">({f.with.n})</span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {pct(f.without.follow)} <span className="text-white/30">({f.without.n})</span>
                              </td>
                              <td className={`px-3 py-2 text-right font-mono ${f.lift > 0 ? "text-emerald-300" : f.lift < 0 ? "text-red-300" : "text-white/40"}`}>
                                {f.with.n ? `${f.lift > 0 ? "+" : ""}${Math.round(f.lift * 100)} pts` : "—"}
                              </td>
                              <td className="px-3 py-2">
                                {sig ? (
                                  <span className={f.lift > 0 ? "text-emerald-300" : "text-red-300"}>{f.lift > 0 ? "✓ helps" : "✓ warns"}</span>
                                ) : (
                                  <span className="text-white/35">{f.with.n < 30 ? "too few" : "noise"}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10">
                  <div className="px-4 pt-3 text-xs text-white/60">Latest breaks</div>
                  <div className="divide-y divide-white/5">
                    {recent.map((r) => (
                      <div key={`${r.symbol}-${r.ts}-${r.dir}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs">
                        <span className="w-28 text-white/45">
                          {new Date(r.ts).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                        <span className="w-10 text-white/85">{r.symbol}</span>
                        <span className={r.dir === "LONG" ? "text-emerald-200/80" : "text-red-200/80"}>{r.dir === "LONG" ? "↑" : "↓"}</span>
                        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${QUALITY_STYLE[r.quality]}`}>
                          {QUALITY_TEXT[r.quality]} {r.score}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-white/50">
                          {scoreBreak(r.features)
                            .reasons.map((x) => `${x.good ? "+" : "−"} ${x.text}`)
                            .join(" · ")}
                        </span>
                        <span className={r.followed ? "text-emerald-300" : r.failed ? "text-red-300" : "text-white/40"}>
                          {r.followed ? "followed through" : r.failed ? "failed" : "drifted"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : !running ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-12 text-center text-sm text-white/50">
                Run the study to see which breakout signals actually work on your contracts. It uses the same cached history as the backtester.
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
