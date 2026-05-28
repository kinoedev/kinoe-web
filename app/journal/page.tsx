"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import type { JournalEntry } from "@/lib/db/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function outcomeStyle(outcome: string | null) {
  switch (outcome) {
    case "WIN":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "LOSS":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    case "BE":
      return "border-white/20 bg-white/5 text-white/70";
    case "OPEN":
      return "border-purple-500/30 bg-purple-500/10 text-purple-200";
    case "CANCELLED":
      return "border-white/10 bg-white/5 text-white/40";
    default:
      return "border-white/10 bg-white/5 text-white/50";
  }
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/journal", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load");
        setEntries(data.entries);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  const stats = (() => {
    if (!entries || entries.length === 0) return null;
    const resolved = entries.filter((e) => e.outcome === "WIN" || e.outcome === "LOSS");
    const wins = resolved.filter((e) => e.outcome === "WIN").length;
    const losses = resolved.filter((e) => e.outcome === "LOSS").length;
    const winRate = resolved.length > 0 ? (wins / resolved.length) * 100 : 0;
    const totalR = resolved.reduce((acc, e) => acc + (e.r_multiple ?? 0), 0);
    return { total: entries.length, wins, losses, winRate, totalR };
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

          <div className="p-4 pb-24 md:p-6 md:pb-8">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-white/80">Journal</div>
                <div className="mt-1 text-xs text-white/40">
                  Every trade logged. The data trains your agent.
                </div>
              </div>
              <Link
                href="/journal/new"
                className="rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm text-purple-100 transition hover:bg-purple-500/20"
              >
                New entry
              </Link>
            </div>

            {stats ? (
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <StatCard label="Total entries" value={String(stats.total)} />
                <StatCard label="Wins" value={String(stats.wins)} />
                <StatCard label="Losses" value={String(stats.losses)} />
                <StatCard
                  label="Win rate / total R"
                  value={`${stats.winRate.toFixed(1)}% · ${stats.totalR.toFixed(2)}R`}
                />
              </div>
            ) : null}

            {error ? (
              <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">
                {error}
              </div>
            ) : null}

            <div className="mt-6 space-y-2">
              {entries === null && !error ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-xs text-white/50">
                  Loading entries...
                </div>
              ) : entries && entries.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-xs text-white/50">
                  No entries yet. Click <span className="text-purple-200">New entry</span> to log your first trade.
                </div>
              ) : (
                entries?.map((entry) => (
                  <Link
                    key={entry.id}
                    href={`/journal/${entry.id}`}
                    className="block rounded-xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-medium text-white">
                          {entry.pair} · {entry.timeframe}
                        </div>
                        <div
                          className={`rounded-full border px-2 py-0.5 text-[10px] ${
                            entry.direction === "LONG"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                              : "border-red-500/30 bg-red-500/10 text-red-200"
                          }`}
                        >
                          {entry.direction}
                        </div>
                        {entry.setup_type ? (
                          <div className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] text-purple-200">
                            {entry.setup_type}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-white/40">
                        <div
                          className={`rounded-full border px-2 py-0.5 text-[10px] ${outcomeStyle(entry.outcome)}`}
                        >
                          {entry.outcome ?? "OPEN"}
                          {entry.r_multiple !== null
                            ? ` · ${entry.r_multiple > 0 ? "+" : ""}${entry.r_multiple}R`
                            : ""}
                        </div>
                        <div>{formatDate(entry.created_at)}</div>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-white/50">{label}</div>
      <div className="mt-1 text-lg font-medium text-white">{value}</div>
    </div>
  );
}
