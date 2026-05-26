"use client";

import { useEffect, useState } from "react";

type SignalResponse = {
  ok?: boolean;
  pair?: string;
  timeframe?: string;
  bias?: string;
  setup?: string;
  isValidSetup?: boolean;
  score?: number;
  entry?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  riskReward?: number | null;
  reason?: string;
};

type SignalPanelProps = {
  agentOnline?: boolean;
};

function FieldCard(props: { label: string; value: string; tag?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-white/70">{props.label}</div>

        {props.tag ? (
          <div className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-200">
            {props.tag}
          </div>
        ) : null}
      </div>

      <div className="mt-2 text-sm font-medium text-white">{props.value}</div>
    </div>
  );
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "Not set";
  return value.toString();
}

export default function SignalPanel({ agentOnline }: SignalPanelProps) {
  const [signal, setSignal] = useState<SignalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSignal() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/agent/signal", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const data = (await res.json()) as SignalResponse;

      if (!res.ok) {
        throw new Error(data?.reason || "Signal request failed");
      }

      setSignal(data);
      setLastCheckedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load signal");
      setLastCheckedAt(Date.now());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSignal();
  }, []);

  const statusText = agentOnline ? "Agent online" : "Agent offline";
  const setupText = signal?.isValidSetup ? "Valid setup found" : "No valid setup";

  return (
    <section className="rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-white/80">Signals</div>
          <div className="mt-1 text-xs text-white/40">
            Live agent output from your signal route
          </div>
        </div>

        <div
          className={`rounded-full border px-3 py-1 text-[10px] ${
            agentOnline
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
        >
          {statusText}
        </div>
      </div>

      <button
        onClick={loadSignal}
        disabled={loading}
        className="mt-5 w-full rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm text-purple-100 transition hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Scanning..." : "Run signal scan"}
      </button>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs leading-5 text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        <FieldCard
          label="Pair"
          tag={signal?.timeframe || "Timeframe"}
          value={signal?.pair || "No pair loaded"}
        />

        <FieldCard
          label="Bias"
          tag="Trend"
          value={signal?.bias || "No bias loaded"}
        />

        <FieldCard
          label="Setup"
          tag={setupText}
          value={signal?.setup || "No setup loaded"}
        />

        <FieldCard
          label="Score"
          tag="Confidence"
          value={
            signal?.score === undefined ? "No score loaded" : `${signal.score}/100`
          }
        />

        <FieldCard
          label="Entry"
          value={formatNumber(signal?.entry)}
        />

        <FieldCard
          label="Stop Loss"
          value={formatNumber(signal?.stopLoss)}
        />

        <FieldCard
          label="Take Profit"
          value={formatNumber(signal?.takeProfit)}
        />

        <FieldCard
          label="Risk Reward"
          tag="RR"
          value={
            signal?.riskReward === null || signal?.riskReward === undefined
              ? "Not set"
              : `${signal.riskReward}:1`
          }
        />

        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-white/70">Reason</div>
          <div className="mt-2 text-xs leading-5 text-white/50">
            {signal?.reason || "No agent reasoning loaded yet."}
          </div>
        </div>
      </div>
    </section>
  );
}