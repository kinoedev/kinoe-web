"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import type { PriceData } from "@/app/api/market/prices/route";

// ─── Session config ────────────────────────────────────────────────────────────

type SessionKey = "sydney" | "tokyo" | "london" | "newyork";

const SESSIONS: Record<SessionKey, {
  label: string; flag: string;
  utcStart: number; utcEnd: number;
  color: string; bg: string; border: string; bar: string;
}> = {
  sydney:  { label: "Sydney",   flag: "🇦🇺", utcStart: 21, utcEnd: 6,  color: "text-purple-300", bg: "bg-purple-500/20",  border: "border-purple-500/30", bar: "bg-purple-500/40" },
  tokyo:   { label: "Tokyo",    flag: "🇯🇵", utcStart: 0,  utcEnd: 9,  color: "text-blue-300",   bg: "bg-blue-500/20",    border: "border-blue-500/30",   bar: "bg-blue-500/40"   },
  london:  { label: "London",   flag: "🇬🇧", utcStart: 8,  utcEnd: 17, color: "text-emerald-300",bg: "bg-emerald-500/20", border: "border-emerald-500/30",bar: "bg-emerald-500/40"},
  newyork: { label: "New York", flag: "🇺🇸", utcStart: 13, utcEnd: 22, color: "text-yellow-300", bg: "bg-yellow-500/20",  border: "border-yellow-500/30", bar: "bg-yellow-500/40" },
};

function isOpen(s: typeof SESSIONS[SessionKey], h: number) {
  if (s.utcStart < s.utcEnd) return h >= s.utcStart && h < s.utcEnd;
  return h >= s.utcStart || h < s.utcEnd;
}

