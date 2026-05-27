"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

type SignalPanelProps = Record<string, never>;

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

type LogResult = { logged: boolean; reason?: string; existing_id?: string; entry?: { id: string } };

export default function SignalPanel(_props: SignalPanelProps) {
  const [signal, setSignal] = useState<SignalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [logging, setLogging] = useState(false);
  const [logResult, setLogResult] = useState<LogResult | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

  async function loadSignal() {
    try {
      setLoading(true);
      setError(null);
      setLogResult(null);
      setLogError(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load signal");
    } finally {
      setLoading(false);
    }
  }

  async function logToJournal() {
    setLogging(true);
    setLogError(null);
    setLogResult(null);
    try {
      const res = await fetch("/api/agent/signal/log", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setLogResult(data as LogResult);
    } catch (err) {
      setLogError(err instanceof Error ? err.message : "Log failed");
    } finally {
      setLogging(false);
    }
  }

  useEffect(() => {
    loadSignal();
  }, []);

  const setupText = signal?.isValidSetup ? "Valid setup found" : "No valid setup";

  return (
    <section className="rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-white/80">Signals</div>
          <div className="mt-1 text-xs text-white/40">
            Live signal scan — EUR/USD H4
          </div>
        </div>

        <div className={`rounded-full border px-3 py-1 text-[10px] ${
          signal?.isValidSetup
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            : "border-white/10 bg-white/5 text-white/50"
        }`}>
          {setupText}
        </div>
      </div>

      <button
        onClick={loadSignal}
        disabled={loading}
        className="mt-5 w-full rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm text-purple-100 transition hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Scanning..." : "Run signal scan"}
      </button>

      {signal?.isValidSetup ? (
        <button
          onClick={logToJournal}
          disabled={logging}
          className="mt-2 w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {logging ? "Logging..." : "Log to journal"}
        </button>
      ) : null}

      {logResult ? (
        <div className={`mt-3 rounded-xl border p-3 text-xs ${logResult.logged ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/5 text-white/50"}`}>
          {logResult.logged && logResult.entry ? (
            <>Signal logged. <Link href={`/journal/${logResult.entry.id}`} className="underline text-emerald-300">View entry</Link></>
          ) : logResult.existing_id ? (
            <>Already logged this window. <Link href={`/journal/${logResult.existing_id}`} className="underline text-white/70">View entry</Link></>
          ) : (
            logResult.reason ?? "No valid setup to log."
          )}
        </div>
      ) : null}

      {logError ? (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200">
          {logError}
        </div>
      ) : null}

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