"use client";

import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import type { AgentSettings, AgentRun, AgentCandidate } from "@/lib/db/types";

// ─── Small UI helpers ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-4 text-xs uppercase tracking-widest text-white/30">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-white/5 last:border-0">
      <div className="text-xs text-white/50">{label}</div>
      <div className="text-xs text-white/90">{value}</div>
    </div>
  );
}

function Badge({ text, color }: { text: string; color: "green" | "yellow" | "red" | "blue" | "gray" }) {
  const colors = {
    green:  "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    red:    "bg-red-500/20 text-red-400 border-red-500/30",
    blue:   "bg-blue-500/20 text-blue-400 border-blue-500/30",
    gray:   "bg-white/5 text-white/40 border-white/10",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${colors[color]}`}>
      {text}
    </span>
  );
}

function modeBadge(mode: string) {
  if (mode === "OFF") return <Badge text="OFF" color="gray" />;
  if (mode === "ALERT_ONLY") return <Badge text="ALERT ONLY" color="blue" />;
  if (mode === "APPROVAL_REQUIRED") return <Badge text="APPROVAL REQUIRED" color="yellow" />;
  if (mode === "DEMO_AUTO") return <Badge text="DEMO AUTO" color="green" />;
  return <Badge text={mode} color="gray" />;
}

function decisionBadge(d: string) {
  if (d === "APPROVED") return <Badge text="APPROVED" color="green" />;
  if (d === "DENIED") return <Badge text="DENIED" color="red" />;
  if (d === "JOURNAL_ONLY") return <Badge text="JOURNALLED" color="blue" />;
  if (d === "PENDING") return <Badge text="PENDING" color="yellow" />;
  if (d === "EXPIRED") return <Badge text="EXPIRED" color="gray" />;
  if (d === "AUTO_SKIPPED") return <Badge text="SKIPPED" color="gray" />;
  return <Badge text={d} color="gray" />;
}

const MODES = ["OFF", "ALERT_ONLY", "APPROVAL_REQUIRED", "DEMO_AUTO"] as const;

type SessionKey = "asian" | "london" | "newyork";

const SESSIONS: Record<SessionKey, { label: string; hours: string; utcStart: number; utcEnd: number; color: string }> = {
  asian:   { label: "Tokyo",    hours: "00:00–09:00 UTC", utcStart: 0,  utcEnd: 9,  color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
  london:  { label: "London",   hours: "08:00–17:00 UTC", utcStart: 8,  utcEnd: 17, color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  newyork: { label: "New York", hours: "13:00–22:00 UTC", utcStart: 13, utcEnd: 22, color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" },
};

type PairMeta = { id: string; sessions: SessionKey[] };

const PAIR_CATEGORIES: { label: string; pairs: PairMeta[] }[] = [
  {
    label: "Majors",
    pairs: [
      { id: "EUR_USD", sessions: ["london", "newyork"] },
      { id: "GBP_USD", sessions: ["london", "newyork"] },
      { id: "USD_JPY", sessions: ["asian", "newyork"] },
      { id: "USD_CHF", sessions: ["london", "newyork"] },
      { id: "USD_CAD", sessions: ["newyork"] },
      { id: "AUD_USD", sessions: ["asian", "london"] },
      { id: "NZD_USD", sessions: ["asian"] },
    ],
  },
  {
    label: "High Volatility",
    pairs: [
      { id: "GBP_JPY", sessions: ["asian", "london", "newyork"] },
      { id: "EUR_JPY", sessions: ["asian", "london"] },
      { id: "GBP_AUD", sessions: ["asian", "london"] },
      { id: "AUD_JPY", sessions: ["asian"] },
      { id: "EUR_GBP", sessions: ["london"] },
      { id: "GBP_CHF", sessions: ["london"] },
      { id: "EUR_AUD", sessions: ["asian", "london"] },
      { id: "EUR_NZD", sessions: ["asian", "london"] },
      { id: "GBP_NZD", sessions: ["london"] },
    ],
  },
  {
    label: "Commodities",
    pairs: [
      { id: "XAU_USD", sessions: ["london", "newyork"] },
      { id: "XAG_USD", sessions: ["london", "newyork"] },
    ],
  },
  {
    label: "Indices",
    pairs: [
      { id: "SPX500_USD", sessions: ["newyork"] },
      { id: "NAS100_USD", sessions: ["newyork"] },
      { id: "US30_USD",   sessions: ["newyork"] },
      { id: "UK100_GBP",  sessions: ["london"] },
      { id: "DE30_EUR",   sessions: ["london"] },
    ],
  },
];

const ALL_PAIRS = PAIR_CATEGORIES.flatMap((c) => c.pairs.map((p) => p.id));

function getActiveSessions(): SessionKey[] {
  const utcHour = new Date().getUTCHours();
  return (Object.entries(SESSIONS) as [SessionKey, typeof SESSIONS[SessionKey]][])
    .filter(([, s]) => utcHour >= s.utcStart && utcHour < s.utcEnd)
    .map(([key]) => key);
}

function getPairsForSession(session: SessionKey): string[] {
  return PAIR_CATEGORIES.flatMap((c) => c.pairs.filter((p) => p.sessions.includes(session)).map((p) => p.id));
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AgentPage() {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [candidates, setCandidates] = useState<AgentCandidate[]>([]);

  const [saving, setSaving] = useState(false);
  const [running, setScanRunning] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settingUpWebhook, setSettingUpWebhook] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Local edit state
  const [draft, setDraft] = useState<Partial<AgentSettings>>({});

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    const [sRes, rRes, cRes] = await Promise.all([
      fetch("/api/agent/settings"),
      fetch("/api/agent/runs"),
      fetch("/api/agent/candidates"),
    ]);
    const sData = await sRes.json();
    const rData = await rRes.json();
    const cData = await cRes.json();
    if (sData.ok) {
      // Neon returns NUMERIC columns as strings — coerce to numbers
      const s = sData.settings;
      s.min_risk_reward = Number(s.min_risk_reward);
      s.max_risk_per_trade_pct = Number(s.max_risk_per_trade_pct);
      s.max_adr_multiplier = Number(s.max_adr_multiplier);
      setSettings(s);
      setDraft(s);
    }
    if (rData.ok) setRuns(rData.runs ?? []);
    if (cData.ok) setCandidates(cData.candidates ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/agent/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (data.ok) { setSettings(data.settings); showToast("Settings saved."); }
      else showToast(data.error ?? "Save failed.", false);
    } finally {
      setSaving(false);
    }
  }

  async function runScan() {
    setScanRunning(true);
    try {
      const res = await fetch("/api/agent/run", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        showToast(`Scan complete. ${data.candidates} candidate(s) found.`);
        await load();
      } else {
        showToast(data.reason ?? data.error ?? "Scan failed.", false);
      }
    } finally {
      setScanRunning(false);
    }
  }

  async function testTelegram() {
    setTesting(true);
    try {
      const res = await fetch("/api/agent/telegram/test", { method: "POST" });
      const data = await res.json();
      if (data.ok) showToast("Test message sent to Telegram.");
      else showToast(data.error ?? "Test failed.", false);
    } finally {
      setTesting(false);
    }
  }

  async function setupWebhook() {
    setSettingUpWebhook(true);
    try {
      const res = await fetch("/api/agent/telegram/setup", { method: "POST" });
      const data = await res.json();
      if (data.ok) showToast(`Webhook registered: ${data.webhookUrl}`);
      else showToast(data.error ?? "Webhook setup failed.", false);
    } finally {
      setSettingUpWebhook(false);
    }
  }

  const [activeSessions] = useState<SessionKey[]>(() => getActiveSessions());

  function togglePair(pair: string) {
    const current = draft.allowed_pairs ?? settings?.allowed_pairs ?? [];
    const next = current.includes(pair)
      ? current.filter((p) => p !== pair)
      : [...current, pair];
    setDraft((d) => ({ ...d, allowed_pairs: next }));
  }

  function selectSession(session: SessionKey) {
    const sessionPairs = getPairsForSession(session);
    const current = draft.allowed_pairs ?? settings?.allowed_pairs ?? [];
    const allOn = sessionPairs.every((p) => current.includes(p));
    const next = allOn
      ? current.filter((p) => !sessionPairs.includes(p))
      : [...new Set([...current, ...sessionPairs])];
    setDraft((d) => ({ ...d, allowed_pairs: next }));
  }

  function selectAll() { setDraft((d) => ({ ...d, allowed_pairs: ALL_PAIRS })); }
  function clearAll()  { setDraft((d) => ({ ...d, allowed_pairs: [] })); }

  if (!settings) {
    return (
      <div className="flex h-screen bg-[#0a0a0f] text-white">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <main className="flex-1 flex items-center justify-center">
            <div className="text-white/30 text-sm">Loading agent settings...</div>
          </main>
        </div>
      </div>
    );
  }

  const d = draft;
  const mode = (d.agent_mode ?? settings.agent_mode) as string;
  const killSwitch = d.kill_switch ?? settings.kill_switch;

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-8">

          {/* Toast */}
          {toast && (
            <div className={`fixed top-4 right-4 z-50 rounded-xl border px-4 py-3 text-sm shadow-lg ${
              toast.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}>
              {toast.msg}
            </div>
          )}

          <div className="mx-auto max-w-4xl space-y-6">

            {/* Header row */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-white">Agent Control Center</div>
                <div className="text-xs text-white/40 mt-0.5">Approve in Telegram → order placed on OANDA automatically.</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={runScan}
                  disabled={running || mode === "OFF" || killSwitch}
                  className="rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 px-4 py-2 text-xs font-medium transition"
                >
                  {running ? "Scanning..." : "Run Scan Now"}
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-xl border border-white/10 hover:bg-white/5 disabled:opacity-40 px-4 py-2 text-xs font-medium transition"
                >
                  {saving ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </div>

            {/* Kill switch banner */}
            {killSwitch && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-red-300">Kill Switch Active</div>
                  <div className="text-xs text-red-400/70 mt-0.5">Agent is fully stopped. All scans blocked.</div>
                </div>
                <button
                  onClick={() => setDraft((d) => ({ ...d, kill_switch: false }))}
                  className="rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 px-3 py-1.5 text-xs text-red-300 transition"
                >
                  Deactivate
                </button>
              </div>
            )}

            {/* Mode + Kill switch */}
            <Section title="Agent Mode">
              <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-4">
                {MODES.map((m) => (
                  <button
                    key={m}
                    onClick={() => setDraft((d) => ({ ...d, agent_mode: m }))}
                    className={[
                      "rounded-xl border p-3 text-left transition",
                      mode === m
                        ? "border-purple-500/50 bg-purple-500/10 text-white"
                        : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/70",
                    ].join(" ")}
                  >
                    <div className="text-[10px] font-bold tracking-wider uppercase">
                      {m.replace("_", " ")}
                    </div>
                    <div className="mt-1 text-[10px] text-white/40">
                      {m === "OFF" && "Agent disabled"}
                      {m === "ALERT_ONLY" && "Notify only"}
                      {m === "APPROVAL_REQUIRED" && "Notify + you approve"}
                      {m === "DEMO_AUTO" && "Auto demo (future)"}
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2">
                <div>
                  <div className="text-xs text-white/70">Kill Switch</div>
                  <div className="text-[10px] text-white/30 mt-0.5">Immediately stops all agent activity</div>
                </div>
                <button
                  onClick={() => setDraft((d) => ({ ...d, kill_switch: !killSwitch }))}
                  className={[
                    "relative inline-flex h-6 w-11 items-center rounded-full border transition-colors",
                    killSwitch
                      ? "bg-red-500/70 border-red-500/50"
                      : "bg-white/10 border-white/20",
                  ].join(" ")}
                >
                  <span className={[
                    "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                    killSwitch ? "translate-x-6" : "translate-x-1",
                  ].join(" ")} />
                </button>
              </div>
            </Section>

            {/* Filters */}
            <Section title="Filters">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-wider">Min Confidence Score</label>
                  <div className="mt-1 flex items-center gap-3">
                    <input
                      type="range" min={40} max={95} step={5}
                      value={d.min_confidence_score ?? settings.min_confidence_score}
                      onChange={(e) => setDraft((d) => ({ ...d, min_confidence_score: Number(e.target.value) }))}
                      className="flex-1 accent-purple-500"
                    />
                    <span className="w-8 text-right text-xs text-white/70 font-mono">
                      {d.min_confidence_score ?? settings.min_confidence_score}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-wider">Min Risk:Reward</label>
                  <div className="mt-1 flex items-center gap-3">
                    <input
                      type="range" min={2} max={5} step={0.5}
                      value={d.min_risk_reward ?? settings.min_risk_reward}
                      onChange={(e) => setDraft((d) => ({ ...d, min_risk_reward: Number(e.target.value) }))}
                      className="flex-1 accent-purple-500"
                    />
                    <span className="w-8 text-right text-xs text-white/70 font-mono">
                      {(d.min_risk_reward ?? settings.min_risk_reward).toFixed(1)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-wider">Max Trades Per Day</label>
                  <div className="mt-1 flex items-center gap-3">
                    <input
                      type="range" min={1} max={5} step={1}
                      value={d.max_trades_per_day ?? settings.max_trades_per_day}
                      onChange={(e) => setDraft((d) => ({ ...d, max_trades_per_day: Number(e.target.value) }))}
                      className="flex-1 accent-purple-500"
                    />
                    <span className="w-8 text-right text-xs text-white/70 font-mono">
                      {d.max_trades_per_day ?? settings.max_trades_per_day}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-wider">Max Risk Per Trade (%)</label>
                  <div className="mt-1 flex items-center gap-3">
                    <input
                      type="range" min={0.1} max={1.0} step={0.05}
                      value={d.max_risk_per_trade_pct ?? settings.max_risk_per_trade_pct}
                      onChange={(e) => setDraft((d) => ({ ...d, max_risk_per_trade_pct: Number(e.target.value) }))}
                      className="flex-1 accent-purple-500"
                    />
                    <span className="w-10 text-right text-xs text-white/70 font-mono">
                      {((d.max_risk_per_trade_pct ?? settings.max_risk_per_trade_pct) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

              </div>

              {/* Pair picker */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[10px] text-white/40 uppercase tracking-wider">Allowed Pairs</label>
                  <div className="flex gap-1.5 text-[10px]">
                    <button onClick={selectAll} className="text-white/40 hover:text-white/70 transition">All</button>
                    <span className="text-white/20">·</span>
                    <button onClick={clearAll} className="text-white/40 hover:text-white/70 transition">Clear</button>
                  </div>
                </div>

                {/* Session quick-select + live indicator */}
                <div className="mb-4 flex flex-wrap gap-2">
                  {(Object.entries(SESSIONS) as [SessionKey, typeof SESSIONS[SessionKey]][]).map(([key, s]) => {
                    const isLive = activeSessions.includes(key);
                    const sessionPairs = getPairsForSession(key);
                    const allOn = sessionPairs.every((p) => (d.allowed_pairs ?? settings.allowed_pairs).includes(p));
                    return (
                      <button
                        key={key}
                        onClick={() => selectSession(key)}
                        className={[
                          "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] transition",
                          allOn ? s.color : "border-white/10 text-white/40 hover:text-white/60",
                        ].join(" ")}
                      >
                        {isLive && <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
                        {s.label}
                        <span className="text-white/30">{s.hours}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Pairs by category */}
                <div className="space-y-4">
                  {PAIR_CATEGORIES.map((cat) => (
                    <div key={cat.label}>
                      <div className="text-[9px] uppercase tracking-widest text-white/20 mb-2">{cat.label}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {cat.pairs.map(({ id, sessions: pairSessions }) => {
                          const on = (d.allowed_pairs ?? settings.allowed_pairs).includes(id);
                          return (
                            <button
                              key={id}
                              onClick={() => togglePair(id)}
                              className={[
                                "group flex flex-col items-start rounded-xl border px-2.5 py-1.5 text-[11px] transition",
                                on
                                  ? "border-purple-500/50 bg-purple-500/10 text-purple-200"
                                  : "border-white/10 text-white/30 hover:border-white/20 hover:text-white/60",
                              ].join(" ")}
                            >
                              <span className="font-medium">{id.replace("_", "/")}</span>
                              <div className="mt-0.5 flex gap-1">
                                {pairSessions.map((sk) => (
                                  <span
                                    key={sk}
                                    className={[
                                      "rounded px-1 text-[8px] border",
                                      activeSessions.includes(sk)
                                        ? SESSIONS[sk].color
                                        : "border-white/5 text-white/20",
                                    ].join(" ")}
                                  >
                                    {SESSIONS[sk].label.slice(0, 3).toUpperCase()}
                                  </span>
                                ))}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 text-[10px] text-white/25">
                  {(d.allowed_pairs ?? settings.allowed_pairs).length} pair{(d.allowed_pairs ?? settings.allowed_pairs).length !== 1 ? "s" : ""} selected
                  {activeSessions.length > 0
                    ? ` · Active session: ${activeSessions.map((s) => SESSIONS[s].label).join(" + ")}`
                    : " · No major session active"}
                </div>
              </div>
            </Section>

            {/* Risk Engine */}
            <Section title="Risk Engine">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">

                {/* Cooldown */}
                <div className="space-y-3">
                  <div className="text-[10px] text-white/30 uppercase tracking-widest">Consecutive Loss Cooldown</div>

                  <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-wider">Pause after N consecutive losses</label>
                    <div className="mt-1 flex items-center gap-3">
                      <input
                        type="range" min={0} max={6} step={1}
                        value={d.cooldown_after_losses ?? settings.cooldown_after_losses}
                        onChange={(e) => setDraft((d) => ({ ...d, cooldown_after_losses: Number(e.target.value) }))}
                        className="flex-1 accent-purple-500"
                      />
                      <span className="w-12 text-right text-xs text-white/70 font-mono">
                        {(d.cooldown_after_losses ?? settings.cooldown_after_losses) === 0
                          ? "Off"
                          : `${d.cooldown_after_losses ?? settings.cooldown_after_losses} loss${(d.cooldown_after_losses ?? settings.cooldown_after_losses) !== 1 ? "es" : ""}`}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-wider">Cooldown Duration</label>
                    <div className="mt-1 flex items-center gap-3">
                      <input
                        type="range" min={4} max={72} step={4}
                        value={d.cooldown_hours ?? settings.cooldown_hours}
                        onChange={(e) => setDraft((d) => ({ ...d, cooldown_hours: Number(e.target.value) }))}
                        className="flex-1 accent-purple-500"
                      />
                      <span className="w-12 text-right text-xs text-white/70 font-mono">
                        {d.cooldown_hours ?? settings.cooldown_hours}h
                      </span>
                    </div>
                  </div>

                  <div className="text-[10px] text-white/20 leading-relaxed pt-1">
                    Checks your journal. If the last {d.cooldown_after_losses ?? settings.cooldown_after_losses} closed trades are all losses, scanning pauses for {d.cooldown_hours ?? settings.cooldown_hours} hours.
                    Set to 0 to disable.
                  </div>
                </div>

                {/* Volatility Gate */}
                <div className="space-y-3">
                  <div className="text-[10px] text-white/30 uppercase tracking-widest">Volatility Gate</div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-white/70">Enable Volatility Gate</div>
                      <div className="text-[10px] text-white/30 mt-0.5">Skip pairs during news spikes or dead markets</div>
                    </div>
                    <button
                      onClick={() => setDraft((d) => ({ ...d, volatility_gate_enabled: !(d.volatility_gate_enabled ?? settings.volatility_gate_enabled) }))}
                      className={[
                        "relative inline-flex h-6 w-11 items-center rounded-full border transition-colors",
                        (d.volatility_gate_enabled ?? settings.volatility_gate_enabled)
                          ? "bg-purple-500/70 border-purple-500/50"
                          : "bg-white/10 border-white/20",
                      ].join(" ")}
                    >
                      <span className={[
                        "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                        (d.volatility_gate_enabled ?? settings.volatility_gate_enabled) ? "translate-x-6" : "translate-x-1",
                      ].join(" ")} />
                    </button>
                  </div>

                  <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-wider">Max ADR Multiplier (spike filter)</label>
                    <div className="mt-1 flex items-center gap-3">
                      <input
                        type="range" min={1.5} max={4.0} step={0.25}
                        value={d.max_adr_multiplier ?? settings.max_adr_multiplier}
                        onChange={(e) => setDraft((d) => ({ ...d, max_adr_multiplier: Number(e.target.value) }))}
                        disabled={!(d.volatility_gate_enabled ?? settings.volatility_gate_enabled)}
                        className="flex-1 accent-purple-500 disabled:opacity-30"
                      />
                      <span className="w-12 text-right text-xs text-white/70 font-mono">
                        {Number(d.max_adr_multiplier ?? settings.max_adr_multiplier).toFixed(2)}x
                      </span>
                    </div>
                  </div>

                  <div className="text-[10px] text-white/20 leading-relaxed pt-1">
                    Skip pair if today{`'`}s range is {`>`}{Number(d.max_adr_multiplier ?? settings.max_adr_multiplier).toFixed(2)}x the 14-day average range (news spike) or {`<`}30% of average (dead market).
                  </div>
                </div>
              </div>
            </Section>

            {/* News Blackout */}
            <Section title="News Blackout">
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-white/70">Enable News Blackout</div>
                      <div className="text-[10px] text-white/30 mt-0.5">
                        Skip pairs when a high-impact news event is imminent (Forex Factory feed)
                      </div>
                    </div>
                    <button
                      onClick={() => setDraft((d) => ({ ...d, news_blackout_enabled: !(d.news_blackout_enabled ?? settings.news_blackout_enabled) }))}
                      className={[
                        "relative inline-flex h-6 w-11 items-center rounded-full border transition-colors shrink-0",
                        (d.news_blackout_enabled ?? settings.news_blackout_enabled)
                          ? "bg-orange-500/70 border-orange-500/50"
                          : "bg-white/10 border-white/20",
                      ].join(" ")}
                    >
                      <span className={[
                        "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                        (d.news_blackout_enabled ?? settings.news_blackout_enabled) ? "translate-x-6" : "translate-x-1",
                      ].join(" ")} />
                    </button>
                  </div>

                  <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-wider">
                      Blackout window (minutes before &amp; after event)
                    </label>
                    <div className="mt-1 flex items-center gap-3">
                      <input
                        type="range" min={15} max={120} step={15}
                        value={d.news_blackout_minutes ?? settings.news_blackout_minutes}
                        onChange={(e) => setDraft((d) => ({ ...d, news_blackout_minutes: Number(e.target.value) }))}
                        disabled={!(d.news_blackout_enabled ?? settings.news_blackout_enabled)}
                        className="flex-1 accent-orange-500 disabled:opacity-30"
                      />
                      <span className="w-12 text-right text-xs text-white/70 font-mono">
                        {d.news_blackout_minutes ?? settings.news_blackout_minutes}m
                      </span>
                    </div>
                  </div>

                  <div className="text-[10px] text-white/20 leading-relaxed">
                    Fetches this week&apos;s Forex Factory high-impact calendar. Skips any pair whose currencies have an event within ±{d.news_blackout_minutes ?? settings.news_blackout_minutes} minutes. Feed is cached per scan run — no API key needed.
                  </div>
                </div>
              </div>
            </Section>

            {/* Scan Schedule */}
            <Section title="Scan Schedule">
              <div className="space-y-3">
                <div className="text-[10px] text-white/30 leading-relaxed">
                  H4 candles close every 4 hours. Choose which sessions the agent should scan.
                  Manual scans always run regardless of this setting.
                </div>

                {(["asian", "london", "new_york"] as const).map((key) => {
                  const labels: Record<string, string> = {
                    asian: "Asian  ·  00:00 & 04:00 UTC",
                    london: "London  ·  08:00 & 12:00 UTC",
                    new_york: "New York  ·  12:00, 16:00 & 20:00 UTC",
                  };
                  const current = d.scan_sessions ?? settings.scan_sessions ?? ["london", "new_york"];
                  const on = current.includes(key);
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <div className="text-xs text-white/70">{labels[key]}</div>
                      <button
                        onClick={() => {
                          const next = on
                            ? current.filter((s) => s !== key)
                            : [...current, key];
                          setDraft((d) => ({ ...d, scan_sessions: next }));
                        }}
                        className={[
                          "relative inline-flex h-6 w-11 items-center rounded-full border transition-colors",
                          on ? "bg-purple-500/70 border-purple-500/50" : "bg-white/10 border-white/20",
                        ].join(" ")}
                      >
                        <span className={[
                          "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                          on ? "translate-x-6" : "translate-x-1",
                        ].join(" ")} />
                      </button>
                    </div>
                  );
                })}

                <div className="text-[10px] text-white/20 pt-1">
                  {(() => {
                    const active = d.scan_sessions ?? settings.scan_sessions ?? [];
                    if (active.length === 0) return "No sessions selected — agent will never auto-scan.";
                    const count = active.includes("new_york") && active.includes("london")
                      ? 5 : active.includes("new_york") ? 3 : active.includes("london") ? 2 : 2;
                    return `~${count} scans per trading day`;
                  })()}
                </div>
              </div>
            </Section>

            {/* Telegram */}
            <Section title="Telegram Alerts">
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-white/40 uppercase tracking-wider">Telegram Chat ID</label>
                  <input
                    type="text"
                    value={d.telegram_chat_id ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, telegram_chat_id: e.target.value || null }))}
                    placeholder="e.g. 123456789  (from @userinfobot)"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-purple-500/50"
                  />
                  <div className="mt-1 text-[10px] text-white/30">
                    Message @userinfobot on Telegram to get your chat ID.
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={testTelegram}
                    disabled={testing}
                    className="rounded-xl border border-white/10 hover:bg-white/5 disabled:opacity-40 px-3 py-1.5 text-xs transition"
                  >
                    {testing ? "Sending..." : "Send Test Message"}
                  </button>
                  <button
                    onClick={setupWebhook}
                    disabled={settingUpWebhook}
                    className="rounded-xl border border-white/10 hover:bg-white/5 disabled:opacity-40 px-3 py-1.5 text-xs transition"
                  >
                    {settingUpWebhook ? "Registering..." : "Register Webhook"}
                  </button>
                </div>

                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-[11px] text-white/40 leading-relaxed">
                  <strong className="text-white/60">Setup steps:</strong>
                  <ol className="mt-1 list-decimal list-inside space-y-0.5">
                    <li>Add <code className="text-purple-400">TELEGRAM_BOT_TOKEN</code> to Vercel env vars</li>
                    <li>Message <code className="text-purple-400">@userinfobot</code> on Telegram → paste your Chat ID above</li>
                    <li>Save settings, then click <strong className="text-white/60">Send Test Message</strong></li>
                    <li>Once deployed on Vercel, click <strong className="text-white/60">Register Webhook</strong></li>
                  </ol>
                </div>
              </div>
            </Section>

            {/* Recent Runs */}
            <Section title="Recent Runs">
              {runs.length === 0 ? (
                <div className="text-xs text-white/30 text-center py-6">No runs yet. Hit "Run Scan Now" to start.</div>
              ) : (
                <div className="space-y-2">
                  {runs.slice(0, 10).map((run) => (
                    <div key={run.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5">
                      <div className="text-xs text-white/60">
                        {new Date(run.created_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                        <span className="ml-2 text-white/30">{run.triggered_by}</span>
                      </div>
                      <div className="flex gap-3 text-xs">
                        <span className="text-white/50">{run.pairs_scanned?.length ?? 0} pairs</span>
                        <span className={run.candidates_found > 0 ? "text-emerald-400" : "text-white/30"}>
                          {run.candidates_found} candidate{run.candidates_found !== 1 ? "s" : ""}
                        </span>
                        {run.error && <span className="text-red-400/70">error</span>}
                        {run.duration_ms && <span className="text-white/25">{run.duration_ms}ms</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Recent Candidates */}
            <Section title="Recent Candidates">
              {candidates.length === 0 ? (
                <div className="text-xs text-white/30 text-center py-6">
                  No candidates yet. Run a scan when the market is open.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-white/30 text-left">
                        <th className="pb-2 pr-4 font-medium">Pair</th>
                        <th className="pb-2 pr-4 font-medium">Setup</th>
                        <th className="pb-2 pr-4 font-medium">Score</th>
                        <th className="pb-2 pr-4 font-medium">RR</th>
                        <th className="pb-2 pr-4 font-medium">Status</th>
                        <th className="pb-2 pr-4 font-medium">Decision</th>
                        <th className="pb-2 font-medium">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.slice(0, 20).map((c) => (
                        <tr key={c.id} className="border-t border-white/5">
                          <td className="py-2 pr-4 font-medium text-white/80">{c.pair.replace("_", "/")}</td>
                          <td className="py-2 pr-4 text-white/50">{c.setup_type ?? "—"}</td>
                          <td className="py-2 pr-4 text-white/60 font-mono">{c.confidence_score ?? "—"}</td>
                          <td className="py-2 pr-4 text-white/60 font-mono">
                            {c.risk_reward != null ? `${Number(c.risk_reward).toFixed(1)}:1` : "—"}
                          </td>
                          <td className="py-2 pr-4">
                            {c.trade_status === "TRADE_READY" && <Badge text="READY" color="green" />}
                            {c.trade_status === "WATCHLIST" && <Badge text="WATCH" color="yellow" />}
                            {c.trade_status === "NO_TRADE" && <Badge text="NO TRADE" color="gray" />}
                            {c.trade_status === "AVOID" && <Badge text="AVOID" color="red" />}
                            {!c.trade_status && "—"}
                          </td>
                          <td className="py-2 pr-4">{decisionBadge(c.decision)}</td>
                          <td className="py-2 text-white/30">
                            {new Date(c.created_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* Current status summary */}
            <Section title="Current Status">
              <Row label="Agent mode" value={modeBadge(mode)} />
              <Row label="Kill switch" value={
                killSwitch
                  ? <span className="text-red-400">Active — agent stopped</span>
                  : <span className="text-white/50">Off</span>
              } />
              <Row label="Min confidence score" value={<span className="font-mono">{d.min_confidence_score ?? settings.min_confidence_score}</span>} />
              <Row label="Min risk:reward" value={<span className="font-mono">{(d.min_risk_reward ?? settings.min_risk_reward).toFixed(1)}:1</span>} />
              <Row label="Max trades / day" value={<span className="font-mono">{d.max_trades_per_day ?? settings.max_trades_per_day}</span>} />
              <Row label="Allowed pairs" value={
                <span className="font-mono text-white/60">
                  {(d.allowed_pairs ?? settings.allowed_pairs).length} pairs selected
                </span>
              } />
              <Row label="Telegram chat ID" value={
                <span className={d.telegram_chat_id ?? settings.telegram_chat_id ? "text-emerald-400 font-mono" : "text-white/20"}>
                  {d.telegram_chat_id ?? settings.telegram_chat_id ?? "Not configured"}
                </span>
              } />
              <Row label="Cooldown after losses" value={
                <span className="font-mono">
                  {(d.cooldown_after_losses ?? settings.cooldown_after_losses) === 0
                    ? "Disabled"
                    : `${d.cooldown_after_losses ?? settings.cooldown_after_losses} losses → ${d.cooldown_hours ?? settings.cooldown_hours}h pause`}
                </span>
              } />
              <Row label="Volatility gate" value={
                (d.volatility_gate_enabled ?? settings.volatility_gate_enabled)
                  ? <span className="text-purple-400 font-mono">On — {Number(d.max_adr_multiplier ?? settings.max_adr_multiplier).toFixed(2)}x ADR</span>
                  : <span className="text-white/30">Off</span>
              } />
              <Row label="News blackout" value={
                (d.news_blackout_enabled ?? settings.news_blackout_enabled)
                  ? <span className="text-orange-400 font-mono">On — ±{d.news_blackout_minutes ?? settings.news_blackout_minutes}m window</span>
                  : <span className="text-white/30">Off</span>
              } />
              <Row label="Trade execution" value={<span className="text-yellow-400/80">Disabled — Phase 1 (alerts only)</span>} />
            </Section>

          </div>
        </main>
      </div>
    </div>
  );
}
