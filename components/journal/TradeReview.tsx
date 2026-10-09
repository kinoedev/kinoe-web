"use client";

import { useEffect, useState } from "react";
import type { JournalEntry } from "@/lib/db/types";
import type { Playbook } from "@/lib/journal/store";
import { duration, money, pnlClass } from "@/lib/journal/format";
import { getSymbol } from "@/lib/futures/symbols";

const MISTAKES = ["Early entry", "Chased", "No stop", "Moved stop", "Cut winner early", "Held loser", "Oversized", "Revenge trade", "Against bias", "Not at a level", "Overtraded", "Ignored news"];
const EMOTIONS = ["Calm", "Confident", "Patient", "Anxious", "FOMO", "Greedy", "Frustrated", "Bored"];

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function ctFull(ms: number | string | null | undefined) {
  if (ms === null || ms === undefined) return "—";
  return new Date(ms).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
}

/** P&L summary + executions for imported trades. */
export function TradeSummary({ entry }: { entry: JournalEntry }) {
  const net = n(entry.pnl);
  const execs = entry.executions_json ?? [];
  const tv = getSymbol(entry.pair)?.tradingView;
  return (
    <div className="mt-6 space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {[
          ["Net P&L", money(net, { sign: true }), pnlClass(net)],
          ["Gross", money(n(entry.gross_pnl), { sign: true }), "text-white/80"],
          ["Fees", money(n(entry.fees)), "text-white/80"],
          ["Contracts", String(n(entry.quantity) ?? "—"), "text-white/80"],
          ["Hold", duration(entry.duration_sec), "text-white/80"],
          ["R", entry.r_multiple !== null ? `${Number(entry.r_multiple).toFixed(2)}R` : "add a stop", "text-white/80"],
        ].map(([k, v, c]) => (
          <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest text-white/40">{k}</div>
            <div className={`font-mono text-sm ${c}`}>{v}</div>
          </div>
        ))}
      </div>
      {execs.length ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-3 py-2">Time (CT)</th>
                <th className="px-3 py-2">Side</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {execs.map((e, i) => (
                <tr key={i} className="border-t border-white/5 text-white/70">
                  <td className="px-3 py-1.5">{ctFull(e.ts)}</td>
                  <td className={`px-3 py-1.5 ${e.side === "BUY" ? "text-emerald-200/80" : "text-red-200/80"}`}>{e.side === "BUY" ? "Buy" : "Sell"}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{e.qty}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{Number(e.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {tv ? (
        <a href={`/charts?symbol=${encodeURIComponent(tv)}`} className="inline-block text-xs text-purple-200/80 hover:text-purple-100">
          Open {entry.pair} chart →
        </a>
      ) : null}
    </div>
  );
}

/** Playbook, rules checklist, stop (for R), rating and tags. Saves as you go. */
export function TradeReview({ entry, onChange }: { entry: JournalEntry; onChange: (e: JournalEntry) => void }) {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [stop, setStop] = useState(entry.stop_loss !== null ? String(entry.stop_loss) : "");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/journal/playbooks", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d.ok && setPlaybooks(d.playbooks));
  }, []);

  const pb = playbooks.find((p) => p.id === entry.playbook_id);
  const followed = new Set(entry.rules_followed ?? []);

  const review = async (patch: Record<string, unknown>) => {
    setStatus("Saving…");
    const res = await fetch(`/api/journal/${entry.id}/review`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const d = await res.json();
    if (d.ok) {
      onChange(d.entry);
      setStatus("Saved");
    } else setStatus(d.error ?? "Save failed");
  };
  const tags = async (field: "mistake_tags" | "emotion_tags", value: string) => {
    const cur = new Set(entry[field] ?? []);
    if (cur.has(value)) cur.delete(value);
    else cur.add(value);
    setStatus("Saving…");
    const res = await fetch(`/api/journal/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: [...cur] }) });
    const d = await res.json();
    if (d.ok) {
      onChange(d.entry);
      setStatus("Saved");
    } else setStatus(d.error ?? "Save failed");
  };

  const chip = (on: boolean) => `rounded-lg border px-2.5 py-1 text-xs transition ${on ? "border-purple-400/60 bg-purple-500/20 text-purple-50" : "border-white/10 text-white/50 hover:text-white/80"}`;

  return (
    <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-white/85">Trade review</div>
        {status ? <div className="text-[11px] text-white/40">{status}</div> : null}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <label className="block text-xs text-white/50">
          Playbook
          <select
            value={entry.playbook_id ?? ""}
            onChange={(e) => review({ playbook_id: e.target.value || null, rules_followed: [] })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-purple-400/60"
          >
            <option value="">None / unplanned</option>
            {playbooks.filter((p) => !p.archived).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-white/50">
          Initial stop (gives you R)
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              step="any"
              value={stop}
              onChange={(e) => setStop(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-purple-400/60"
            />
            <button onClick={() => review({ stop_loss: stop === "" ? null : Number(stop) })} className="rounded-lg border border-white/15 px-3 text-xs text-white/70">
              Set
            </button>
          </div>
        </label>
        <div className="text-xs text-white/50">
          Execution rating
          <div className="mt-1 flex gap-1">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onClick={() => review({ rating: entry.rating === v ? null : v })}
                className={`text-xl ${v <= (entry.rating ?? 0) ? "text-purple-300" : "text-white/20"}`}
                aria-label={`${v} of 5`}
              >
                ★
              </button>
            ))}
          </div>
        </div>
      </div>

      {pb ? (
        <div>
          <div className="mb-1 text-xs text-white/50">
            Rules followed · {followed.size}/{pb.rules.length}
          </div>
          <div className="space-y-1">
            {pb.rules.map((r) => (
              <label key={r} className="flex items-center gap-2 text-xs text-white/75">
                <input
                  type="checkbox"
                  checked={followed.has(r)}
                  onChange={() => {
                    const next = new Set(followed);
                    if (next.has(r)) next.delete(r);
                    else next.add(r);
                    review({ rules_followed: [...next] });
                  }}
                />
                {r}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-1 text-xs text-white/50">Mistakes</div>
        <div className="flex flex-wrap gap-1.5">
          {MISTAKES.map((m) => (
            <button key={m} onClick={() => tags("mistake_tags", m)} className={chip((entry.mistake_tags ?? []).includes(m))}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs text-white/50">How you felt</div>
        <div className="flex flex-wrap gap-1.5">
          {EMOTIONS.map((m) => (
            <button key={m} onClick={() => tags("emotion_tags", m)} className={chip((entry.emotion_tags ?? []).includes(m))}>
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
