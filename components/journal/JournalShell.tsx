"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

const TABS = [
  { href: "/journal", label: "Dashboard" },
  { href: "/journal/trades", label: "Trades" },
  { href: "/journal/reports", label: "Reports" },
  { href: "/journal/playbooks", label: "Playbooks" },
  { href: "/journal/day", label: "Notebook" },
  { href: "/journal/import", label: "Import" },
  { href: "/journal/accounts", label: "Accounts" },
];

export default function JournalShell({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/journal" ? pathname === "/journal" : pathname.startsWith(href));
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
            <div className="flex flex-wrap items-center gap-2">
              <nav className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1">
                {TABS.map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition ${
                      active(t.href) ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {t.label}
                  </Link>
                ))}
              </nav>
              {actions}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
