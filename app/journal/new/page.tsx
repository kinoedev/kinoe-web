"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import type { Direction, NewJournalEntry } from "@/lib/db/types";

const PAIRS = ["EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD", "XAU_USD"];
const TIMEFRAMES = ["M15", "H1", "H4", "D"];
const SETUPS = ["Kangaroo Tail", "Big Shadow", "Breakout", "Reversal", "Other"];

export default function NewJournalEntryPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pair, setPair] = useState("EUR_USD");
  const [timeframe, setTimeframe] = useState("H4");
  const [direction, setDirection] = useState<Direction>("LONG");
  const [setupType, setSetupType] = useState("Kangaroo Tail");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [riskPct, setRiskPct] = useState("1");
  const [thesis, setThesis] = useState("");

  function asNum(s: string): number | null {
    if (s.trim() === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  const riskReward = (() => {
    const e = asNum(entryPrice);
    const s = asNum(stopLoss);
    const t = asNum(takeProfit);
    if (e === null || s === null || t === null) return null;
    const risk = Math.abs(e - s);
    const reward = Math.abs(t - e);
    if (risk === 0) return null;
    return Number((reward / risk).toFixed(2));
  })();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload: NewJournalEntry = {
      pair,
      timeframe,
      direction,
      setup_type: setupType,
      entry_price: asNum(entryPrice),
      stop_loss: asNum(stopLoss),
      take_profit: asNum(takeProfit),
      risk_reward: riskReward,
      risk_pct: asNum(riskPct) !== null ? Number(asNum(riskPct)) / 100 : null,
      entered_at: new Date().toISOString(),
      thesis_md: thesis || null,
      source: "kierra",
    };

    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to save");
      router.replace(`/journal/${data.entry.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSubmitting(false);
    }
  }

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

          <form onSubmit={onSubmit} className="p-4 pb-24 md:p-6 md:pb-8">
            <div className="text-sm text-white/80">New entry</div>
            <div className="mt-1 text-xs text-white/40">
              Log a trade. Required: pair, timeframe, direction. Everything else can be filled in later.
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="Pair">
                <select value={pair} onChange={(e) => setPair(e.target.value)} className={selectClass}>
                  {PAIRS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Field>

              <Field label="Timeframe">
                <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className={selectClass}>
                  {TIMEFRAMES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>

              <Field label="Direction">
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as Direction)}
                  className={selectClass}
                >
                  <option value="LONG">LONG</option>
                  <option value="SHORT">SHORT</option>
                </select>
              </Field>

              <Field label="Setup type">
                <select value={setupType} onChange={(e) => setSetupType(e.target.value)} className={selectClass}>
                  {SETUPS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>

              <Field label="Entry price">
                <input
                  type="number"
                  step="0.00001"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="Stop loss">
                <input
                  type="number"
                  step="0.00001"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="Take profit">
                <input
                  type="number"
                  step="0.00001"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="Risk % of account">
                <input
                  type="number"
                  step="0.1"
                  value={riskPct}
                  onChange={(e) => setRiskPct(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            {riskReward !== null ? (
              <div className="mt-4 text-xs text-white/50">
                Calculated R:R = <span className="text-purple-200">{riskReward}:1</span>
              </div>
            ) : null}

            <Field label="Thesis (why this trade?)" wide>
              <textarea
                rows={6}
                value={thesis}
                onChange={(e) => setThesis(e.target.value)}
                placeholder="Markdown supported. What's the setup, the context, the invalidation?"
                className={`${inputClass} resize-y`}
              />
            </Field>

            {error ? (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200">
                {error}
              </div>
            ) : null}

            <div className="mt-6 flex items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm text-purple-100 transition hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Save entry"}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-purple-400/60";
const selectClass = inputClass;

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "md:col-span-2 mt-4" : ""}`}>
      <div className="mb-1 text-xs text-white/60">{label}</div>
      {children}
    </label>
  );
}