function minsUntil(s: typeof SESSIONS[SessionKey], h: number, m: number): number {
  const target = isOpen(s, h) ? s.utcEnd : s.utcStart;
  let diff = (target - h) * 60 - m;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function fmtMins(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Session Timeline ─────────────────────────────────────────────────────────

function SessionTimeline({ utcH, utcM }: { utcH: number; utcM: number }) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const nowPct = ((utcH * 60 + utcM) / (24 * 60)) * 100;

  const sessionRows: { key: SessionKey; startPct: number; widthPct: number }[] = [
    { key: "sydney",  startPct: (21 / 24) * 100, widthPct: (9 / 24) * 100 },
    { key: "tokyo",   startPct: 0,                widthPct: (9 / 24) * 100 },
    { key: "london",  startPct: (8 / 24) * 100,   widthPct: (9 / 24) * 100 },
    { key: "newyork", startPct: (13 / 24) * 100,  widthPct: (9 / 24) * 100 },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-white/30">24h Session Timeline</div>
        <div className="font-mono text-xs text-white/50">
          {String(utcH).padStart(2, "0")}:{String(utcM).padStart(2, "0")} UTC
        </div>
      </div>

      <div className="relative">
        {/* Hour grid */}
        <div className="flex mb-1">
          {hours.map((h) => (
            <div key={h} className="flex-1 text-center text-[8px] text-white/15 font-mono">
              {h % 6 === 0 ? String(h).padStart(2, "0") : ""}
            </div>
          ))}
        </div>

        {/* Session bars */}
        <div className="relative h-32 rounded-xl overflow-hidden bg-white/[0.02] border border-white/5">
          {sessionRows.map(({ key, startPct, widthPct }) => {
            const s = SESSIONS[key];
            const active = isOpen(s, utcH);
            return (
              <div
                key={key}
                className="absolute flex items-center"
                style={{
                  top: `${(["sydney","tokyo","london","newyork"].indexOf(key)) * 25}%`,
                  left: `${startPct}%`,
                  width: `${widthPct}%`,
                  height: "25%",
                  paddingTop: "2px",
                  paddingBottom: "2px",
                }}
              >
                <div className={[
                  "h-full w-full rounded flex items-center px-2 text-[9px] font-medium transition-all",
                  s.bar,
                  active ? "opacity-100" : "opacity-40",
                ].join(" ")}>
                  <span className={`${s.color} truncate`}>{s.flag} {s.label}</span>
                  {active && (
                    <span className={`ml-1 text-[8px] ${s.color} opacity-70`}>OPEN</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* "Now" cursor */}
          <div
            className="absolute top-0 bottom-0 w-px bg-white/60 z-10"
            style={{ left: `${nowPct}%` }}
          >
            <div className="absolute -top-1 -translate-x-1/2 w-2 h-2 rounded-full bg-white" />
            <div className="absolute top-full mt-0.5 -translate-x-1/2 text-[8px] text-white/60 font-mono whitespace-nowrap">NOW</div>
          </div>
        </div>

        {/* Overlap label */}
        <div className="mt-2 text-[10px] text-white/30 text-center">
          Highest volatility: London/NY overlap 13:00–17:00 UTC
        </div>
      </div>
    </div>
  );
}

// ─── Session Clocks ───────────────────────────────────────────────────────────

function SessionClock({ sessionKey, utcH, utcM }: { sessionKey: SessionKey; utcH: number; utcM: number }) {
  const s = SESSIONS[sessionKey];
  const active = isOpen(s, utcH);
  const remaining = minsUntil(s, utcH, utcM);
  const totalDuration = 9 * 60;
  const elapsed = active ? totalDuration - remaining : 0;
  const pct = active ? Math.round((elapsed / totalDuration) * 100) : 0;

  const radius = 28;
  const circ = 2 * Math.PI * radius;
  const stroke = circ - (pct / 100) * circ;

  return (
    <div className={[
      "rounded-2xl border p-5 flex flex-col items-center gap-3 transition-all",
      active ? `${s.border} ${s.bg}` : "border-white/5 bg-white/[0.01]",
    ].join(" ")}>
      <div className="text-xl">{s.flag}</div>

      {/* Ring */}
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={radius} fill="none" stroke="white" strokeOpacity="0.07" strokeWidth="4" />
          {active && (
            <circle
              cx="32" cy="32" r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray={circ}
              strokeDashoffset={stroke}
              strokeLinecap="round"
              className={s.color}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-[10px] font-bold ${active ? s.color : "text-white/20"}`}>
            {active ? `${pct}%` : "–"}
          </span>
        </div>
      </div>

      <div>
        <div className={`text-xs font-semibold text-center ${active ? "text-white/90" : "text-white/30"}`}>{s.label}</div>
        <div className={`text-[10px] text-center mt-0.5 ${active ? s.color : "text-white/20"}`}>
          {active ? "OPEN" : "CLOSED"}
        </div>
        <div className="text-[9px] text-center text-white/25 mt-0.5">
          {active ? `closes ${fmtMins(remaining)}` : `opens ${fmtMins(remaining)}`}
        </div>
      </div>
    </div>
  );
}

// ─── TradingView embed ────────────────────────────────────────────────────────

function TVWidget({ type }: { type: "calendar" | "news" }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    const s = document.createElement("script");
    s.type = "text/javascript";
    s.async = true;

    if (type === "calendar") {
      s.src = "https://s3.tradingview.com/external-embedding/embed-widget-economic-calendar.js";
      s.innerHTML = JSON.stringify({
        colorTheme: "dark",
        isTransparent: true,
        width: "100%",
        height: "500",
        locale: "en",
        importanceFilter: "0,1",
        currencyFilter: "USD,EUR,GBP,JPY,AUD,NZD,CAD,CHF",
      });
    } else {
      s.src = "https://s3.tradingview.com/external-embedding/embed-widget-timeline.js";
      s.innerHTML = JSON.stringify({
        feedMode: "market",
        market: "forex",
        colorTheme: "dark",
        isTransparent: true,
        displayMode: "regular",
        width: "100%",
        height: "500",
        locale: "en",
      });
    }

    const container = document.createElement("div");
    container.className = "tradingview-widget-container__widget";
    ref.current.appendChild(container);
    ref.current.appendChild(s);
  }, [type]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <div className="mb-4 text-xs uppercase tracking-widest text-white/30">
        {type === "calendar" ? "Economic Calendar" : "Market News"}
      </div>
      <div className="tradingview-widget-container" ref={ref} />
    </div>
  );
}

// ─── Live prices ──────────────────────────────────────────────────────────────

const WATCHLIST = [
  "EUR_USD","GBP_USD","USD_JPY","XAU_USD","GBP_JPY",
  "AUD_USD","USD_CAD","USD_CHF","NZD_USD","XAG_USD",
];

function PriceCard({ price }: { price: PriceData }) {
  const mid = (price.bid + price.ask) / 2;
  const dp = price.instrument.includes("JPY") ? 3
    : price.instrument.includes("XAU") || price.instrument.includes("XAG") ? 2
    : price.instrument.includes("SPX") || price.instrument.includes("NAS") || price.instrument.includes("US30") || price.instrument.includes("UK100") || price.instrument.includes("DE30") ? 1
    : 5;

  return (
    <div className={[
      "rounded-2xl border p-4 transition",
      price.tradeable
        ? "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
        : "border-white/5 bg-white/[0.01] opacity-40",
    ].join(" ")}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs font-semibold text-white/90">
            {price.instrument.replace("_", "/")}
          </div>
          {!price.tradeable && (
            <div className="text-[9px] text-white/30 mt-0.5">Market closed</div>
          )}
        </div>
        <div className={`text-[9px] rounded border px-1.5 py-0.5 ${
          price.spreadPips < 1 ? "border-emerald-500/30 text-emerald-400/70"
          : price.spreadPips < 3 ? "border-yellow-500/30 text-yellow-400/70"
          : "border-red-500/30 text-red-400/70"
        }`}>
          {price.spreadPips}p
        </div>
      </div>
      <div className="font-mono text-base text-white/90 tracking-tight">
        {mid.toFixed(dp)}
      </div>
      <div className="mt-1 flex gap-2 text-[9px] text-white/30">
        <span>B {price.bid.toFixed(dp)}</span>
        <span>A {price.ask.toFixed(dp)}</span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MarketPage() {
  const [now, setNow] = useState(new Date());
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [pricesAt, setPricesAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch(`/api/market/prices?instruments=${WATCHLIST.join(",")}`, { cache: "no-store" });
      const data = await res.json();
      if (data.ok) { setPrices(data.prices); setPricesAt(data.fetched_at); }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    const clock = setInterval(() => setNow(new Date()), 60000);
    const priceTimer = setInterval(fetchPrices, 30000);
    return () => { clearInterval(clock); clearInterval(priceTimer); };
  }, [fetchPrices]);

  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const openSessions = (Object.entries(SESSIONS) as [SessionKey, typeof SESSIONS[SessionKey]][])
    .filter(([, s]) => isOpen(s, utcH));

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl space-y-6">

            {/* Status bar */}
            <div className="flex items-center gap-3 flex-wrap">
              {openSessions.length === 0 ? (
                <span className="text-xs text-white/30">No major session active</span>
              ) : (
                openSessions.map(([key, s]) => (
                  <span key={key} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${s.border} ${s.color}`}>
                    <span className="relative flex h-1.5 w-1.5">
                      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${s.bar}`} />
                      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${s.bar}`} />
                    </span>
                    {s.flag} {s.label} Open
                  </span>
                ))
              )}
              <span className="ml-auto font-mono text-[10px] text-white/25">
                {pricesAt ? `Prices updated ${new Date(pricesAt).toLocaleTimeString()}` : "Loading prices..."}
              </span>
              <button
                onClick={fetchPrices}
                className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-white/40 hover:text-white/70 transition"
              >
                Refresh
              </button>
            </div>

            {/* Session Timeline */}
            <SessionTimeline utcH={utcH} utcM={utcM} />

            {/* Session Clocks */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {(Object.keys(SESSIONS) as SessionKey[]).map((k) => (
                <SessionClock key={k} sessionKey={k} utcH={utcH} utcM={utcM} />
              ))}
            </div>

            {/* Live Prices */}
            <div>
              <div className="mb-3 text-xs uppercase tracking-widest text-white/30">Live Prices</div>
              {loading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-white/5 bg-white/[0.02] h-24 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {prices.map((p) => <PriceCard key={p.instrument} price={p} />)}
                  {prices.length === 0 && (
                    <div className="col-span-5 text-xs text-white/30 text-center py-8">
                      OANDA prices unavailable — check connection in Settings
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Calendar + News side by side */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <TVWidget type="calendar" />
              <TVWidget type="news" />
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
