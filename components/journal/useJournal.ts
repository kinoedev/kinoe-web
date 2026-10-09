"use client";

import { useCallback, useEffect, useState } from "react";
import type { JournalTrade, Playbook, TradingAccount } from "@/lib/journal/store";

export type RangeKey = "week" | "month" | "30d" | "90d" | "ytd" | "all";

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All" },
];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function rangeDates(key: RangeKey): { from: string | null; to: string | null } {
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const back = (days: number) => iso(new Date(today.getTime() - days * 86_400_000));
  switch (key) {
    case "week": {
      const dow = (today.getUTCDay() + 6) % 7;
      return { from: back(dow), to: null };
    }
    case "month":
      return { from: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), to: null };
    case "30d":
      return { from: back(30), to: null };
    case "90d":
      return { from: back(90), to: null };
    case "ytd":
      return { from: `${today.getUTCFullYear()}-01-01`, to: null };
    default:
      return { from: null, to: null };
  }
}

const STORE_KEY = "kinoe.journal.filters";

function loadFilters(): { account: string; range: RangeKey } {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { account: "", range: "all", ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { account: "", range: "all" };
}

export type JournalData = {
  trades: JournalTrade[];
  accounts: TradingAccount[];
  playbooks: Playbook[];
  notes: { trading_day: string; rating: number | null }[];
};

/** Shared filters (account + date range, remembered per browser) and the trades they select. */
export function useJournal() {
  const [account, setAccount] = useState("");
  const [range, setRange] = useState<RangeKey>("all");
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<JournalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const f = loadFilters();
    setAccount(f.account);
    setRange(f.range);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ account, range }));
    } catch {
      /* storage unavailable */
    }
  }, [account, range, ready]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = rangeDates(range);
      const q = new URLSearchParams();
      if (account) q.set("account", account);
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      const res = await fetch(`/api/journal/trades?${q}`, { cache: "no-store" });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error ?? "Failed to load");
      setData({ trades: d.trades, accounts: d.accounts, playbooks: d.playbooks, notes: d.notes });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [account, range]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  return { account, setAccount, range, setRange, data, loading, error, reload };
}
