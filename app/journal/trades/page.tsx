"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import JournalShell from "@/components/journal/JournalShell";
import Filters from "@/components/journal/Filters";
import { useJournal } from "@/components/journal/useJournal";
import { ctTime, duration, money, pnlClass } from "@/lib/journal/format";
import { summarize } from "@/lib/journal/stats";

export default function TradesPage() {
  const { account, setAccount, range, setRange, data, loading, error } = useJournal();
  const [symbol, setSymbol] = useState("");
  const [result, setResult] = useState<"" | "WIN" | "LOSS">("");
  const [playbook, setPlaybook] = useState("");

  const all = useMemo(() => data?.trades ?? [], [data]);
  const symbols = useMemo(() => [...new Set(all.map((t) => t.pair))].sort(), [all]);
  const pbName = new Map((data?.playbooks ?? []).map((p) => [p.id, p.name]));
  const acctName = new Map((data?.accounts ?? []).map((a) => [a.id, a.name]));

  const trades = all
    .filter((t) => (!symbol || t.pair === symbol) && (!result || (result === "WIN" ? (t.pnl ?? 0) > 0 : (t.pnl ?? 0) < 0)))
    .filter((t) => !playbook || (playbook === "none" ? !t.playbook_id : t.playbook_id === playbook))
    .sort((a, b) => (b.exited_at ?? "").localeCompare(a.exited_at ?? ""));
  const s = summarize(trades);

  const sel = "rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white outline-none focus:border-purple-400/60";

  return (
    <JournalShell
      actions={
        <Link href="/journal/new" className="rounded-xl border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:text-white">
          Add manually
        </Link>
      }
    >
      <Filters accounts={data?.accounts ?? []} account={account} setAccount={setAccount} range={range} setRange={setRange} />
      <div className="flex flex-wrap items-center gap-2">
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className={sel} aria-label="Symbol">
          <option value="">All symbols</option>
          {symbols.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select value={result} onChange={(e) => setResult(e.target.value as "" | "WIN" | "LOSS")} className={sel} aria-label="Result">
          <option value="">Wins &amp; losses</option>
          <option value="WIN">Winners</option>
          <option value="LOSS">Losers</option>
        </select>
        <select value={playbook} onChange={(e) => setPlaybook(e.target.value)} className={sel} aria-label="Playbook">
          <option value="">Any playbook</option>
          <option value="none">Not reviewed</option>
          {(data?.playbooks ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="ml-auto text-xs text-white/50">
          {s.trades} trades · <span className={pnlClass(s.netPnl)}>{money(s.netPnl, { sign: true })}</span> · {Math.round(s.winRate * 100)}% win
        </div>
      </div>
      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}

      <div className={`overflow-x-auto rounded-2xl border border-white/10 ${loading ? "opacity-60" : ""}`}>
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-3 py-2">Closed (CT)</th>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Side</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">Entry</th>
              <th className="px-3 py-2 text-right">Exit</th>
              <th className="px-3 py-2 text-right">Hold</th>
              <th className="px-3 py-2 text-right">Net P&amp;L</th>
              <th className="px-3 py-2 text-right">R</th>
              <th className="px-3 py-2">Playbook</th>
              <th className="px-3 py-2">Account</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id} className="border-t border-white/5 text-white/75 hover:bg-white/[0.03]">
                <td className="whitespace-nowrap px-3 py-2">
                  <Link href={`/journal/${t.id}`} className="hover:text-white">
                    {ctTime(t.exited_at)}
                  </Link>
                </td>
                <td className="px-3 py-2 text-white">{t.pair}</td>
                <td className={`px-3 py-2 ${t.direction === "LONG" ? "text-emerald-200/80" : "text-red-200/80"}`}>{t.direction === "LONG" ? "Long" : "Short"}</td>
                <td className="px-3 py-2 text-right font-mono">{t.quantity ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono">{t.entry_price?.toFixed(2) ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono">{t.exit_price?.toFixed(2) ?? "—"}</td>
                <td className="px-3 py-2 text-right text-white/50">{duration(t.duration_sec)}</td>
                <td className={`px-3 py-2 text-right font-mono ${pnlClass(t.pnl)}`}>{money(t.pnl, { sign: true })}</td>
                <td className="px-3 py-2 text-right font-mono text-white/60">{t.r_multiple !== null ? t.r_multiple.toFixed(2) : "—"}</td>
                <td className="max-w-[150px] truncate px-3 py-2 text-white/50">{t.playbook_id ? pbName.get(t.playbook_id) : ""}</td>
                <td className="max-w-[140px] truncate px-3 py-2 text-white/40">{t.account_id ? acctName.get(t.account_id) : "Manual"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && trades.length === 0 ? <div className="py-10 text-center text-xs text-white/40">No trades match these filters.</div> : null}
      </div>
    </JournalShell>
  );
}
