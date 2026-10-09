"use client";

import { safeJson } from "@/lib/http";
import { useState } from "react";
import type { TradingAccount } from "@/lib/journal/store";

type Draft = Record<string, string>;

const FIELDS: { key: string; label: string; type?: "number" | "select"; options?: [string, string][]; hint?: string }[] = [
  { key: "name", label: "Name", hint: "e.g. Lucid 50K Flex" },
  { key: "firm", label: "Firm" },
  { key: "account_number", label: "Account # (optional)" },
  { key: "starting_balance", label: "Starting balance", type: "number" },
  { key: "profit_target", label: "Profit target", type: "number" },
  { key: "daily_loss_limit", label: "Daily loss limit", type: "number" },
  { key: "max_drawdown", label: "Max drawdown", type: "number" },
  {
    key: "drawdown_type",
    label: "Drawdown type",
    type: "select",
    options: [
      ["EOD_TRAILING", "End-of-day trailing"],
      ["STATIC", "Static"],
      ["NONE", "None"],
    ],
  },
  { key: "fees_micro_rt", label: "Fees per micro (round turn)", type: "number", hint: "Used for CSV imports; PDFs carry their own fees" },
  { key: "fees_mini_rt", label: "Fees per mini (round turn)", type: "number" },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      ["ACTIVE", "Active (evaluation)"],
      ["FUNDED", "Funded"],
      ["PASSED", "Passed"],
      ["FAILED", "Failed / blown"],
      ["CLOSED", "Closed"],
    ],
  },
];

function toDraft(a?: Partial<TradingAccount>): Draft {
  const d: Draft = {};
  for (const f of FIELDS) {
    const v = a?.[f.key as keyof TradingAccount];
    d[f.key] = v === null || v === undefined ? "" : String(v);
  }
  if (!d.drawdown_type) d.drawdown_type = "EOD_TRAILING";
  if (!d.status) d.status = "ACTIVE";
  if (!d.firm && !a) d.firm = "Lucid";
  return d;
}

export default function AccountForm({
  account,
  onSaved,
  onCancel,
}: {
  account?: TradingAccount;
  onSaved: (a: TradingAccount) => void;
  onCancel?: () => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(account));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(account ? `/api/journal/accounts/${account.id}` : "/api/journal/accounts", {
        method: account ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
      const j = await safeJson(res);
      if (!j.ok) throw new Error(j.error ?? "Save failed");
      onSaved(j.account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-purple-400/60";
  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="block text-xs text-white/50">
            {f.label}
            {f.type === "select" ? (
              <select value={d[f.key]} onChange={(e) => setD({ ...d, [f.key]: e.target.value })} className={`mt-1 ${input}`}>
                {f.options?.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={d[f.key]}
                onChange={(e) => setD({ ...d, [f.key]: e.target.value })}
                type={f.type === "number" ? "number" : "text"}
                step="any"
                placeholder={f.hint}
                required={f.key === "name"}
                className={`mt-1 ${input}`}
              />
            )}
          </label>
        ))}
      </div>
      {error ? <div className="text-xs text-red-300">{error}</div> : null}
      <div className="flex gap-2">
        <button disabled={saving} className="rounded-xl border border-purple-400/50 bg-purple-500/20 px-4 py-2 text-sm text-purple-50 disabled:opacity-50">
          {saving ? "Saving…" : account ? "Save account" : "Create account"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/60">
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
