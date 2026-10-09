"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type FuturesStatus = {
  ok?: boolean;
  configured?: boolean;
  dataThrough?: string | null;
  scannedAt?: string | null;
  spend?: { total: number };
  error?: string;
};

export default function Sidebar() {
  const pathname = usePathname();
  const [status, setStatus] = useState<FuturesStatus | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/futures/status", { cache: "no-store", headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d: FuturesStatus) => alive && setStatus(d))
      .catch((e: unknown) => alive && setStatus({ ok: false, error: e instanceof Error ? e.message : "fetch failed" }));
    return () => {
      alive = false;
    };
  }, []);

  const ready = status?.ok === true && status.configured === true;
  const fmtCt = (v: string) =>
    new Date(v).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "numeric", minute: "2-digit" }) + " CT";

  const navItems = [
    { label: "Terminal", href: "/terminal" },
    { label: "My Strategy", href: "/strategy" },
    { label: "Charts", href: "/charts" },
    { label: "Scanner", href: "/scanner" },
    { label: "Backtest", href: "/backtest" },
    { label: "Breakout Lab", href: "/breakouts" },
    { label: "Journal", href: "/journal" },
    { label: "Market", href: "/market" },
    { label: "Settings", href: "/settings" },
  ];

  return (
    <aside className="hidden md:flex flex-col w-72 shrink-0 border-r border-white/10 bg-black/20 backdrop-blur-xl">
      <div className="px-6 py-6">
        <div className="text-xs tracking-[0.5em] text-white/80">K I N O E</div>
        <div className="mt-1 text-xs text-white/40">Trade with Intention</div>
      </div>

      <nav className="px-3">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "block rounded-xl px-3 py-2 text-sm transition",
                active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 px-4 pb-6">
        <div className="rounded-2xl border border-purple-400/20 bg-purple-500/10 p-4 shadow-[0_0_60px_rgba(168,85,247,0.10)]">
          <div className="text-xs text-white/60">Status</div>

          <div className="mt-2 flex items-center gap-2">
            <span className={["inline-block h-2.5 w-2.5 rounded-full", ready ? "bg-emerald-400" : "bg-white/25"].join(" ")} />
            <div className="text-sm font-medium text-white">
              {ready ? "Databento connected" : status?.configured === false ? "Databento key missing" : "Databento offline"}
            </div>
          </div>

          {status?.dataThrough ? (
            <div className="mt-2 text-xs text-white/60">Data through {fmtCt(status.dataThrough)}</div>
          ) : null}
          {status?.spend ? (
            <div className="mt-1 text-[11px] text-white/40">Credit used ${status.spend.total.toFixed(2)}</div>
          ) : null}

          {status?.error ? <div className="mt-2 text-[11px] text-red-300/70">{String(status.error)}</div> : null}
        </div>
      </div>
    </aside>
  );
}