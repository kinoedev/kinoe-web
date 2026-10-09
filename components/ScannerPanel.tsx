"use client";

import { safeJson } from "@/lib/http";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ScannerResult } from "@/lib/futures/scanner";
import { formatPrice, getSymbol } from "@/lib/futures/symbols";

const ORDER = { IN_ZONE: 0, APPROACHING: 1, CLEAR: 2 } as const;
const STYLE = {
  IN_ZONE: "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100",
  APPROACHING: "border-yellow-400/40 bg-yellow-500/10 text-yellow-100",
  CLEAR: "border-white/10 bg-white/5 text-white/50",
} as const;
const TEXT = { IN_ZONE: "In zone", APPROACHING: "Approaching", CLEAR: "Clear" } as const;

/** Compact scanner summary for the Terminal: which contract is nearest a zone. Reads saved scans only. */
export default function ScannerPanel() {
  const [results, setResults] = useState<ScannerResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/futures/scan", { cache: "no-store" })
      .then(safeJson)
      .then((d) => {
        if (!d.ok) throw new Error(d.error ?? "Failed to load");
        setResults(
          (d.results as ScannerResult[]).sort(
            (a, b) => ORDER[a.proximity.status] - ORDER[b.proximity.status] || a.proximity.distanceAtr - b.proximity.distanceAtr
          )
        );
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  return (
    <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-zinc-950 to-black p-5 shadow-[0_0_60px_rgba(168,85,247,0.12)]">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-white/40">Zone scanner</div>
        <Link href="/scanner" className="text-[11px] text-purple-200/80 hover:text-purple-100">
          Open →
        </Link>
      </div>

      {error ? <div className="mt-4 text-xs text-red-300">{error}</div> : null}
      {!results && !error ? <div className="mt-4 h-40 animate-pulse rounded-xl bg-white/[0.03]" /> : null}
      {results && results.length === 0 ? (
        <div className="mt-4 text-xs text-white/40">No scan yet — run one from the Scanner page.</div>
      ) : null}

      <div className="mt-4 space-y-3">
        {results?.map((a) => {
          const tick = getSymbol(a.symbol)?.tick ?? 0.01;
          const p = a.proximity;
          return (
            <div key={a.symbol} className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-white">{a.symbol}</span>
                <span className="font-mono text-xs text-white/70">{formatPrice(a.lastPrice, tick)}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STYLE[p.status]}`}>{TEXT[p.status]}</span>
              </div>
              {a.breakout ? (
                <div
                  className={`mt-1.5 text-[11px] ${a.breakout.quality === "STRONG" ? "text-emerald-200" : a.breakout.quality === "TRAP" ? "text-red-200" : "text-white/60"}`}
                >
                  {a.breakout.quality === "STRONG" ? "Strong break" : a.breakout.quality === "TRAP" ? "Likely trap" : "Weak break"} {a.breakout.dir === "LONG" ? "↑" : "↓"}{" "}
                  {a.breakout.score} · {a.breakout.reasons.slice(0, 2).map((r) => r.text).join(", ")}
                </div>
              ) : null}
              {p.zone ? (
                <div className="mt-1.5 text-[11px] leading-4 text-white/50">
                  {p.status === "IN_ZONE" ? "Inside " : `${formatPrice(p.distance, tick)} pts from `}
                  {p.zone.label}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
