"use client";

import { useEffect, useState } from "react";

import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import ChartPanel from "@/components/ChartPanel";
import SignalPanel from "@/components/SignalPanel";

type AgentStatusResponse = {
  ok?: boolean;
  agent?: "online" | "offline" | string;
};

export default function TerminalPage() {
  const [agentOnline, setAgentOnline] = useState<boolean>(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      try {
        const res = await fetch("/api/agent/status", {
          method: "GET",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        const data = (await res.json()) as AgentStatusResponse;

        if (cancelled) return;

        const isOnline = data?.agent === "online";
        setAgentOnline(isOnline);
        setLastCheckedAt(Date.now());
      } catch {
        if (cancelled) return;
        setAgentOnline(false);
        setLastCheckedAt(Date.now());
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-56 -left-56 h-[700px] w-[700px] rounded-full bg-purple-600/20 blur-3xl" />
        <div className="absolute -bottom-56 -right-56 h-[700px] w-[700px] rounded-full bg-fuchsia-600/20 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen">
        <Sidebar />
        <main className="flex-1">
          <Topbar />
          <div className="grid gap-6 p-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartPanel />
            </div>
            <div className="lg:col-span-1">
              <SignalPanel />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}