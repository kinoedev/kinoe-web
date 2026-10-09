"use client";

import { safeJson } from "@/lib/http";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import JournalShell from "@/components/journal/JournalShell";
import AccountForm from "@/components/journal/AccountForm";
import { money, pnlClass } from "@/lib/journal/format";
import type { TradingAccount } from "@/lib/journal/store";

type Upload = { name: string; text?: string; base64?: string; size: number };
type Check = {
  name: string;
  kind: string;
  rows: number;
  reportGross: number | null;
  reportFees: number | null;
  reportNet: number | null;
  reportTrades: number | null;
  parsedGross: number;
  error?: string;
};
type Preview = {
  format: string;
  rowsRead: number;
  trades: number;
  from: number | null;
  to: number | null;
  gross: number;
  fees: number;
  net: number;
  feesFromReport: boolean;
  symbols: string[];
  withStops: number;
  warnings: string[];
  checks: Check[];
  sample: { symbol: string; direction: string; qty: number; entryTs: number; exitTs: number; entryPrice: number; exitPrice: number; grossPnl: number }[];
};
type ImportRow = { id: string; created_at: string; filename: string; account_name: string | null; trades_created: number; duplicates: number; date_from: string | null; date_to: string | null };

const fmtDate = (ms: number | string | null) =>
  ms === null ? "—" : new Date(ms).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function readFile(f: File): Promise<Upload> {
  if (f.name.toLowerCase().endsWith(".pdf")) {
    const buf = new Uint8Array(await f.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { name: f.name, base64: btoa(bin), size: f.size };
  }
  return { name: f.name, text: await f.text(), size: f.size };
}

export default function ImportPage() {
  const [accounts, setAccounts] = useState<TradingAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [creating, setCreating] = useState(false);
  const [files, setFiles] = useState<Upload[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ created: number; duplicates: number } | null>(null);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const loadAccounts = () =>
    fetch("/api/journal/accounts", { cache: "no-store" })
      .then(safeJson)
      .then((d) => {
        if (!d.ok) return;
        setAccounts(d.accounts);
        if (d.accounts.length === 0) setCreating(true);
      });
  const loadImports = () =>
    fetch("/api/journal/import", { cache: "no-store" })
      .then(safeJson)
      .then((d) => d.ok && setImports(d.imports));

  useEffect(() => {
    loadAccounts();
    loadImports();
  }, []);

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    setError(null);
    setPreview(null);
    setDone(null);
    const read = await Promise.all([...list].map(readFile));
    setFiles((cur) => [...cur.filter((c) => !read.some((r) => r.name === c.name)), ...read]);
  };

  const send = async (dryRun: boolean) => {
    if (!accountId) return setError("Pick the account these trades belong to.");
    if (!files.length) return setError("Add at least one file.");
    setBusy(dryRun ? "preview" : "import");
    setError(null);
    try {
      const res = await fetch("/api/journal/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, dryRun, files: files.map(({ name, text, base64 }) => ({ name, text, base64 })) }),
      });
      const d = await safeJson(res);
      if (!d.ok) throw new Error(d.error ?? "Import failed");
      if (dryRun) setPreview(d.preview);
      else {
        setDone({ created: d.result.created, duplicates: d.result.duplicates });
        setFiles([]);
        setPreview(null);
        loadImports();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  };

  const undo = async (id: string) => {
    if (!confirm("Remove this import and the trades it added?")) return;
    await fetch(`/api/journal/import?id=${id}`, { method: "DELETE" });
    loadImports();
  };

  return (
    <JournalShell>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-[10px] uppercase tracking-widest text-white/40">1 · Account</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  setPreview(null);
                }}
                className="min-w-[220px] rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-purple-400/60"
                aria-label="Account"
              >
                <option value="">Choose account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.account_number ? ` · ${a.account_number}` : ""}
                  </option>
                ))}
              </select>
              <button onClick={() => setCreating((v) => !v)} className="text-xs text-purple-200/80 hover:text-purple-100">
                {creating ? "Cancel" : "+ New account"}
              </button>
            </div>
            {creating ? (
              <div className="mt-4">
                <AccountForm
                  onSaved={(a) => {
                    setCreating(false);
                    loadAccounts();
                    setAccountId(a.id);
                  }}
                />
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-[10px] uppercase tracking-widest text-white/40">2 · Files</div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => input.current?.click()}
              className={`mt-2 cursor-pointer rounded-xl border border-dashed px-4 py-8 text-center text-sm transition ${
                drag ? "border-purple-400/70 bg-purple-500/10 text-purple-50" : "border-white/15 text-white/55 hover:border-white/30"
              }`}
            >
              Drop Tradovate <b className="text-white/80">Performance</b> reports here (PDF or CSV) — or click to choose.
              <div className="mt-1 text-[11px] text-white/35">Overlapping exports are fine; trades already in the journal are skipped.</div>
              <input ref={input} type="file" accept=".pdf,.csv,text/csv,application/pdf" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            </div>
            {files.length ? (
              <div className="mt-3 space-y-1">
                {files.map((f) => (
                  <div key={f.name} className="flex items-center gap-2 text-xs text-white/65">
                    <span className="truncate">{f.name}</span>
                    <span className="text-white/30">{Math.round(f.size / 1024)} KB</span>
                    <button
                      onClick={() => {
                        setFiles((c) => c.filter((x) => x.name !== f.name));
                        setPreview(null);
                      }}
                      className="ml-auto text-white/35 hover:text-red-300"
                      aria-label={`Remove ${f.name}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => send(true)}
                disabled={!!busy || !files.length}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-40"
              >
                {busy === "preview" ? "Reading…" : "Preview"}
              </button>
              <button
                onClick={() => send(false)}
                disabled={!!busy || !preview}
                className="rounded-xl border border-purple-400/50 bg-purple-500/20 px-4 py-2 text-sm text-purple-50 hover:bg-purple-500/30 disabled:opacity-40"
              >
                {busy === "import" ? "Importing…" : preview ? `Import ${preview.trades} trades` : "Import"}
              </button>
            </div>
          </div>

          {error ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
          {done ? (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-50">
              Imported {done.created} trade{done.created === 1 ? "" : "s"}
              {done.duplicates ? ` · ${done.duplicates} already in the journal, skipped` : ""}.{" "}
              <Link href="/journal" className="underline">
                Open the dashboard
              </Link>
            </div>
          ) : null}

          {preview ? (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
                <span className="text-white">{preview.trades} trades</span>
                <span className="text-white/50">
                  {fmtDate(preview.from)} → {fmtDate(preview.to)} CT
                </span>
                <span className="text-white/50">{preview.symbols.join(", ")}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-white/40">Gross</div>
                  <div className={`font-mono text-base ${pnlClass(preview.gross)}`}>{money(preview.gross, { sign: true })}</div>
                </div>
                <div>
                  <div className="text-white/40">Fees {preview.feesFromReport ? "(from report)" : "(account rates)"}</div>
                  <div className="font-mono text-base text-white/80">{money(-preview.fees)}</div>
                </div>
                <div>
                  <div className="text-white/40">Net</div>
                  <div className={`font-mono text-base ${pnlClass(preview.net)}`}>{money(preview.net, { sign: true })}</div>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[560px] text-left text-[11px]">
                  <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/40">
                    <tr>
                      <th className="px-3 py-2">File</th>
                      <th className="px-3 py-2 text-right">Rows</th>
                      <th className="px-3 py-2 text-right">Report gross</th>
                      <th className="px-3 py-2 text-right">Read gross</th>
                      <th className="px-3 py-2">Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.checks.map((c) => {
                      const ok = c.reportGross === null ? null : Math.abs(c.reportGross - c.parsedGross) < 0.01 && (c.reportTrades === null || c.reportTrades === c.rows);
                      return (
                        <tr key={c.name} className="border-t border-white/5 text-white/70">
                          <td className="max-w-[220px] truncate px-3 py-1.5">{c.name}</td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {c.rows}
                            {c.reportTrades !== null ? `/${c.reportTrades}` : ""}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">{c.reportGross !== null ? money(c.reportGross) : "—"}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{money(c.parsedGross)}</td>
                          <td className="px-3 py-1.5">
                            {c.error ? (
                              <span className="text-red-300">{c.error}</span>
                            ) : ok === null ? (
                              <span className="text-white/40">no totals in file</span>
                            ) : ok ? (
                              <span className="text-emerald-300">✓ matches report</span>
                            ) : (
                              <span className="text-red-300">✗ mismatch</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {preview.warnings.map((w, i) => (
                <div key={i} className="text-xs text-yellow-200/80">
                  {w}
                </div>
              ))}
              <div className="text-[11px] text-white/40">
                Tradovate lists every fill pairing as a row; Kinoe groups them into flat-to-flat trades, so the trade count is lower than the row count.
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs leading-5 text-white/55">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-white/40">Exporting from Tradovate</div>
            Account Reports → pick the account at the top → choose dates → <b className="text-white/75">Performance</b> → download PDF or CSV.
            Export each prop account separately so trades land on the right account.
          </div>
          <div className="rounded-2xl border border-white/10 p-4">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-white/40">Recent imports</div>
            {imports.length === 0 ? <div className="text-xs text-white/40">None yet.</div> : null}
            <div className="divide-y divide-white/5">
              {imports.map((i) => (
                <div key={i.id} className="py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-white/80">{i.filename}</span>
                    <button onClick={() => undo(i.id)} className="ml-auto text-white/35 hover:text-red-300">
                      Undo
                    </button>
                  </div>
                  <div className="text-white/40">
                    {i.account_name ?? "—"} · {i.trades_created} added{i.duplicates ? ` · ${i.duplicates} skipped` : ""} · {fmtDate(i.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </JournalShell>
  );
}
