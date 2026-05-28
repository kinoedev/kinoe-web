"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type AgentStatus = {
  ok?: boolean;
  agent?: string;
  error?: string;
  balance?: string | null;
  currency?: string | null;
  nav?: string | null;
};

type SidebarProps = {
  agentOnline?: boolean;
  lastCheckedAt?: number | null;
};

export default function Sidebar(_props: SidebarProps = {}) {
  const pathname = usePathname();

  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  const isOnline = useMemo(() => {
    return status?.ok === true && status?.agent === "online";
  }, [status]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch("/api/agent/status", {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        const data = (await res.json()) as AgentStatus;

        if (!alive) return;
        setStatus(data);
        setLastCheckedAt(Date.now());
      } catch (e: any) {
        if (!alive) return;
        setStatus({ ok: false, agent: "offline", error: e?.message ?? "fetch failed" });
        setLastCheckedAt(Date.now());
      } finally {
        if (!alive) return;
        timer = setTimeout(poll, 60000);
      }
    };

    poll();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const navItems = [
    { label: "Terminal", href: "/terminal" },
    { label: "Charts", href: "/charts" },
    { label: "Signals", href: "/signals" },
    { label: "Journal", href: "/journal" },
    { label: "Agent", href: "/agent" },
    { label: "Analytics", href: "/analytics" },
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
          const active = pathname === item.href;
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
            <span
              className={[
                "inline-block h-2.5 w-2.5 rounded-full",
                isOnline ? "bg-emerald-400" : "bg-white/25",
              ].join(" ")}
            />
            <div className="text-sm font-medium text-white">
              {isOnline ? "OANDA connected" : "OANDA offline"}
            </div>
          </div>

          {isOnline && status?.balance ? (
            <div className="mt-2 text-xs text-white/60">
              {status.currency} {Number(status.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          ) : null}

          {status?.error ? (
            <div className="mt-2 text-[11px] text-red-300/70">
              {String(status.error)}
            </div>
          ) : null}

          <div className="mt-2 text-[11px] text-white/30">
            {lastCheckedAt ? `Checked ${new Date(lastCheckedAt).toLocaleTimeString()}` : "Connecting..."}
          </div>
        </div>
      </div>
    </aside>
  );
}