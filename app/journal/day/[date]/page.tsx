"use client";

import { safeJson } from "@/lib/http";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import JournalShell from "@/components/journal/JournalShell";
import { ctTime, duration, money, pnlClass } from "@/lib/journal/format";
import { summarize } from "@/lib/journal/stats";
import type { DailyNote, JournalTrade } from "@/lib/journal/store";

const MOODS = ["Focused", "Calm", "Confident", "Tired", "Anxious", "FOMO", "Revenge", "Bored"];

function shift(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + Math.sign(n));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

export default function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params);
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [note, setNote] = useState<Partial<DailyNote>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/journal/notes/${date}`, { cache: "no-store" })
      .then(safeJson)
      .then((d) => {
        if (!d.ok) throw new Error(d.error);
        setTrades(d.trades);
        setNote(d.note ?? {});
        setSaved(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [date]);

  const save = async () => {
    setError(null);
    const res = await fetch(`/api/journal/notes/${date}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note),
    });
    const d = await safeJson(res);
    if (!d.ok) return setError(d.error ?? "Save failed");
    setSaved(new Date().toLocaleTimeString());
  };

  const s = summarize(trades);
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const area = "mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-purple-400/60";

  return (
    <JournalShell>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/journal/day/${shift(date, -1)}`} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/60 hover:text-white" aria-label="Previous day">
          ‹
        </Link>
        <div className="text-sm text-white">{label}</div>
        <Link href={`/journal/day/${shift(date, 1)}`} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/60 hover:text-white" aria-label="Next day">
          ›
        </Link>
        <div className={`ml-auto font-mono text-sm ${pnlClass(s.netPnl)}`}>{trades.length ? money(s.netPnl, { sign: true }) : "No trades"}</div>
      </div>
      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <label className="block text-xs text-white/50">
            Pre-market plan — levels, bias, what you&apos;ll trade and what you won&apos;t
            <textarea rows={6} value={note.premarket_md ?? ""} onChange={(e) => setNote({ ...note, premarket_md: e.target.value })} className={area} />
          </label>
          <label className="block text-xs text-white/50">
            Post-session review — what went right, what you&apos;d change
            <textarea rows={6} value={note.review_md ?? ""} onChange={(e) => setNote({ ...note, review_md: e.target.value })} className={area} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((m) => (
              <button
                key={m}
                onClick={() => setNote({ ...note, mood: note.mood === m ? null : m })}
                className={`rounded-lg border px-2.5 py-1 text-xs ${note.mood === m ? "border-purple-400/60 bg-purple-500/20 text-purple-50" : "border-white/10 text-white/50"}`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-white/55">
            <span className="flex items-center gap-1">
              Day rating
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setNote({ ...note, rating: note.rating === n ? null : n })}
                  className={`text-base ${n <= (note.rating ?? 0) ? "text-purple-300" : "text-white/20"}`}
                  aria-label={`${n} of 5`}
                >
                  ★
                </button>
              ))}
            </span>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={note.followed_plan ?? false} onChange={(e) => setNote({ ...note, followed_plan: e.target.checked })} />
              Followed my plan
            </label>
            <button onClick={save} className="ml-auto rounded-xl border border-purple-400/50 bg-purple-500/20 px-4 py-1.5 text-sm text-purple-50">
              Save
            </button>
          </div>
          {saved ? <div className="text-[11px] text-white/35">Saved {saved}</div> : null}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Trades", String(s.trades)],
              ["Win rate", s.trades ? `${Math.round(s.winRate * 100)}%` : "—"],
              ["Fees", money(s.fees)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-white/40">{k}</div>
                <div className="font-mono text-sm text-white">{v}</div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-white/10">
            {trades.length === 0 ? <div className="px-4 py-8 text-center text-xs text-white/40">No closed trades on this trading day.</div> : null}
            <div className="divide-y divide-white/5">
              {trades.map((t) => (
                <Link key={t.id} href={`/journal/${t.id}`} className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-white/[0.03]">
                  <span className="w-20 text-white/45">{ctTime(t.entered_at, false)}</span>
                  <span className="w-10 text-white/85">{t.pair}</span>
                  <span className={`w-10 ${t.direction === "LONG" ? "text-emerald-200/70" : "text-red-200/70"}`}>{t.direction === "LONG" ? "Long" : "Short"}</span>
                  <span className="text-white/35">×{t.quantity}</span>
                  <span className="hidden text-white/35 sm:inline">{duration(t.duration_sec)}</span>
                  <span className={`ml-auto font-mono ${pnlClass(t.pnl)}`}>{money(t.pnl, { sign: true })}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="text-[10px] text-white/35">Trading day = CME session: 5:00 PM CT the evening before through 4:00 PM CT.</div>
        </div>
      </div>
    </JournalShell>
  );
}
