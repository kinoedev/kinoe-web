"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import type { PairScan } from "@/lib/ai/scanner";

type ScanResult = {
  ok: boolean;
  scanned_at: string;
  summary: string;
  pairs: PairScan[];
  meta: { model: string; cost_usd: number; input_tokens: number; output_tokens: number };
  error?: string;
};

const BIAS_STYLES: Record<string, string> = {
  BULLISH: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  BEARISH: "border-red-500/30 bg-red-500/10 text-red-200",
  NEUTRAL: "border-white/20 bg-white/5 text-white/60",
  WATCH: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
};

const STRENGTH_STYLES: Record<string, string> = {
  STRONG: "text-white",
  MODERATE: "text-white/70",
  WEAK: "text-white/40",
};

function ConfidenceDots({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`inline-block h-1.5 w-1.5 rounded-full ${i <= value ? "bg-purple-400" : "bg-white/15"}`}
        />
      ))}
    </div>
  );
}

function PairCard({ data }: { data: PairScan }) {
  const displayPair = data.pair.replace("_", "/");
  const supports = data.key_levels.filter((l) => l.type === "support");
  const resistances = data.key_levels.filter((l) => l.type === "resistance");

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-base font-medium text-white">{displayPair}</div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${BIAS_STYLES[data.bias] ?? BIAS_STYLES.NEUTRAL}`}>
            {data.bias}
          </span>
          <span className={`text-xs ${STRENGTH_STYLES[data.trend_strength] ?? "text-white/50"}`}>
            {data.trend_strength}
          </span>
        </div>
      </div>

      {/* Key levels */}
      {data.key_levels.length > 0 ? (
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-widest text-white/30">Key Levels</div>
          <div className="grid grid-cols-2 gap-1.5">
            {resistances.map((l, i) => (
              <div key={i} className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
                <div className="text-[9px] text-red-300/60 uppercase">R</div>
                <div className="text-xs font-mono text-red-200">{l.price}</div>
                {l.notes ? <div className="mt-0.5 text-[9px] text-white/40 leading-3">{l.notes}</div> : null}
              </div>
            ))}
            {supports.map((l, i) => (
              <div key={i} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                <div className="text-[9px] text-emerald-300/60 uppercase">S</div>
                <div className="text-xs font-mono text-emerald-200">{l.price}</div>
                {l.notes ? <div className="mt-0.5 text-[9px] text-white/40 leading-3">{l.notes}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Setup */}
      {data.setup_found && data.setup ? (
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-purple-200">{data.setup.name}</span>
              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${
                data.setup.direction === "LONG"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-red-500/30 bg-red-500/10 text-red-200"
              }`}>
                {data.setup.direction}
              </span>
            </div>
            <ConfidenceDots value={data.setup.confidence} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <div className="rounded-lg border border-white/10 bg-black/30 p-2">
              <div className="text-[9px] text-white/40 uppercase">Entry</div>
              <div className="text-xs font-mono text-white">{data.setup.entry}</div>
            </div>
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2">
              <div className="text-[9px] text-red-300/60 uppercase">Stop</div>
              <div className="text-xs font-mono text-red-200">{data.setup.stop}</div>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
              <div className="text-[9px] text-emerald-300/60 uppercase">Target</div>
              <div className="text-xs font-mono text-emerald-200">{data.setup.target}</div>
            </div>
          </div>
          <div className="mb-2 text-[10px] text-white/40">R:R {data.setup.rr}:1</div>
          <div className="text-xs leading-5 text-white/60">{data.setup.notes}</div>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/30 italic">
          No high-probability setup at this time
        </div>
      )}

      {/* Watch */}
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-widest text-white/30">Watch next session</div>
        <div className="text-xs leading-5 text-white/60">{data.watch}</div>
      </div>
    </div>
  );
}

export default function SignalsPage() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/signals/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setResult(data as ScanResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
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

          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-sm text-white/80">Signals</div>
                <div className="mt-1 text-xs text-white/40">
                  AI-powered naked forex scan — EUR/USD · GBP/USD · XAU/USD on H4
                </div>
              </div>
              <button
                onClick={runScan}
                disabled={scanning}
                className="rounded-xl border border-purple-500/30 bg-purple-500/10 px-5 py-2.5 text-sm text-purple-100 transition hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-50 shrink-0"
              >
                {scanning ? "Scanning markets..." : "Scan markets"}
              </button>
            </div>

            {/* Loading */}
            {scanning ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/50">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-purple-400" />
                  Fetching OANDA candles for 3 pairs, running pattern detection, asking Claude...
                </div>
              </div>
            ) : null}

            {/* Error */}
            {error ? (
              <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">
                {error}
              </div>
            ) : null}

            {/* Results */}
            {result && !scanning ? (
              <>
                {/* AI Summary */}
                <div className="mt-6 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div className="text-xs text-purple-200 font-medium">Market overview</div>
                    <div className="text-[10px] text-white/30">
                      {result.meta.model} · ${result.meta.cost_usd.toFixed(4)} · scanned {new Date(result.scanned_at).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="text-sm leading-6 text-white/80">{result.summary}</div>
                </div>

                {/* Pair cards */}
                <div className="mt-5 grid gap-5 lg:grid-cols-3">
                  {result.pairs.map((pair) => (
                    <PairCard key={pair.pair} data={pair} />
                  ))}
                </div>
              </>
            ) : null}

            {/* Empty state */}
            {!result && !scanning && !error ? (
              <div className="mt-10 flex flex-col items-center gap-4 text-center">
                <div className="h-16 w-16 rounded-2xl border border-purple-500/20 bg-purple-500/5 flex items-center justify-center">
                  <div className="text-2xl text-purple-300">⟳</div>
                </div>
                <div className="text-sm text-white/60">No scan yet</div>
                <div className="text-xs text-white/30 max-w-sm">
                  Click <span className="text-purple-200">Scan markets</span> to run a live naked forex analysis across EUR/USD, GBP/USD, and XAU/USD.
                  Claude will identify key levels, patterns, and actionable setups.
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
