"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";

declare global {
  interface Window {
    TradingView?: any;
  }
}

const PAIRS = [
  { label: "EUR/USD", symbol: "OANDA:EURUSD" },
  { label: "GBP/USD", symbol: "OANDA:GBPUSD" },
  { label: "XAU/USD", symbol: "OANDA:XAUUSD" },
  { label: "USD/JPY", symbol: "OANDA:USDJPY" },
  { label: "GBP/JPY", symbol: "OANDA:GBPJPY" },
  { label: "USD/CAD", symbol: "OANDA:USDCAD" },
];

export default function ChartsPage() {
  const [symbol, setSymbol] = useState(PAIRS[0].symbol);
  const hostRef = useRef<HTMLDivElement>(null);
  const containerId = useMemo(() => "tv_full_" + Math.random().toString(16).slice(2), []);

  useEffect(() => {
    if (!hostRef.current) return;

    hostRef.current.innerHTML = "";
    const mount = document.createElement("div");
    mount.id = containerId;
    mount.style.width = "100%";
    mount.style.height = "100%";
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
      if (!window.TradingView || !hostRef.current) return;

      new window.TradingView.widget({
        autosize: true,
        symbol,
        interval: "240",
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
        locale: "en",
        toolbar_bg: "#0a0a0a",
        hide_top_toolbar: false,
        hide_side_toolbar: false,
        withdateranges: true,
        allow_symbol_change: true,
        save_image: true,
        container_id: containerId,
        drawings_access: { type: "all" },
        studies_overrides: {},
        overrides: {
          "paneProperties.background": "#0a0a0a",
          "paneProperties.backgroundType": "solid",
        },
      });
    });
  }, [symbol, containerId]);

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      <Sidebar />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Pair quick-switcher */}
        <div className="flex items-center gap-1 border-b border-white/10 bg-black/40 px-4 py-2 backdrop-blur-xl shrink-0">
          <span className="mr-2 text-xs text-white/40">Quick switch</span>
          {PAIRS.map((p) => (
            <button
              key={p.symbol}
              onClick={() => setSymbol(p.symbol)}
              className={`rounded-lg px-3 py-1.5 text-xs transition ${
                symbol === p.symbol
                  ? "border border-purple-400/60 bg-purple-500/20 text-purple-100"
                  : "border border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-white/25">Use TradingView&apos;s symbol search for any instrument</span>
        </div>

        {/* Full-height chart */}
        <div className="flex-1 min-h-0" ref={hostRef} />
      </div>
    </div>
  );
}
