"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import type { PairAnalysisResult, TradePlan, KeyLevelDetailed } from "@/lib/signals/detection";

type PairResult = PairAnalysisResult & { aiSummary: string };

type ScanResult = {
  ok: boolean;
  scanned_at: string;
  overallSummary: string;
  pairs: PairResult[];
  meta: { model: string; cost_usd: number; input_tokens: number; output_tokens: number };
  error?: string;
};

const STATUS_STYLES: Record<string, string> = {
  TRADE_READY: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  WATCHLIST: "border-yellow-500/40 bg-yellow-500/15 text-yellow-200",
  NO_TRADE: "border-white/15 bg-white/5 text-white/50",
  AVOID: "border-red-500/40 bg-red-500/15 text-red-200",
};

const BIAS_STYLES: Record<string, string> = {
  BULLISH: "text-emerald-300",
  BEARISH: "text-red-300",
  NEUTRAL: "text-white/40",
};

const MARKET_STYLES: Record<string, string> = {
  TRENDING: "text-blue-300",
  RANGING: "text-white/40",
  BREAKOUT: "text-yellow-300",
  REVERSAL: "text-orange-300",
};

function ConfidenceBar({ score }: { score: number }) {
  const color =
    score >= 65 ? "bg-emerald-400" : score >= 40 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-mono text-white/70 w-8 text-right">{score}</span>
    </div>
  );
}

function KeyLevelRow({ level }: { level: KeyLevelDetailed }) {
  const isRes = level.type === "resistance";
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
        isRes ? "border-red-500/20 bg-red-500/5" : "border-emerald-500/20 bg-emerald-500/5"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`text-[9px] font-medium uppercase ${isRes ? "text-red-300/70" : "text-emerald-300/70"}`}
        >
          {isRes ? "R" : "S"}
        </span>
        <span className={`text-xs font-mono ${isRes ? "text-red-200" : "text-emerald-200"}`}>
          {level.price}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-1 w-12 rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${isRes ? "bg-red-400/60" : "bg-emerald-400/60"}`}
            style={{ width: `${level.strengthScore}%` }}
          />
        </div>
        <span className="w-6 text-right text-[9px] text-white/30">{level.strengthScore}</span>
        <span className="max-w-[80px] truncate text-[9px] text-white/30">{level.reason}</span>
      </div>
    </div>
  );
}

function TradePlanCard({ plan }: { plan: TradePlan }) {
  const isLong = plan.direction === "LONG";
  return (
    <div
      className={`rounded-xl border p-4 ${
        isLong ? "border-emerald-500/25 bg-emerald-500/5" : "border-red-500/25 bg-red-500/5"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className={`text-xs font-medium ${isLong ? "text-emerald-200" : "text-red-200"}`}>
          {isLong ? "▲ LONG" : "▼ SHORT"}
        </span>
        <span className="text-[10px] text-white/40">RR {plan.riskReward}:1</span>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-white/10 bg-black/30 p-2">
          <div className="mb-0.5 text-[9px] uppercase text-white/40">Entry</div>
          <div className="text-[10px] font-mono leading-tight text-white">
            {plan.entryTrigger.split(" ").slice(-1)[0]}
          </div>
        </div>
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2">
          <div className="mb-0.5 text-[9px] uppercase text-red-300/60">Stop</div>
          <div className="text-[10px] font-mono text-red-200">{plan.stopLoss}</div>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
          <div className="mb-0.5 text-[9px] uppercase text-emerald-300/60">Target</div>
          <div className="text-[10px] font-mono text-emerald-200">{plan.takeProfit}</div>
        </div>
      </div>
      <div className="text-[9px] leading-4 text-white/30">
        <span className="text-white/40">Entry: </span>
        {plan.entryTrigger}
      </div>
      <div className="mt-1 text-[9px] leading-4 text-white/30">
        <span className="text-white/40">Invalidation: </span>
        {plan.invalidation}
      </div>
    </div>
  );
}

