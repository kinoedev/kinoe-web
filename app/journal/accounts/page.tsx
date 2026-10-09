"use client";

import { useEffect, useState } from "react";
import JournalShell from "@/components/journal/JournalShell";
import AccountForm from "@/components/journal/AccountForm";
import { money } from "@/lib/journal/format";
import type { TradingAccount } from "@/lib/journal/store";

const STATUS: Record<TradingAccount["status"], string> = {
  ACTIVE: "Evaluation",
  FUNDED: "Funded",
  PASSED: "Passed",
  FAILED: "Blown",
  CLOSED: "Closed",
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<TradingAccount[] | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch("/api/journal/accounts", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d.ok ? setAccounts(d.accounts) : setError(d.error)))
      .catch(() => setError("Failed to load accounts"));

  useEffect(() => {
    load();
  }, []);

  return (
    <JournalShell
      actions={
        <button onClick={() => setEditing("new")} className="rounded-xl border border-purple-400/50 bg-purple-500/20 px-3 py-1.5 text-xs text-purple-50">
          New account
        </button>
      }
    >
      {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
      {editing === "new" ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 text-sm text-white">New account</div>
          <AccountForm
            onSaved={() => {
              setEditing(null);
              load();
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(accounts ?? []).map((a) =>
          editing === a.id ? (
            <div key={a.id} className="rounded-2xl border border-purple-500/30 bg-white/[0.03] p-4 md:col-span-2">
              <AccountForm
                account={a}
                onSaved={() => {
                  setEditing(null);
                  load();
                }}
                onCancel={() => setEditing(null)}
              />
            </div>
          ) : (
            <div key={a.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm text-white">{a.name}</div>
                  <div className="text-[11px] text-white/40">
                    {[a.firm, a.platform, a.account_number].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-white/60">{STATUS[a.status]}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] text-white/50">
                <div>Size <span className="font-mono text-white/80">{money(a.starting_balance, { cents: false })}</span></div>
                <div>Target <span className="font-mono text-white/80">{money(a.profit_target, { cents: false })}</span></div>
                <div>Daily limit <span className="font-mono text-white/80">{money(a.daily_loss_limit, { cents: false })}</span></div>
                <div>
                  Max DD <span className="font-mono text-white/80">{money(a.max_drawdown, { cents: false })}</span>{" "}
                  {a.drawdown_type === "EOD_TRAILING" ? "EOD trail" : a.drawdown_type === "STATIC" ? "static" : ""}
                </div>
              </div>
              <button onClick={() => setEditing(a.id)} className="mt-3 text-xs text-purple-200/80 hover:text-purple-100">
                Edit
              </button>
            </div>
          )
        )}
      </div>
      {accounts && accounts.length === 0 && editing !== "new" ? (
        <div className="rounded-2xl border border-white/10 px-6 py-10 text-center text-sm text-white/50">
          No accounts yet. Create one for each prop account, or one &quot;history&quot; account for old evals.
        </div>
      ) : null}
    </JournalShell>
  );
}
