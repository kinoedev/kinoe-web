"use client";

import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import ChartPanel from "@/components/ChartPanel";
import SignalPanel from "@/components/SignalPanel";

export default function TerminalPage() {
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
