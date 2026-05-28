"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const PAGE_META: Record<string, { title: string; sub: string }> = {
  "/terminal":  { title: "Terminal",  sub: "Market Intelligence Desk" },
  "/charts":    { title: "Charts",    sub: "Advanced Charting" },
  "/signals":   { title: "Signals",   sub: "Rule-Based Scanner" },
  "/journal":   { title: "Journal",   sub: "Trade Log & Grader" },
  "/agent":     { title: "Agent",     sub: "Autonomous Scanner" },
  "/market":    { title: "Market",    sub: "Live Prices & Calendar" },
  "/settings":  { title: "Settings",  sub: "Configuration" },
};

type SessionKey = "sydney" | "tokyo" | "london" | "newyork";
type SessionDef = { label: string; flag: string; utcStart: number; utcEnd: number; color: string; dot: string };

const SESSIONS: Record<SessionKey, SessionDef> = {
  sydney:  { label: "Sydney",   flag: "🇦🇺", utcStart: 21, utcEnd: 6,  color: "text-purple-400", dot: "bg-purple-400" },
  tokyo:   { label: "Tokyo",    flag: "🇯🇵", utcStart: 0,  utcEnd: 9,  color: "text-blue-400",   dot: "bg-blue-400"   },
  london:  { label: "London",   flag: "🇬🇧", utcStart: 8,  utcEnd: 17, color: "text-emerald-400",dot: "bg-emerald-400"},
  newyork: { label: "New York", flag: "🇺🇸", utcStart: 13, utcEnd: 22, color: "text-yellow-400", dot: "bg-yellow-400" },
};

function isSessionOpen(s: SessionDef, utcH: number): boolean {
  if (s.utcStart < s.utcEnd) return utcH >= s.utcStart && utcH < s.utcEnd;
  return utcH >= s.utcStart || utcH < s.utcEnd; // crosses midnight (Sydney)
}

function timeUntil(s: SessionDef, utcH: number, utcM: number): string {
  const open = isSessionOpen(s, utcH);
  const target = open ? s.utcEnd : s.utcStart;
  let diff = (target - utcH) * 60 - utcM;
  if (diff < 0) diff += 24 * 60;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return open
    ? `closes in ${h}h ${m}m`
    : `opens in ${h}h ${m}m`;
}

export default function Topbar() {
  const pathname = usePathname();
  const meta = PAGE_META[pathname] ?? { title: "KINOE", sub: "" };

  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const openSessions = (Object.entries(SESSIONS) as [SessionKey, SessionDef][])
    .filter(([, s]) => isSessionOpen(s, utcH));

  return (
    <header className="flex items-center justify-between border-b border-white/10 bg-black/30 px-6 py-4 backdrop-blur-xl">
      <div>
        <div className="text-sm font-medium text-white/90">{meta.title}</div>
        {meta.sub && <div className="hidden sm:block text-xs text-white/40">{meta.sub}</div>}
      </div>

      {/* Market Pulse button */}
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          className={[
            "flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition",
            open
              ? "border-purple-500/50 bg-purple-500/10 text-purple-300"
              : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white/80",
          ].join(" ")}
        >
          {/* Live indicator */}
          {openSessions.length > 0 ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
          ) : (
            <span className="h-2 w-2 rounded-full bg-white/20" />
          )}
          Market Pulse
          <svg className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none">
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-white/10 bg-[#0f0f14] shadow-2xl shadow-black/60 z-50 overflow-hidden">

            {/* Sessions */}
            <div className="p-4 border-b border-white/5">
              <div className="mb-3 text-[10px] uppercase tracking-widest text-white/25">Sessions</div>
              <div className="space-y-2">
                {(Object.entries(SESSIONS) as [SessionKey, SessionDef][]).map(([key, s]) => {
                  const active = isSessionOpen(s, utcH);
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${active ? s.dot : "bg-white/15"}`} />
                        <span className="text-xs text-white/70">{s.flag} {s.label}</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-[10px] font-medium ${active ? s.color : "text-white/25"}`}>
                          {active ? "OPEN" : "CLOSED"}
                        </span>
                        <div className="text-[9px] text-white/25">{timeUntil(s, utcH, utcM)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* UTC clock */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-white/30">UTC Time</span>
              <span className="font-mono text-xs text-white/60">
                {now.toUTCString().slice(17, 22)}
              </span>
            </div>

            {/* CTA */}
            <div className="p-3">
              <Link
                href="/market"
                onClick={() => setOpen(false)}
                className="block w-full rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/20 py-2 text-center text-xs text-purple-300 transition"
              >
                Open Market Page
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
