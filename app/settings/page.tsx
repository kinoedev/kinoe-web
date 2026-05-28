"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

type OandaSummary = {
  account?: {
    currency?: string;
    balance?: string;
    NAV?: string;
    unrealizedPL?: string;
    openTradeCount?: number;
    openPositionCount?: number;
    alias?: string;
    id?: string;
  };
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

type AgentStatus = { ok?: boolean; agent?: string };

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
  { key: "OANDA_API_KEY", label: "OANDA API Key" },
  { key: "OANDA_ACCOUNT_ID", label: "OANDA Account ID" },
  { key: "OANDA_ACCOUNT_TYPE", label: "OANDA Account Type" },
  { key: "ANTHROPIC_API_KEY", label: "Anthropic API Key" },
  { key: "AI_PROVIDER", label: "AI Provider override" },
  { key: "AI_MODEL_ANTHROPIC", label: "AI Model (grader)" },
  { key: "AI_MODEL_SCANNER", label: "AI Model (scanner)" },
  { key: "DATABASE_URL", label: "Database URL" },
  { key: "SITE_PASSWORD", label: "Site Password" },
  { key: "SITE_AUTH_SECRET", label: "Auth Secret" },
  { key: "N8N_STATUS_URL", label: "n8n Status URL" },
];

export default function SettingsPage() {
  const [oanda, setOanda] = useState<OandaSummary | null>(null);
  const [oandaError, setOandaError] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>({});
  const [oandaType, setOandaType] = useState<string>("practice");

  useEffect(() => {
    fetch("/api/oanda/account", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        setOanda(data);
      })
      .catch((err) => setOandaError(err instanceof Error ? err.message : "Failed"));

    fetch("/api/agent/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAgentStatus(d))
      .catch(() => setAgentStatus({ ok: false, agent: "offline" }));

    fetch("/api/settings/stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => null);

    fetch("/api/settings/env", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setEnvStatus(d?.vars ?? {});
        if (d?.oanda_type) setOandaType(d.oanda_type);
      })
      .catch(() => null);
  }, []);

  const acct = oanda?.account;
  const n8nOnline = agentStatus?.agent === "online";

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

        <main className="flex-1">
          <Topbar />

          <div className="p-4 pb-24 space-y-5 max-w-4xl md:p-6 md:pb-8">
            <div>
              <div className="text-sm text-white/80">Settings</div>
              <div className="mt-1 text-xs text-white/40">Platform configuration, connections, and usage stats.</div>
            </div>

            {/* Connections */}
            <Section title="Connections">
              <div className="space-y-4">
                {/* OANDA */}
                <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <StatusDot ok={!!acct} />
                    <span className="text-sm text-white/80">OANDA</span>
                    {acct ? (
                      <span className="ml-auto rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
                        {oandaType.toUpperCase()}
                      </span>
                    ) : null}
                  </div>
                  {oandaError ? (
                    <div className="text-xs text-red-300">{oandaError}</div>
                  ) : acct ? (
                    <div>
                      <Row label="Account" value={acct.alias ?? acct.id ?? "—"} />
                      <Row label="Currency" value={acct.currency ?? "—"} />
                      <Row label="Balance" value={acct.balance ? `${acct.currency} ${Number(acct.balance).toLocaleString()}` : "—"} mono />
                      <Row label="NAV" value={acct.NAV ? `${acct.currency} ${Number(acct.NAV).toLocaleString()}` : "—"} mono />
                      <Row label="Unrealised P&L" value={acct.unrealizedPL ?? "—"} mono />
                      <Row label="Open trades" value={acct.openTradeCount ?? "—"} />
                      <Row label="Open positions" value={acct.openPositionCount ?? "—"} />
                    </div>
                  ) : (
                    <div className="text-xs text-white/30">Loading...</div>
                  )}
                </div>

                {/* n8n */}
                <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-center gap-2">
                    <StatusDot ok={n8nOnline} />
                    <span className="text-sm text-white/80">n8n agent</span>
                    <span className={`ml-auto text-xs ${n8nOnline ? "text-emerald-200" : "text-white/40"}`}>
                      {n8nOnline ? "Online" : "Offline"}
                    </span>
                  </div>
                  {n8nOnline ? (
                    <div className="mt-2 text-xs text-white/40">Connected via N8N_STATUS_URL webhook.</div>
                  ) : (
                    <div className="mt-2 text-xs text-white/30">
                      Set N8N_STATUS_URL in Vercel env vars, then POST from n8n to confirm connection.
                    </div>
                  )}
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
                  <Row label="Scanner model" value="claude-sonnet-4-6 (default)" />
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
