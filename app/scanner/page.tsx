"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import type { ZoneAnalysis, Zone } from "@/lib/indicators/zones";
import { formatPrice, getSymbol } from "@/lib/futures/symbols";

type LoadResponse = {
  ok: boolean;
  results?: ZoneAnalysis[];
  savedAt?: string | null;
  spend?: { total: number; last30d: number; pulls: number };
  limit?: number;
  error?: string;
};

type ScanResponse =
  | {
      ok: true;
      scannedAt: string;
      dataThrough: string;
      results: ZoneAnalysis[];
      errors: { symbol: string; error: string }[];
      spend: { thisScan: number; rowsDownloaded: number; total: number; last30d: number };
    }
  | { ok: false; needsConfirm?: true; estimate?: number; limit?: number; message?: string; error?: string };

const STATUS_ORDER = { IN_ZONE: 0, APPROACHING: 1, CLEAR: 2 } as const;

const STATUS_STYLE: Record<ZoneAnalysis["proximity"]["status"], string> = {
  IN_ZONE: "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-100",
  APPROACHING: "border-yellow-400/40 bg-yellow-500/10 text-yellow-100",
  CLEAR: "border-white/10 bg-white/5 text-white/50",
};

const STATUS_TEXT: Record<ZoneAnalysis["proximity"]["status"], string> = {
  IN_ZONE: "In zone",
  APPROACHING: "Approaching",
  CLEAR: "Clear",
};

function ct(ms: number | string) {
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }) + " CT";
}

function money(n: number) {
  return `$${n.toFixed(n < 1 ? 3 : 2)}`;
}

/** Vertical price ladder: zones as bands, last price as a line. */
function Ladder({ a }: { a: ZoneAnalysis }) {
  const tick = getSymbol(a.symbol)?.tick ?? 0.01;
  const prices = [...a.zones.flatMap((z) => [z.top, z.bottom]), a.lastPrice];
  const hi = Math.max(...prices);
  const lo = Math.min(...prices);
  const pad = (hi - lo) * 0.08 || tick * 10;
  const top = hi + pad;
  const span = top - (lo - pad);
  const y = (p: number) => ((top - p) / span) * 100;

  return (
    <div className="relative h-56 w-full overflow-hidden rounded-xl border border-white/10 bg-black/40">
      {a.zones.map((z) => (
        <div
          key={`${z.bottom}-${z.top}`}
          className={`absolute left-0 right-0 border-y ${
            z.side === "resistance" ? "border-red-400/40 bg-red-500/10" : "border-emerald-400/40 bg-emerald-500/10"
          }`}
          style={{ top: `${y(z.top)}%`, height: `${Math.max(1.2, y(z.bottom) - y(z.top))}%` }}
        >
          <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] text-white/50">
            {formatPrice(z.price, tick)}
          </span>
        </div>
      ))}
      <div className="absolute left-0 right-0 border-t border-dashed border-white/70" style={{ top: `${y(a.lastPrice)}%` }}>
        <span className="absolute left-2 -translate-y-1/2 rounded bg-white px-1 font-mono text-[9px] font-medium text-black">
          {formatPrice(a.lastPrice, tick)}
        </span>
      </div>
    </div>
  );
}

