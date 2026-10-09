"use client";

import { useMemo } from "react";
import JournalShell from "@/components/journal/JournalShell";
import Filters from "@/components/journal/Filters";
import { useJournal } from "@/components/journal/useJournal";
import { money, pnlClass, ratio } from "@/lib/journal/format";
import { breakdowns, type Group } from "@/lib/journal/stats";

/** Net P&L per slice as a bar diverging from zero, with the numbers alongside. */
function GroupTable({ title, rows, note }: { title: string; rows: Group[]; note?: string }) {
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="text-xs text-white/70">{title}</div>
        {note ? <div className="text-[10px] text-white/35">{note}</div> : null}
      </div>
      <div className="space-y-1">
        <div className="grid grid-cols-[minmax(64px,1fr)_minmax(80px,1.4fr)_44px_44px_76px] gap-2 text-[10px] uppercase tracking-wider text-white/35">
          <span />
          <span>Net P&amp;L</span>
          <span className="text-right">Trades</span>
          <span className="text-right">Win</span>
          <span className="text-right">Net</span>
        </div>
        {rows.map((r) => {
          const w = (Math.abs(r.net) / max) * 50;
          return (
            <div
              key={r.key}
              className="grid grid-cols-[minmax(64px,1fr)_minmax(80px,1.4fr)_44px_44px_76px] items-center gap-2 text-xs"
              title={`${r.key}: ${money(r.net)} over ${r.trades} trades · avg ${money(r.avg)} · PF ${ratio(r.pf)}`}
            >
              <span className="truncate text-white/75">{r.key}</span>
              <span className="relative h-3">
                <span className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
                <span
                  className={`absolute inset-y-0.5 rounded-sm ${r.net >= 0 ? "bg-emerald-400/70" : "bg-red-400/70"}`}
                  style={r.net >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
                />
              </span>
              <span className="text-right font-mono text-white/55">{r.trades}</span>
              <span className="text-right font-mono text-white/55">{Math.round(r.winRate * 100)}%</span>
              <span className={`text-right font-mono ${pnlClass(r.net)}`}>{money(r.net, { cents: false })}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { account, setAccount, range, setRange, data, loading, error } = useJournal();
  const b = useMemo(
    () =>
      breakdowns(data?.trades ?? [], {
        playbooks: new Map((data?.playbooks ?? []).map((p) => [p.id, p.name])),
        accounts: new Map((data?.accounts ?? []).map((a) => [a.id, a.name])),
      }),
    [data]
  );
  return (
    <JournalShell>
      <Filters accounts={data?.accounts ?? []} account={account} setAccount={setAccount} range={range} setRange={setRange} />
      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
      {!loading && !(data?.trades.length ?? 0) ? (
        <div className="rounded-2xl border border-white/10 px-6 py-12 text-center text-sm text-white/50">No trades in this range.</div>
      ) : null}
      <div className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${loading ? "opacity-60" : ""}`}>
        <GroupTable title="By symbol" rows={b.symbol} />
        <GroupTable title="By entry time (CT)" rows={b.hour} note="hour the trade was opened" />
        <GroupTable title="By weekday" rows={b.weekday} note="CME trading day" />
        <GroupTable title="By hold time" rows={b.duration} />
        <GroupTable title="By direction" rows={b.direction} />
        <GroupTable title="By playbook" rows={b.playbook} />
        <GroupTable title="By mistake tag" rows={b.mistakes} note="tag trades on their page" />
        <GroupTable title="By account" rows={b.account} />
      </div>
    </JournalShell>
  );
}
