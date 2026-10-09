"use client";

import type { TradingAccount } from "@/lib/journal/store";
import { RANGES, type RangeKey } from "./useJournal";

export default function Filters({
  accounts,
  account,
  setAccount,
  range,
  setRange,
}: {
  accounts: TradingAccount[];
  account: string;
  setAccount: (a: string) => void;
  range: RangeKey;
  setRange: (r: RangeKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={account}
        onChange={(e) => setAccount(e.target.value)}
        className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white outline-none focus:border-purple-400/60"
        aria-label="Account"
      >
        <option value="">All accounts</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
              range === r.key ? "border-purple-400/60 bg-purple-500/20 text-purple-50" : "border-white/10 text-white/50 hover:text-white/80"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}