function ZoneRow({ z, tick }: { z: Zone; tick: number }) {
  const res = z.side === "resistance";
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        res ? "border-red-500/20 bg-red-500/[0.06]" : "border-emerald-500/20 bg-emerald-500/[0.06]"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-mono text-xs ${res ? "text-red-200" : "text-emerald-200"}`}>
          {formatPrice(z.top, tick)} – {formatPrice(z.bottom, tick)}
        </span>
        <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-white/35">
          {z.testingNow ? <span className="text-fuchsia-300">testing now</span> : null}
          {res ? "Resistance" : "Support"} · {z.score}
        </span>
      </div>
      <div className="mt-1 text-[11px] leading-4 text-white/60">{z.label}</div>
    </div>
  );
}

function SymbolCard({ a }: { a: ZoneAnalysis }) {
  const sym = getSymbol(a.symbol);
  const tick = sym?.tick ?? 0.01;
  const [showSet, setShowSet] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyText = useMemo(
    () =>
      a.zones
        .map((z) => `${formatPrice(z.top, tick)}–${formatPrice(z.bottom, tick)}  ${z.side === "resistance" ? "R" : "S"}  ${z.label}`)
        .join("\n"),
    [a.zones, tick]
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${a.symbol} zones (week ${a.weekStart} → ${a.weekEnd})\n${copyText}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const p = a.proximity;
  const pts = formatPrice(p.distance, tick);

  return (
    <div className="rounded-2xl border border-purple-500/25 bg-gradient-to-br from-zinc-950 to-black p-5 shadow-[0_0_60px_rgba(168,85,247,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold tracking-wide text-white">{a.symbol}</div>
          <div className="text-[11px] text-white/40">{sym?.name}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-lg text-white">{formatPrice(a.lastPrice, tick)}</div>
          <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] ${STATUS_STYLE[p.status]}`}>
            {STATUS_TEXT[p.status]}
          </span>
        </div>
      </div>

      {p.zone ? (
        <div className="mt-3 text-xs text-white/60">
          {p.status === "IN_ZONE" ? "Inside " : `${pts} pts from `}
          <span className="text-white/85">{p.zone.label}</span>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Ladder a={a} />
        <div className="space-y-2">
          {a.zones.map((z) => (
            <ZoneRow key={`${z.bottom}-${z.top}`} z={z} tick={tick} />
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-white/35">
        <span>Week {a.weekStart} → {a.weekEnd}</span>
        <span>· ATR 1h {formatPrice(a.atrHour, tick)}</span>
        {a.profile ? (
          <span>
            · POC {formatPrice(a.profile.poc, tick)} · VA {formatPrice(a.profile.val, tick)}–{formatPrice(a.profile.vah, tick)}
          </span>
        ) : null}
        {!a.nested ? <span className="text-red-300">· swings not outside range — check</span> : null}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setShowSet((v) => !v)}
            className="rounded-lg border border-white/10 px-2.5 py-1 text-white/60 transition hover:bg-white/5 hover:text-white"
          >
            {showSet ? "Hide weekly set" : "Full weekly set"}
          </button>
          <button
            onClick={copy}
            className="rounded-lg border border-purple-400/30 bg-purple-500/10 px-2.5 py-1 text-purple-100 transition hover:bg-purple-500/20"
          >
            {copied ? "Copied" : "Copy zones"}
          </button>
          {sym ? (
            <a
              href={`/charts?symbol=${encodeURIComponent(sym.tradingView)}`}
              className="rounded-lg border border-white/10 px-2.5 py-1 text-white/60 transition hover:bg-white/5 hover:text-white"
            >
              Chart
            </a>
          ) : null}
        </div>
      </div>

      {showSet ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-white/5 text-[9px] uppercase tracking-wider text-white/40">
              <tr>
                <th className="px-3 py-2">Level</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Tests</th>
                <th className="px-3 py-2 text-right">Breaks</th>
                <th className="px-3 py-2">Volume</th>
              </tr>
            </thead>
            <tbody>
              {a.weekSet.map((l) => (
                <tr key={`${l.kind}-${l.price}`} className="border-t border-white/5 text-white/70">
                  <td className="px-3 py-1.5">{l.name}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatPrice(l.price, tick)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{l.tests}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{l.breaks}</td>
                  <td className="px-3 py-1.5 text-white/40">{l.lowVolume ? "low-volume" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {a.notes.length ? (
            <div className="border-t border-white/5 px-3 py-2 text-[10px] text-white/40">{a.notes.join(" ")}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function ScannerPage() {
  const [results, setResults] = useState<ZoneAnalysis[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [spend, setSpend] = useState<{ total: number; last30d: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ symbol: string; error: string }[]>([]);
  const [confirm, setConfirm] = useState<{ estimate: number; message: string } | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/futures/scan", { cache: "no-store" });
      const data = (await res.json()) as LoadResponse;
      if (!data.ok) throw new Error(data.error ?? "Failed to load");
      setResults(data.results ?? []);
      setSavedAt(data.savedAt ?? null);
      if (data.spend) setSpend(data.spend);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const scan = async (confirmSpend = false) => {
    setScanning(true);
    setError(null);
    setConfirm(null);
    try {
      const res = await fetch("/api/futures/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirmSpend }),
      });
      const data = (await res.json()) as ScanResponse;
      if (!data.ok) {
        if (data.needsConfirm && data.estimate !== undefined) {
          setConfirm({ estimate: data.estimate, message: data.message ?? "" });
          return;
        }
        throw new Error(data.error ?? "Scan failed");
      }
      setResults(data.results);
      setErrors(data.errors);
      setSavedAt(data.scannedAt);
      setSpend({ total: data.spend.total, last30d: data.spend.last30d });
      setLastScan(
        `Data through ${ct(data.dataThrough)} · ${data.spend.rowsDownloaded.toLocaleString()} new bars · ${money(data.spend.thisScan)} credit`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const sorted = useMemo(
    () =>
      [...results].sort(
        (a, b) =>
          STATUS_ORDER[a.proximity.status] - STATUS_ORDER[b.proximity.status] ||
          a.proximity.distanceAtr - b.proximity.distanceAtr
      ),
    [results]
  );

  const dataThrough = results.length ? Math.max(...results.map((r) => r.asOf)) : null;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-56 -left-56 h-[700px] w-[700px] rounded-full bg-purple-600/15 blur-3xl" />
        <div className="absolute -bottom-56 -right-56 h-[700px] w-[700px] rounded-full bg-fuchsia-600/15 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <Topbar />
          <div className="mx-auto max-w-7xl space-y-5 p-4 pb-24 md:p-6 md:pb-8">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm text-white/85">Key-level zones · MNQ · MES · MGC · MCL</div>
                <div className="mt-0.5 text-[11px] text-white/40">
                  {dataThrough ? `Data through ${ct(dataThrough)}` : "No scan yet"}
                  {savedAt ? ` · scanned ${ct(savedAt)}` : ""}
                  {spend ? ` · Databento credit used ${money(spend.total)}` : ""}
                </div>
                {lastScan ? <div className="mt-0.5 text-[11px] text-purple-200/70">{lastScan}</div> : null}
              </div>
              <button
                onClick={() => scan(false)}
                disabled={scanning}
                className="ml-auto rounded-xl border border-purple-400/50 bg-purple-500/20 px-4 py-2 text-sm text-purple-50 transition hover:bg-purple-500/30 disabled:opacity-50"
              >
                {scanning ? "Scanning…" : "Run scan"}
              </button>
            </div>

            {confirm ? (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-yellow-400/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-50">
                <span>{confirm.message}</span>
                <div className="ml-auto flex gap-2">
                  <button onClick={() => setConfirm(null)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70">
                    Cancel
                  </button>
                  <button
                    onClick={() => scan(true)}
                    className="rounded-lg border border-yellow-300/50 bg-yellow-400/20 px-3 py-1.5 text-xs text-yellow-50"
                  >
                    Spend {money(confirm.estimate)}
                  </button>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
            ) : null}
            {errors.map((e) => (
              <div key={e.symbol} className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2 text-xs text-red-200/80">
                {e.symbol}: {e.error}
              </div>
            ))}

            {loading ? (
              <div className="grid gap-5 xl:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-80 animate-pulse rounded-2xl border border-white/5 bg-white/[0.02]" />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-16 text-center text-sm text-white/50">
                Run the first scan to download history from Databento and build your zones.
                <div className="mt-1 text-xs text-white/30">
                  The first pull fetches ~5 months of hourly and ~10 days of 1-minute bars; later scans only fetch what&apos;s new.
                </div>
              </div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-2">
                {sorted.map((a) => (
                  <SymbolCard key={a.symbol} a={a} />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