function PairCard({ data }: { data: PairResult }) {
  const displayPair = data.pair.replace("_", "/");

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-base font-medium text-white">{displayPair}</div>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[10px] ${STATUS_STYLES[data.tradeStatus] ?? STATUS_STYLES.NO_TRADE}`}
        >
          {data.tradeStatus.replace("_", " ")}
        </span>
      </div>

      {/* Confidence bar */}
      <div>
        <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/30">Confidence</div>
        <ConfidenceBar score={data.confidenceScore} />
      </div>

      {/* Bias + market state row */}
      <div className="grid grid-cols-3 gap-1 text-center">
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <div className="mb-0.5 text-[9px] text-white/30">D1 Bias</div>
          <div className={`text-[10px] font-medium ${BIAS_STYLES[data.higherTimeframeBias]}`}>
            {data.higherTimeframeBias}
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <div className="mb-0.5 text-[9px] text-white/30">H4 Bias</div>
          <div className={`text-[10px] font-medium ${BIAS_STYLES[data.executionTimeframeBias]}`}>
            {data.executionTimeframeBias}
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
          <div className="mb-0.5 text-[9px] text-white/30">Market</div>
          <div className={`text-[10px] font-medium ${MARKET_STYLES[data.marketState]}`}>
            {data.marketState}
          </div>
        </div>
      </div>

      {/* Setup */}
      {data.setupDetected ? (
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 px-3 py-2">
          <div className="mb-0.5 text-[9px] text-white/30">Setup detected</div>
          <div className="text-xs text-purple-200">{data.setupType}</div>
        </div>
      ) : (
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <div className="mb-0.5 text-[9px] text-white/30">Setup</div>
          <div className="text-xs italic text-white/30">No setup on current candle</div>
        </div>
      )}

      {/* Key levels */}
      {data.keyLevels.length > 0 ? (
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-widest text-white/30">Key Levels</div>
          <div className="space-y-1.5">
            {data.keyLevels.slice(0, 4).map((l, i) => (
              <KeyLevelRow key={i} level={l} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Trade plan */}
      {data.potentialTradePlan ? (
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-widest text-white/30">Trade Plan</div>
          <TradePlanCard plan={data.potentialTradePlan} />
        </div>
      ) : null}

      {/* Blockers */}
      {data.blockers.length > 0 ? (
        <div>
          <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/30">Blockers</div>
          <ul className="space-y-1">
            {data.blockers.map((b, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[10px] text-yellow-200/80">
                <span className="mt-px">⚠</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Trigger conditions */}
      {data.triggerConditions.length > 0 ? (
        <div>
          <div className="mb-1.5 text-[10px] uppercase tracking-widest text-white/30">Watch for</div>
          <ul className="space-y-1">
            {data.triggerConditions.map((t, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[10px] text-white/60">
                <span className="mt-px text-purple-400">→</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* AI summary */}
      {data.aiSummary ? (
        <div className="rounded-xl border border-purple-500/15 bg-purple-500/5 px-4 py-3">
          <div className="mb-1 text-[9px] uppercase tracking-widest text-purple-300/50">
            AI summary
          </div>
          <div className="text-xs leading-5 text-white/60">{data.aiSummary}</div>
        </div>
      ) : null}
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
                  Rule-based naked forex scan — EUR/USD · GBP/USD · XAU/USD on H4
                </div>
              </div>
              <button
                onClick={runScan}
                disabled={scanning}
                className="shrink-0 rounded-xl border border-purple-500/30 bg-purple-500/10 px-5 py-2.5 text-sm text-purple-100 transition hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {scanning ? "Scanning markets..." : "Scan markets"}
              </button>
            </div>

            {/* Loading */}
            {scanning ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/50">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-purple-400" />
                  Fetching OANDA candles · running rule engine · asking Claude for summaries...
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
                <div className="mt-6 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <div className="text-xs font-medium text-purple-200">Market overview</div>
                    <div className="text-[10px] text-white/30">
                      {result.meta.model} · ${result.meta.cost_usd.toFixed(4)} ·{" "}
                      {new Date(result.scanned_at).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="text-sm leading-6 text-white/80">{result.overallSummary}</div>
                </div>

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
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-purple-500/20 bg-purple-500/5">
                  <div className="text-2xl text-purple-300">⟳</div>
                </div>
                <div className="text-sm text-white/60">No scan yet</div>
                <div className="max-w-sm text-xs text-white/30">
                  Click <span className="text-purple-200">Scan markets</span> to run a live naked
                  forex analysis. The rule engine scans EUR/USD, GBP/USD, and XAU/USD for patterns,
                  key levels, and trade setups — then Claude summarises the findings.
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
