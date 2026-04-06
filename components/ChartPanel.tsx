"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Tf = "15" | "60" | "240" | "D";

const TF_LABELS: { label: string; value: Tf }[] = [
  { label: "15m", value: "15" },
  { label: "1H", value: "60" },
  { label: "4H", value: "240" },
  { label: "1D", value: "D" },
];

const PAIRS = [
  { label: "AUD/USD", symbol: "OANDA:AUDUSD" },
  { label: "EUR/USD", symbol: "OANDA:EURUSD" },
  { label: "GBP/USD", symbol: "OANDA:GBPUSD" },
  { label: "USD/JPY", symbol: "OANDA:USDJPY" },
];

declare global {
  interface Window {
    TradingView?: any;
  }
}

export default function ChartPanel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [symbol, setSymbol] = useState(PAIRS[0].symbol);
  const [interval, setInterval] = useState<Tf>("60");

  const containerId = useMemo(() => "tv_" + Math.random().toString(16).slice(2), []);

  useEffect(() => {
    if (!hostRef.current) return;

    hostRef.current.innerHTML = "";

    const mount = document.createElement("div");
    mount.id = containerId;
    mount.style.width = "100%";
    mount.style.height = "520px";
    hostRef.current.appendChild(mount);

    const ensureScript = () =>
      new Promise<void>((resolve) => {
        if (window.TradingView) return resolve();
        const existing = document.querySelector('script[src="https://s3.tradingview.com/tv.js"]');
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          return;
        }
        const script = document.createElement("script");
        script.src = "https://s3.tradingview.com/tv.js";
        script.async = true;
        script.onload = () => resolve();
        document.body.appendChild(script);
      });

    ensureScript().then(() => {
      if (!window.TradingView) return;

      new window.TradingView.widget({
        autosize: true,
        symbol,
        interval,
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
        container_id: containerId,
        hide_top_toolbar: false,
        hide_side_toolbar: false,
        withdateranges: true,
        allow_symbol_change: false,
      });
    });
  }, [symbol, interval, containerId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">Pair</span>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="rounded-lg border border-purple-500/30 bg-black/40 px-3 py-2 text-sm text-zinc-100 outline-none"
          >
            {PAIRS.map((p) => (
              <option key={p.symbol} value={p.symbol}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {TF_LABELS.map((t) => (
            <button
              key={t.value}
              onClick={() => setInterval(t.value)}
              className={`rounded-lg border px-3 py-2 text-xs tracking-wider ${
                interval === t.value
                  ? "border-purple-400/60 bg-purple-500/20 text-purple-100"
                  : "border-purple-500/30 bg-black/30 text-zinc-200 hover:bg-purple-500/10"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-zinc-950 to-black p-4 shadow-[0_0_60px_rgba(168,85,247,0.12)]">
        <div ref={hostRef} />
      </div>
    </div>
  );
}