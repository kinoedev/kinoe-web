"use client";

import Link from "next/link";
import { useMemo } from "react";
import JournalShell from "@/components/journal/JournalShell";
import Filters from "@/components/journal/Filters";
import LineChart from "@/components/journal/LineChart";
import PnlCalendar from "@/components/journal/PnlCalendar";
import { useJournal } from "@/components/journal/useJournal";
import { compactMoney, ctTime, duration, money, pct, pnlClass, ratio, todayTradingDay } from "@/lib/journal/format";
import { dailyPnl, kinoeScore, propStatus, summarize, type PropStatus } from "@/lib/journal/stats";
import type { TradingAccount } from "@/lib/journal/store";

const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-white/40">{label}</div>
      <div className={`mt-1 font-mono text-xl ${tone === undefined ? "text-white" : pnlClass(tone)}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-white/40">{sub}</div> : null}
    </div>
  );
}

function Meter({ label, value, max, detail, warnAt }: { label: string; value: number; max: number; detail: string; warnAt?: number }) {
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const warn = warnAt !== undefined && frac >= warnAt;
  return (
    <div>
      <div className="flex justify-between text-[11px] text-white/55">
        <span>{label}</span>
        <span className={warn ? "text-red-300" : "text-white/75"}>{detail}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-white/10">
        <div className={`h-full rounded-full ${warn ? "bg-red-400" : "bg-purple-400"}`} style={{ width: `${frac * 100}%` }} />
      </div>
    </div>
  );
}

function PropCard({ account, s, balances }: { account: TradingAccount; s: PropStatus; balances: { x: string; y: number }[] }) {
  const doneForDay = s.dailyRoom !== null && s.dailyRoom <= 0;
  return (
    <div className="rounded-2xl border border-purple-500/25 bg-gradient-to-br from-zinc-950 to-black p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm text-white">{account.name}</div>
        {account.account_number ? <span className="font-mono text-[10px] text-white/35">{account.account_number}</span> : null}
        {doneForDay ? (
          <span className="rounded-md border border-red-400/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-red-200">Done for day</span>
        ) : null}
        <div className={`ml-auto font-mono text-sm ${pnlClass(s.profit)}`}>{money(s.balance, { cents: false })}</div>
      </div>
      {balances.length > 1 ? (
        <div className="mt-2">
          <LineChart
            points={balances}
            format={(v) => money(v, { cents: false })}
            height={130}
            label={`${account.name} balance`}
            zeroLine={false}
            refLine={s.floor !== null ? { y: s.floor, label: `floor ${compactMoney(s.floor)}` } : undefined}
          />
        </div>
      ) : null}
      <div className="mt-3 space-y-3">
        {s.profitTarget ? (
          <Meter label="Profit target" value={Math.max(0, s.profit)} max={s.profitTarget} detail={`${money(s.profit, { sign: true, cents: false })} of ${money(s.profitTarget, { cents: false })}`} />
        ) : null}
        {s.floor !== null && s.roomToFloor !== null && account.max_drawdown ? (
          <Meter
            label={`Drawdown (${account.drawdown_type === "EOD_TRAILING" ? "EOD trailing" : "static"})`}
            value={account.max_drawdown - s.roomToFloor}
            max={account.max_drawdown}
            detail={`${money(s.roomToFloor, { cents: false })} left · floor ${money(s.floor, { cents: false })}`}
            warnAt={0.7}
          />
        ) : null}
        {s.dailyLimit && s.dailyRoom !== null ? (
          <Meter
            label="Today's loss limit"
            value={Math.max(0, -s.todayPnl)}
            max={s.dailyLimit}
            detail={`${money(s.todayPnl, { sign: true, cents: false })} · ${money(s.dailyRoom, { cents: false })} left`}
            warnAt={0.6}
          />
        ) : null}
      </div>
      <div className="mt-2 text-[10px] text-white/30">From closed trades. Open positions and firm-specific trail locks aren&apos;t included.</div>
    </div>
  );
}

export default function JournalDashboard() {
  const { account, setAccount, range, setRange, data, loading, error } = useJournal();
  const trades = useMemo(() => data?.trades ?? [], [data]);

  const s = useMemo(() => summarize(trades), [trades]);
  const days = useMemo(() => dailyPnl(trades), [trades]);
  const score = useMemo(() => kinoeScore(s, trades, new Map((data?.playbooks ?? []).map((p) => [p.id, p.rules.length]))), [s, trades, data]);
  const curve = useMemo(() => {
    const out: { x: string; y: number; sub: string }[] = [];
    for (const [d, v] of [...days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      out.push({
        x: shortDay(d),
        y: (out.length ? out[out.length - 1].y : 0) + v.pnl,
        sub: `day ${money(v.pnl, { sign: true })} · ${v.trades} trades`,
      });
    }
    return out;
  }, [days]);
  const noteDays = useMemo(() => new Set((data?.notes ?? []).map((n) => n.trading_day)), [data]);

  const today = todayTradingDay();
  const propAccounts = (data?.accounts ?? []).filter(
    (a) => (!account || a.id === account) && a.starting_balance !== null && (a.status === "ACTIVE" || a.status === "FUNDED")
  );
  const recent = [...trades].sort((a, b) => (b.exited_at ?? "").localeCompare(a.exited_at ?? "")).slice(0, 8);
  const hasAny = trades.length > 0;

  return (
    <JournalShell
      actions={
        <Link href="/journal/import" className="rounded-xl border border-purple-400/50 bg-purple-500/20 px-3 py-1.5 text-xs text-purple-50 hover:bg-purple-500/30">
          Import trades
        </Link>
      }
    >
      <Filters accounts={data?.accounts ?? []} account={account} setAccount={setAccount} range={range} setRange={setRange} />

      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}

      {!loading && !hasAny ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-14 text-center">
          <div className="text-sm text-white/70">No closed trades in this range.</div>
          <div className="mt-1 text-xs text-white/40">Import your Tradovate Performance reports (PDF or CSV) to fill the journal.</div>
          <Link href="/journal/import" className="mt-4 inline-block rounded-xl border border-purple-400/50 bg-purple-500/20 px-4 py-2 text-sm text-purple-50">
            Import trades
          </Link>
        </div>
      ) : null}

      {hasAny ? (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Tile label="Net P&L" value={money(s.netPnl, { sign: true })} sub={`${money(s.fees)} fees`} tone={s.netPnl} />
            <Tile label="Trade win %" value={pct(s.winRate)} sub={`${s.wins} W · ${s.losses} L · ${s.breakeven} BE`} />
            <Tile label="Profit factor" value={ratio(s.profitFactor)} />
            <Tile label="Avg win / loss" value={ratio(s.payoff)} sub={`${money(s.avgWin, { cents: false })} / ${money(s.avgLoss, { cents: false })}`} />
            <Tile label="Day win %" value={pct(s.dayWinRate)} sub={`${s.tradingDays} trading days`} />
            <Tile label="Expectancy" value={money(s.expectancy, { sign: true })} sub={s.avgR !== null ? `avg ${s.avgR.toFixed(2)}R on ${s.rTrades}` : "per trade"} tone={s.expectancy} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="mb-2 flex items-baseline justify-between">
                <div className="text-xs text-white/50">Cumulative net P&amp;L (by trading day)</div>
                <div className="text-[11px] text-white/35">max drawdown {money(-s.maxDrawdown, { cents: false })}</div>
              </div>
              <LineChart points={curve} format={(v) => compactMoney(v)} label="Cumulative net P&L" />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-baseline justify-between">
                <div className="text-xs text-white/50">Kinoe score</div>
                <div className="font-mono text-2xl text-white">{score.score}</div>
              </div>
              <div className="mt-3 space-y-2.5">
                {score.parts.map((p) => (
                  <div key={p.label}>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-white/60">{p.label}</span>
                      <span className="text-white/45">{p.detail}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-purple-400" style={{ width: `${p.score}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {score.parts.length < 6 ? (
                <div className="mt-3 text-[10px] text-white/35">Review trades against a playbook to add rule-following to the score.</div>
              ) : null}
            </div>
          </div>

          {propAccounts.length ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {propAccounts.map((a) => {
                const ps = propStatus(a, trades, today);
                if (!ps) return null;
                const balances = [{ x: "Start", y: a.starting_balance ?? 0 }];
                for (const [d, v] of [...dailyPnl(trades.filter((t) => t.account_id === a.id)).entries()].sort(([x], [y]) => x.localeCompare(y))) {
                  balances.push({ x: shortDay(d), y: balances[balances.length - 1].y + v.pnl });
                }
                return <PropCard key={a.id} account={a} s={ps} balances={balances} />;
              })}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <PnlCalendar days={days} noteDays={noteDays} />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs text-white/50">Recent trades</div>
                <Link href="/journal/trades" className="text-[11px] text-purple-200/80 hover:text-purple-100">
                  All trades →
                </Link>
              </div>
              <div className="divide-y divide-white/5">
                {recent.map((t) => (
                  <Link key={t.id} href={`/journal/${t.id}`} className="flex items-center gap-3 py-2 text-xs hover:bg-white/[0.03]">
                    <span className="w-24 shrink-0 text-white/45">{ctTime(t.exited_at)}</span>
                    <span className="w-10 text-white/85">{t.pair}</span>
                    <span className={`w-12 ${t.direction === "LONG" ? "text-emerald-200/70" : "text-red-200/70"}`}>{t.direction === "LONG" ? "Long" : "Short"}</span>
                    <span className="hidden text-white/35 sm:inline">{duration(t.duration_sec)}</span>
                    <span className={`ml-auto font-mono ${pnlClass(t.pnl)}`}>{money(t.pnl, { sign: true })}</span>
                  </Link>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-white/45">
                <div>Best day <span className="font-mono text-emerald-300">{money(s.bestDay, { cents: false })}</span></div>
                <div>Worst day <span className="font-mono text-red-300">{money(s.worstDay, { cents: false })}</span></div>
                <div>Largest win <span className="font-mono text-white/75">{money(s.largestWin, { cents: false })}</span></div>
                <div>Largest loss <span className="font-mono text-white/75">{money(s.largestLoss, { cents: false })}</span></div>
                <div>Win streak <span className="font-mono text-white/75">{s.maxConsecWins}</span></div>
                <div>Loss streak <span className="font-mono text-white/75">{s.maxConsecLosses}</span></div>
                <div>Avg hold (win) <span className="font-mono text-white/75">{duration(s.avgHoldWinSec)}</span></div>
                <div>Avg hold (loss) <span className="font-mono text-white/75">{duration(s.avgHoldLossSec)}</span></div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </JournalShell>
  );
}
