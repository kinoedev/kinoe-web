"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

type MarketSnapshot = {
  marketStatus: string;
  bid: number | null;
  offer: number | null;
  high: number | null;
  low: number | null;
  percentageChange: number | null;
  netChange: number | null;
  updateTime: string | null;
};

type Instrument = {
  name: string;
  epic: string;
  expiry: string;
};

type MarketDetail = {
  instrument: Instrument;
  snapshot: MarketSnapshot;
};

type IGPricesResponse = {
  ok: boolean;
  markets?: MarketDetail[];
  error?: string;
};

function MarketCard({ detail }: { detail: MarketDetail }) {
  const { instrument, snapshot } = detail;
  const isUp = (snapshot.percentageChange ?? 0) >= 0;
  const isTradeable = snapshot.marketStatus === "TRADEABLE";

  const bid = snapshot.bid?.toFixed(5) ?? "—";
  const ask = snapshot.offer?.toFixed(5) ?? "—";
  const spread =
    snapshot.bid != null && snapshot.offer != null
      ? ((snapshot.offer - snapshot.bid) * 10000).toFixed(1)
      : "—";
  const changeColor = isUp ? "text-emerald-400" : "text-red-400";
  const changeBg = isUp ? "bg-emerald-400/10" : "bg-red-400/10";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-xl transition hover:border-purple-400/30 hover:shadow-[0_0_30px_rgba(168,85,247,0.08)]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{instrument.name}</div>
          <div className="mt-0.5 text-[10px] text-white/35 font-mono">{instrument.epic}</div>
        </div>
        <span
          className={[
            "rounded-full px-2 py-0.5 text-[10px] font-medium",
            isTradeable ? "bg-emerald-400/15 text-emerald-400" : "bg-white/10 text-white/40",
          ].join(" ")}
        >
          {isTradeable ? "LIVE" : snapshot.marketStatus}
        </span>
      </div>

      {/* Bid / Ask */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-black/30 px-3 py-2.5">
          <div className="text-[10px] text-white/40 mb-1">BID</div>
          <div className="font-mono text-base text-white">{bid}</div>
        </div>
        <div className="rounded-xl bg-black/30 px-3 py-2.5">
          <div className="text-[10px] text-white/40 mb-1">ASK</div>
          <div className="font-mono text-base text-white">{ask}</div>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="text-white/40">
          Spread <span className="font-mono text-white/60">{spread} pts</span>
        </div>
        <div
          className={[
            "rounded-full px-2 py-0.5 font-mono font-medium",
            changeBg,
            changeColor,
          ].join(" ")}
        >
          {(snapshot.percentageChange ?? 0) >= 0 ? "+" : ""}
          {snapshot.percentageChange?.toFixed(2) ?? "0.00"}%
        </div>
      </div>

      {/* High / Low */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/40">
        <div>
          H <span className="font-mono text-white/60">{snapshot.high?.toFixed(5) ?? "—"}</span>
        </div>
        <div>
          L <span className="font-mono text-white/60">{snapshot.low?.toFixed(5) ?? "—"}</span>
        </div>
      </div>

      {snapshot.updateTime && (
        <div className="mt-3 text-[10px] text-white/25">Updated {snapshot.updateTime}</div>
      )}
    </div>
  );
}

export default function IGMarketsPage() {
  const [markets, setMarkets] = useState<MarketDetail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchPrices = async () => {
      try {
        const res = await fetch("/api/ig/prices", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const data: IGPricesResponse = await res.json();

        if (cancelled) return;

        if (data.ok && data.markets) {
          setMarkets(data.markets);
          setError(null);
        } else {
          setError(data.error ?? "Failed to fetch IG data");
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Network error");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLastUpdated(Date.now());
        }
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Purple glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-56 -left-56 h-[700px] w-[700px] rounded-full bg-purple-600/20 blur-3xl" />
        <div className="absolute -bottom-56 -right-56 h-[700px] w-[700px] rounded-full bg-fuchsia-600/20 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen">
        <Sidebar />

        <main className="flex-1">
          <Topbar agentOnline={false} />

          <div className="p-6">
            {/* Page header */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-semibold text-white">IG Markets</h1>
                <p className="mt-0.5 text-sm text-white/40">Live forex prices via IG REST API</p>
              </div>

              <div className="flex items-center gap-2 text-xs text-white/40">
                <span
                  className={[
                    "h-2 w-2 rounded-full",
                    !error && !loading ? "bg-emerald-400 animate-pulse" : "bg-white/20",
                  ].join(" ")}
                />
                {loading
                  ? "Connecting..."
                  : error
                  ? "Connection error"
                  : `Live · updated ${lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "—"}`}
              </div>
            </div>

            {/* Error state */}
            {error && (
              <div className="mb-6 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                <span className="font-medium">Error:</span> {error}
                {error.includes("IG_") && (
                  <p className="mt-1 text-xs text-red-300/60">
                    Add IG_API_KEY, IG_IDENTIFIER, IG_PASSWORD (and optionally IG_DEMO=true) to{" "}
                    <code className="font-mono">.env.local</code>
                  </p>
                )}
              </div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-44 animate-pulse rounded-2xl border border-white/10 bg-white/5"
                  />
                ))}
              </div>
            )}

            {/* Market cards */}
            {!loading && markets.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {markets.map((m) => (
                  <MarketCard key={m.instrument.epic} detail={m} />
                ))}
              </div>
            )}

            {/* Empty — no markets returned */}
            {!loading && !error && markets.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-white/30">
                <div className="text-4xl mb-3">—</div>
                <div className="text-sm">No market data returned</div>
                <div className="mt-1 text-xs">Check your IG epics or account permissions</div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
