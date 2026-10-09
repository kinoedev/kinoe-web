"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

type FuturesStatus = {
  ok?: boolean;
  configured?: boolean;
  scannedAt?: string | null;
  dataThrough?: string | null;
  spend?: { total: number; last30d: number; pulls: number };
  limit?: number;
  error?: string;
};

type StatsResult = {
  ok: boolean;
  ai?: {
    total_analyses: number;
    total_cost_usd: number;
    total_input_tokens: number;
    total_output_tokens: number;
  };
  journal?: {
    total_entries: number;
    agent_entries: number;
    manual_entries: number;
    wins: number;
    losses: number;
    breakevens: number;
    total_r: number;
  };
};

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${ok ? "bg-emerald-400" : "bg-red-400/60"}`} />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-4 text-xs uppercase tracking-widest text-white/30">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-white/5 last:border-0">
      <div className="text-xs text-white/50">{label}</div>
      <div className={`text-xs text-white/90 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

const ENV_VARS = [
  { key: "DATABENTO_API_KEY", label: "Databento API Key" },
  { key: "DATABENTO_MAX_COST_USD", label: "Databento per-scan limit" },
  { key: "ANTHROPIC_API_KEY", label: "Anthropic API Key" },
  { key: "AI_PROVIDER", label: "AI Provider override" },
  { key: "AI_MODEL_ANTHROPIC", label: "AI Model (grader)" },
  { key: "DATABASE_URL", label: "Database URL" },
  { key: "SITE_PASSWORD", label: "Site Password" },
  { key: "SITE_AUTH_SECRET", label: "Auth Secret" },
];

export default function SettingsPage() {
  const [futures, setFutures] = useState<FuturesStatus | null>(null);
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/futures/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setFutures(d))
      .catch(() => setFutures({ ok: false, error: "Failed to load" }));

    fetch("/api/settings/stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => null);

    fetch("/api/settings/env", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setEnvStatus(d?.vars ?? {}))
      .catch(() => null);
  }, []);

  const fmtCt = (v?: string | null) =>
    v ? new Date(v).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" }) + " CT" : "—";

  const winRate = (() => {
    if (!stats?.journal) return null;
    const resolved = stats.journal.wins + stats.journal.losses;
    if (resolved === 0) return null;
    return ((stats.journal.wins / resolved) * 100).toFixed(1);
  })();

  return (
    <div className="relative min-h-screen bg-black text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-56 -left-56 h-[700px] w-[700px] rounded-full bg-purple-600/20 blur-3xl" />
        <div className="absolute -bottom-56 -right-56 h-[700px] w-[700px] rounded-full bg-fuchsia-600/20 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen">
        <Sidebar />

        <main className="min-w-0 flex-1">
          <Topbar />

          <div className="p-4 pb-24 space-y-5 max-w-4xl md:p-6 md:pb-8">
            <div>
              <div className="text-sm text-white/80">Settings</div>
              <div className="mt-1 text-xs text-white/40">Platform configuration, connections, and usage stats.</div>
            </div>

            {/* Connections */}
            <Section title="Connections">
              <div className="space-y-4">
                {/* Databento */}
                <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <StatusDot ok={!!futures?.configured && futures?.ok !== false} />
                    <span className="text-sm text-white/80">Databento · CME Globex</span>
                    <span className="ml-auto rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-100">
                      HISTORICAL · CREDIT
                    </span>
                  </div>
                  {futures?.error ? (
                    <div className="text-xs text-red-300">{futures.error}</div>
                  ) : futures ? (
                    <div>
                      <Row label="API key" value={futures.configured ? "Set" : "Missing — add DATABENTO_API_KEY"} />
                      <Row label="Last scan" value={fmtCt(futures.scannedAt)} />
                      <Row label="Data through" value={fmtCt(futures.dataThrough)} />
                      <Row label="Credit used (all time)" value={`$${(futures.spend?.total ?? 0).toFixed(3)}`} mono />
                      <Row label="Credit used (30 days)" value={`$${(futures.spend?.last30d ?? 0).toFixed(3)}`} mono />
                      <Row label="Paid pulls" value={futures.spend?.pulls ?? 0} />
                      <Row label="Per-scan limit" value={`$${(futures.limit ?? 1).toFixed(2)}`} mono />
                    </div>
                  ) : (
                    <div className="text-xs text-white/30">Loading...</div>
                  )}
                  <div className="mt-2 text-[11px] text-white/30">
                    New accounts start with $125 of credit that expires after 6 months. Bars are cached, so each range is only paid for once.
                  </div>
                </div>
              </div>
            </Section>

            {/* AI */}
            <Section title="AI Config &amp; Usage">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs text-white/40">Configuration</div>
                  <Row label="Provider" value="Anthropic (Claude)" />
                  <Row label="Grader model" value="claude-opus-4-7 (default)" />
                  <Row label="OpenAI fallback" value="Available (set AI_PROVIDER=openai)" />
                </div>
                <div>
                  <div className="mb-2 text-xs text-white/40">All-time spend</div>
                  {stats?.ai ? (
                    <>
                      <Row label="Total API calls" value={stats.ai.total_analyses.toLocaleString()} />
                      <Row label="Total cost" value={`$${stats.ai.total_cost_usd.toFixed(4)}`} mono />
                      <Row label="Input tokens" value={stats.ai.total_input_tokens.toLocaleString()} mono />
                      <Row label="Output tokens" value={stats.ai.total_output_tokens.toLocaleString()} mono />
                    </>
                  ) : (
                    <div className="text-xs text-white/30">Loading...</div>
                  )}
                </div>
              </div>
            </Section>

            {/* Journal stats */}
            <Section title="Journal Stats">
              {stats?.journal ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Row label="Total entries" value={stats.journal.total_entries} />
                    <Row label="Manual entries" value={stats.journal.manual_entries} />
                    <Row label="Agent-logged entries" value={stats.journal.agent_entries} />
                  </div>
                  <div>
                    <Row label="Wins" value={stats.journal.wins} />
                    <Row label="Losses" value={stats.journal.losses} />
                    <Row label="Break evens" value={stats.journal.breakevens} />
                    <Row label="Win rate" value={winRate !== null ? `${winRate}%` : "—"} />
                    <Row label="Total R" value={`${stats.journal.total_r > 0 ? "+" : ""}${Number(stats.journal.total_r).toFixed(2)}R`} mono />
                  </div>
                </div>
              ) : (
                <div className="text-xs text-white/30">Loading...</div>
              )}
            </Section>

            {/* Auth */}
            <Section title="Auth">
              <Row label="Method" value="Single-password middleware + HMAC cookie" />
              <Row label="Password env var" value="SITE_PASSWORD" mono />
              <Row label="Secret env var" value="SITE_AUTH_SECRET" mono />
              <div className="mt-3 text-xs text-white/30">
                To change your password, update SITE_PASSWORD in Vercel → Environment Variables, then trigger a redeploy.
              </div>
            </Section>

            {/* Env var status */}
            <Section title="Environment Variables">
              <div className="space-y-1">
                {ENV_VARS.map((v) => {
                  const isSet = envStatus[v.key] ?? false;
                  return (
                    <div key={v.key} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-2">
                        <StatusDot ok={isSet} />
                        <span className="text-xs text-white/60">{v.label}</span>
                      </div>
                      <span className={`font-mono text-[10px] ${isSet ? "text-emerald-300/70" : "text-red-300/60"}`}>
                        {isSet ? "set" : "missing"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-[10px] text-white/25">Values are never shown. Status only.</div>
            </Section>
          </div>
        </main>
      </div>
    </div>
  );
}
