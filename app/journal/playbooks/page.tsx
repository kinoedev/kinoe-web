"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import JournalShell from "@/components/journal/JournalShell";
import { useJournal } from "@/components/journal/useJournal";
import { money, pct, pnlClass, ratio } from "@/lib/journal/format";
import { summarize } from "@/lib/journal/stats";
import type { Playbook } from "@/lib/journal/store";
import type { Stats } from "@/lib/backtest/stats";

type BacktestInfo = { stats: Stats; contracts: string[]; ranAt: string } | null;

function Editor({ pb, onSaved, onCancel }: { pb?: Playbook; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(pb?.name ?? "");
  const [desc, setDesc] = useState(pb?.description_md ?? "");
  const [rules, setRules] = useState((pb?.rules ?? []).join("\n"));
  const [setup, setSetup] = useState<string>(pb?.backtest_setup ?? "");
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const res = await fetch("/api/journal/playbooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: pb?.id, name, description_md: desc, rules: rules.split("\n"), backtest_setup: setup || null }),
    });
    const d = await res.json();
    if (!d.ok) return setErr(d.error);
    onSaved();
  };
  const input = "mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-purple-400/60";
  return (
    <div className="space-y-3">
      <label className="block text-xs text-white/50">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </label>
      <label className="block text-xs text-white/50">
        Description
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className={input} />
      </label>
      <label className="block text-xs text-white/50">
        Rules — one per line (these become the checklist on each trade)
        <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={6} className={`${input} font-mono text-xs`} />
      </label>
      <label className="block text-xs text-white/50">
        Compare with backtest
        <select value={setup} onChange={(e) => setSetup(e.target.value)} className={input}>
          <option value="">None</option>
          <option value="A">Setup A · break &amp; retest</option>
          <option value="B">Setup B · failed break</option>
        </select>
      </label>
      {err ? <div className="text-xs text-red-300">{err}</div> : null}
      <div className="flex gap-2">
        <button onClick={save} className="rounded-xl border border-purple-400/50 bg-purple-500/20 px-4 py-2 text-sm text-purple-50">
          Save
        </button>
        <button onClick={onCancel} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/60">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Compare({ label, live, test }: { label: string; live: string; test: string | null }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-xs">
      <span className="text-white/45">{label}</span>
      <span className="text-right font-mono text-white/85">{live}</span>
      <span className="text-right font-mono text-white/45">{test ?? "—"}</span>
    </div>
  );
}

export default function PlaybooksPage() {
  const { data, reload } = useJournal();
  const [backtest, setBacktest] = useState<Record<string, BacktestInfo>>({});
  const [editing, setEditing] = useState<string | "new" | null>(null);

  const loadBacktest = () =>
    fetch("/api/journal/playbooks", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d.ok && setBacktest(d.backtest));
  useEffect(() => {
    loadBacktest();
  }, []);

  const trades = useMemo(() => data?.trades ?? [], [data]);
  const playbooks = data?.playbooks ?? [];
  const unreviewed = trades.filter((t) => !t.playbook_id).length;

  return (
    <JournalShell
      actions={
        <button onClick={() => setEditing("new")} className="rounded-xl border border-purple-400/50 bg-purple-500/20 px-3 py-1.5 text-xs text-purple-50">
          New playbook
        </button>
      }
    >
      {unreviewed ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-white/55">
          {unreviewed} trade{unreviewed === 1 ? " isn't" : "s aren't"} tagged to a playbook yet. Open a trade and pick its playbook to start tracking each strategy.{" "}
          <Link href="/journal/trades" className="text-purple-200/80 hover:text-purple-100">
            Review trades →
          </Link>
        </div>
      ) : null}
      {editing === "new" ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <Editor
            onSaved={() => {
              setEditing(null);
              reload();
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {playbooks.map((pb) => {
          const ts = trades.filter((t) => t.playbook_id === pb.id);
          const s = summarize(ts);
          const bt = pb.backtest_setup ? backtest[pb.backtest_setup] : null;
          const adherence = ts.length && pb.rules.length ? ts.reduce((x, t) => x + t.rules_followed.length / pb.rules.length, 0) / ts.length : null;
          if (editing === pb.id)
            return (
              <div key={pb.id} className="rounded-2xl border border-purple-500/30 bg-white/[0.03] p-4">
                <Editor
                  pb={pb}
                  onSaved={() => {
                    setEditing(null);
                    reload();
                    loadBacktest();
                  }}
                  onCancel={() => setEditing(null)}
                />
              </div>
            );
          return (
            <div key={pb.id} className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-950 to-black p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm text-white">{pb.name}</div>
                  {pb.description_md ? <div className="mt-0.5 text-[11px] text-white/45">{pb.description_md}</div> : null}
                </div>
                <button onClick={() => setEditing(pb.id)} className="text-[11px] text-purple-200/80 hover:text-purple-100">
                  Edit
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-wider text-white/35">
                <span />
                <span className="text-right">You (live)</span>
                <span className="text-right">Backtest</span>
              </div>
              <div className="mt-1 space-y-1">
                <Compare label="Trades" live={String(s.trades)} test={bt ? String(bt.stats.trades) : null} />
                <Compare label="Win rate" live={s.trades ? pct(s.winRate) : "—"} test={bt ? pct(bt.stats.winRate) : null} />
                <Compare label="Avg R" live={s.avgR !== null ? `${s.avgR.toFixed(2)}R` : "—"} test={bt ? `${bt.stats.expectancyR.toFixed(2)}R` : null} />
                <Compare label="Profit factor" live={s.trades ? ratio(s.profitFactor) : "—"} test={bt ? ratio(bt.stats.profitFactor) : null} />
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <span className="text-white/45">Net P&amp;L</span>
                  <span className={`text-right font-mono ${pnlClass(s.netPnl)}`}>{s.trades ? money(s.netPnl, { sign: true, cents: false }) : "—"}</span>
                  <span className="text-right text-white/30">{bt ? bt.contracts.join(" ") : pb.backtest_setup ? "run a backtest" : ""}</span>
                </div>
              </div>
              {s.avgR === null && s.trades > 0 ? (
                <div className="mt-2 text-[10px] text-white/35">Live R needs a stop on each trade — add it on the trade page.</div>
              ) : null}
              <div className="mt-4 text-[10px] uppercase tracking-widest text-white/35">
                Rules{adherence !== null ? ` · followed ${Math.round(adherence * 100)}% of the time` : ""}
              </div>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-white/65">
                {pb.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </JournalShell>
  );
}
