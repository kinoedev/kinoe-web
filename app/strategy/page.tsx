"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { safeJson } from "@/lib/http";
import { money, todayTradingDay } from "@/lib/journal/format";
import type { JournalTrade } from "@/lib/journal/store";
import { BIAS, CHECKLIST, EVIDENCE, MANAGEMENT, NO_TRADE, ONE_LINER, PLAN_VERSION, POINT_VALUES, PREP, REVIEW, RISK, SETUPS } from "@/lib/strategy/plan";

function Section({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="font-mono text-xs text-purple-300/70">{String(n).padStart(2, "0")}</span>
        <h2 className="text-base text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Today() {
  const [trades, setTrades] = useState<JournalTrade[] | null>(null);
  const day = todayTradingDay();
  useEffect(() => {
    fetch(`/api/journal/trades?from=${day}&to=${day}`, { cache: "no-store" })
      .then(safeJson)
      .then((d) => setTrades(d.ok ? d.trades : []))
      .catch(() => setTrades([]));
  }, [day]);
  const n = trades?.length ?? 0;
  const losses = trades?.filter((t) => (t.pnl ?? 0) < 0).length ?? 0;
  const pnl = trades?.reduce((s, t) => s + (t.pnl ?? 0), 0) ?? 0;
  const done = n >= 3 || losses >= 2 || pnl <= -RISK.dailyStop;
  const reason = n >= 3 ? "3 trades taken" : losses >= 2 ? "2 losses" : pnl <= -RISK.dailyStop ? `down ${money(-pnl, { cents: false })}` : "";
  return (
    <div className={`rounded-2xl border p-4 ${done ? "border-red-400/40 bg-red-500/10" : "border-emerald-400/30 bg-emerald-500/[0.07]"}`}>
      <div className="text-[10px] uppercase tracking-widest text-white/50">Today · {day}</div>
      <div className={`mt-1 text-lg ${done ? "text-red-100" : "text-emerald-100"}`}>{trades === null ? "…" : done ? `Done for the day — ${reason}` : "Clear to trade the plan"}</div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-white/60">
        <div>
          Trades <span className="font-mono text-white/85">{n}/3</span>
        </div>
        <div>
          Losses <span className="font-mono text-white/85">{losses}/2</span>
        </div>
        <div>
          P&amp;L <span className={`font-mono ${pnl < 0 ? "text-red-200" : "text-white/85"}`}>{money(pnl, { sign: true, cents: false })}</span>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-white/35">From trades imported into the journal for today&apos;s CME session.</div>
    </div>
  );
}

function SizeCalc() {
  const [root, setRoot] = useState("MNQ");
  const [stop, setStop] = useState("20");
  const [risk, setRisk] = useState(String(RISK.riskPerTrade));
  const pv = POINT_VALUES.find((p) => p.root === root)?.pv ?? 1;
  const pts = Number(stop);
  const r = Number(risk);
  const contracts = pts > 0 && r > 0 ? Math.floor(r / (pts * pv)) : 0;
  const input = "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-purple-400/60";
  return (
    <div className="self-start rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="mb-2 text-xs text-white/60">Position size</div>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[11px] text-white/45">
          Contract
          <select value={root} onChange={(e) => setRoot(e.target.value)} className={`mt-1 ${input}`}>
            {POINT_VALUES.map((p) => (
              <option key={p.root}>{p.root}</option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-white/45">
          Stop (points)
          <input value={stop} onChange={(e) => setStop(e.target.value)} type="number" step="any" min="0" className={`mt-1 ${input}`} />
        </label>
        <label className="text-[11px] text-white/45">
          Risk ($)
          <input value={risk} onChange={(e) => setRisk(e.target.value)} type="number" min="0" className={`mt-1 ${input}`} />
        </label>
      </div>
      <div className="mt-3 text-sm text-white/80">
        {contracts > 0 ? (
          <>
            <span className="font-mono text-xl text-white">{contracts}</span> {root} contract{contracts === 1 ? "" : "s"} · risking{" "}
            {money(contracts * pts * pv, { cents: false })} (${pv}/pt)
          </>
        ) : pts > 0 ? (
          <span className="text-red-200">
            Stop too wide for {money(r, { cents: false })} on {root} — one contract risks {money(pts * pv, { cents: false })}. Use the micro or skip it.
          </span>
        ) : (
          <span className="text-white/40">Enter your stop distance.</span>
        )}
      </div>
    </div>
  );
}

function Checklist() {
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const all = ticked.size === CHECKLIST.length;
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs text-white/60">Before every trade</div>
        <button onClick={() => setTicked(new Set())} className="text-[11px] text-white/40 hover:text-white/70">
          Reset
        </button>
      </div>
      <div className="space-y-1.5">
        {CHECKLIST.map((c, i) => (
          <label key={c} className="flex cursor-pointer items-start gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              className="mt-1"
              checked={ticked.has(i)}
              onChange={() =>
                setTicked((cur) => {
                  const next = new Set(cur);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                })
              }
            />
            {c}
          </label>
        ))}
      </div>
      <div
        className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
          all ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/[0.03] text-white/50"
        }`}
      >
        {all ? "Go — take it, then leave it alone for 15 minutes." : `${CHECKLIST.length - ticked.size} left. If you can't tick one honestly, it's not your trade.`}
      </div>
    </div>
  );
}

const NAV = [
  ["edge", "The edge"],
  ["prep", "Prep"],
  ["bias", "Bias"],
  ["setups", "Setups"],
  ["rules", "No-trade rules"],
  ["risk", "Risk"],
  ["manage", "Managing"],
  ["review", "Review"],
];

export default function StrategyPage() {
  const setupColor = useMemo(() => ({ A: "text-emerald-200", B: "text-sky-200", C: "text-amber-200" }) as const, []);
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
          <div className="mx-auto max-w-6xl space-y-5 p-4 pb-24 md:p-6 md:pb-8">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 to-black p-6">
                <div className="text-[10px] uppercase tracking-widest text-purple-200/70">My plan · {PLAN_VERSION}</div>
                <p className="mt-2 text-xl leading-8 text-white">{ONE_LINER}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {NAV.map(([id, label]) => (
                    <a key={id} href={`#${id}`} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/55 hover:text-white">
                      {label}
                    </a>
                  ))}
                </div>
              </div>
              <Today />
            </div>

            <Section id="edge" n={1} title="The edge — why these rules">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {EVIDENCE.map((e) => (
                  <div key={e.label} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5">
                    <div className={`font-mono text-base ${e.tone === "good" ? "text-emerald-300" : e.tone === "bad" ? "text-red-300" : "text-white"}`}>{e.value}</div>
                    <div className="text-[11px] leading-4 text-white/55">{e.label}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-white/45">
                From your Sep–Oct Tradovate reports and the{" "}
                <Link href="/breakouts" className="text-purple-200/80 hover:text-purple-100">
                  Breakout Lab
                </Link>{" "}
                run. Everything else the Lab tested (volume spikes, fair value gaps, liquidity sweeps, stochastic divergence) was noise on your contracts so far — useful context,
                not reasons to take a trade.
              </p>
            </Section>

            <Section id="prep" n={2} title="Prep">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {PREP.map((s) => (
                  <div key={s.title} className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-white/40">{s.when}</div>
                    <div className="mt-0.5 text-sm text-white">{s.title}</div>
                    <div className="mt-1 text-xs leading-5 text-white/60">{s.detail}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="bias" n={3} title="Bias — decide before you look for entries">
              <div className="divide-y divide-white/5">
                {BIAS.map((b) => (
                  <div key={b.state} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[160px_minmax(0,1fr)]">
                    <div className="text-sm text-white">{b.state}</div>
                    <div className="text-sm leading-6 text-white/65">{b.rule}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="setups" n={4} title="Three setups — nothing else">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {SETUPS.map((s) => (
                  <div key={s.key} className="flex flex-col rounded-xl border border-white/10 bg-black/30 p-4">
                    <div className={`text-sm ${setupColor[s.key]}`}>
                      {s.key} · {s.name}
                    </div>
                    <div className="text-[11px] text-white/45">{s.tagline}</div>
                    <div className="mt-3 text-[10px] uppercase tracking-widest text-white/35">When</div>
                    <div className="text-xs leading-5 text-white/70">{s.when}</div>
                    <div className="mt-2 text-[10px] uppercase tracking-widest text-white/35">Trigger</div>
                    <ul className="list-disc space-y-0.5 pl-4 text-xs leading-5 text-white/70">
                      {s.trigger.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                    <div className="mt-2 text-[10px] uppercase tracking-widest text-white/35">Entry</div>
                    <div className="text-xs leading-5 text-white/70">{s.entry}</div>
                    <div className="mt-2 text-[10px] uppercase tracking-widest text-white/35">Stop</div>
                    <div className="text-xs leading-5 text-white/70">{s.stop}</div>
                    <div className="mt-2 text-[10px] uppercase tracking-widest text-white/35">Targets</div>
                    <div className="text-xs leading-5 text-white/70">{s.targets}</div>
                    <div className="mt-2 text-[10px] uppercase tracking-widest text-white/35">Skip if</div>
                    <ul className="list-disc space-y-0.5 pl-4 text-xs leading-5 text-red-200/70">
                      {s.skip.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="rules" n={5} title="No-trade rules">
              <div className="divide-y divide-white/5">
                {NO_TRADE.map((r) => (
                  <div key={r.rule} className="grid grid-cols-1 gap-1 py-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="text-sm text-white">{r.rule}</div>
                    <div className="text-xs leading-5 text-white/50">{r.why}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="risk" n={6} title={`Risk — ${RISK.account}`}>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["Per trade", money(RISK.riskPerTrade, { cents: false })],
                      ["Your daily stop", money(RISK.dailyStop, { cents: false })],
                      ["Lucid daily limit", money(RISK.firmDailyLimit, { cents: false })],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-widest text-white/40">{k}</div>
                        <div className="font-mono text-lg text-white">{v}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs leading-5 text-white/55">{RISK.why}</p>
                  <Checklist />
                </div>
                <SizeCalc />
              </div>
            </Section>

            <Section id="manage" n={7} title="Managing the trade">
              <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-6 text-white/75">
                {MANAGEMENT.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ol>
            </Section>

            <Section id="review" n={8} title="Review loop">
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-white/75">
                {REVIEW.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Link href="/journal/playbooks" className="rounded-lg border border-white/15 px-3 py-1.5 text-white/70 hover:text-white">
                  Playbooks
                </Link>
                <Link href="/journal/reports" className="rounded-lg border border-white/15 px-3 py-1.5 text-white/70 hover:text-white">
                  Reports
                </Link>
                <Link href="/journal/day" className="rounded-lg border border-white/15 px-3 py-1.5 text-white/70 hover:text-white">
                  Today&apos;s notebook
                </Link>
              </div>
            </Section>
          </div>
        </main>
      </div>
    </div>
  );
}
