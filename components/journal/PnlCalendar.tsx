"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { compactMoney } from "@/lib/journal/format";

type Day = { pnl: number; trades: number; wins: number; losses: number };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function monthKey(d: string) {
  return d.slice(0, 7);
}

/** Month grid of daily net P&L (Mon–Fri, CME trading days) with weekly totals. */
export default function PnlCalendar({ days, noteDays }: { days: Map<string, Day>; noteDays: Set<string> }) {
  const months = useMemo(() => [...new Set([...days.keys()].map(monthKey))].sort(), [days]);
  const [month, setMonth] = useState<string | null>(null);
  const current = month ?? months[months.length - 1] ?? new Date().toISOString().slice(0, 7);

  const [y, m] = current.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const maxAbs = Math.max(1, ...[...days.entries()].filter(([k]) => monthKey(k) === current).map(([, v]) => Math.abs(v.pnl)));

  // Weeks starting Monday covering the month
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const weeks: string[][] = [];
  for (const d = new Date(start); d <= last; ) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    weeks.push(week.slice(0, 5));
  }

  const step = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const monthPnl = [...days.entries()].filter(([k]) => monthKey(k) === current).reduce((s, [, v]) => s + v.pnl, 0);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => step(-1)} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/60 hover:text-white" aria-label="Previous month">
          ‹
        </button>
        <div className="text-sm text-white">{first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</div>
        <button onClick={() => step(1)} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/60 hover:text-white" aria-label="Next month">
          ›
        </button>
        <div className={`ml-auto font-mono text-sm ${monthPnl > 0 ? "text-emerald-300" : monthPnl < 0 ? "text-red-300" : "text-white/50"}`}>
          {compactMoney(monthPnl)}
        </div>
      </div>
      <div className="grid grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,0.9fr)] gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-1 text-[10px] uppercase tracking-wider text-white/35">
            {w}
          </div>
        ))}
        <div className="px-1 text-[10px] uppercase tracking-wider text-white/35">Week</div>
        {weeks.map((week) => {
          const wk = week.map((d) => days.get(d)).filter(Boolean) as Day[];
          const wkPnl = wk.reduce((s, d) => s + d.pnl, 0);
          return [
            ...week.map((d) => {
              const v = days.get(d);
              const inMonth = monthKey(d) === current;
              const alpha = v ? 0.12 + 0.38 * Math.min(1, Math.abs(v.pnl) / maxAbs) : 0;
              const bg = v ? (v.pnl > 0 ? `rgba(16,185,129,${alpha})` : v.pnl < 0 ? `rgba(239,68,68,${alpha})` : "rgba(255,255,255,0.06)") : undefined;
              return (
                <Link
                  key={d}
                  href={`/journal/day/${d}`}
                  className={`relative flex min-h-[64px] flex-col rounded-lg border p-1.5 transition hover:border-white/30 ${
                    inMonth ? "border-white/10" : "border-transparent opacity-40"
                  }`}
                  style={{ background: bg }}
                  title={v ? `${d}: ${compactMoney(v.pnl)} · ${v.trades} trades` : d}
                >
                  <span className="text-[10px] text-white/45">{Number(d.slice(8))}</span>
                  {noteDays.has(d) ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-purple-300" title="Has notes" /> : null}
                  {v ? (
                    <span className="mt-auto">
                      <span className="block font-mono text-[11px] text-white sm:text-xs">{compactMoney(v.pnl)}</span>
                      <span className="block text-[9px] text-white/55">
                        {v.trades} trade{v.trades === 1 ? "" : "s"}
                      </span>
                    </span>
                  ) : null}
                </Link>
              );
            }),
            <div key={`${week[0]}-w`} className="flex min-h-[64px] flex-col justify-end rounded-lg border border-white/5 bg-white/[0.02] p-1.5">
              {wk.length ? (
                <>
                  <span className={`font-mono text-[11px] sm:text-xs ${wkPnl > 0 ? "text-emerald-300" : wkPnl < 0 ? "text-red-300" : "text-white/50"}`}>
                    {compactMoney(wkPnl)}
                  </span>
                  <span className="text-[9px] text-white/40">{wk.length}d</span>
                </>
              ) : null}
            </div>,
          ];
        })}
      </div>
    </div>
  );
}
