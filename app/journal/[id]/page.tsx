"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import type { JournalEntry, Outcome, UpdateJournalEntry } from "@/lib/db/types";

const OUTCOMES: Outcome[] = ["OPEN", "WIN", "LOSS", "BE", "CANCELLED"];

export default function JournalEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingPatch, setSavingPatch] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [exitPrice, setExitPrice] = useState("");
  const [rMultiple, setRMultiple] = useState("");
  const [review, setReview] = useState("");

  useEffect(() => {
    fetch(`/api/journal/${id}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load");
        setEntry(data.entry);
        setOutcome((data.entry.outcome ?? "") as Outcome | "");
        setExitPrice(data.entry.exit_price !== null ? String(data.entry.exit_price) : "");
        setRMultiple(data.entry.r_multiple !== null ? String(data.entry.r_multiple) : "");
        setReview(data.entry.review_md ?? "");
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load"));
  }, [id]);

  function asNum(s: string): number | null {
    if (s.trim() === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  async function saveReview(e: React.FormEvent) {
    e.preventDefault();
    setSavingPatch(true);
    setSaveError(null);
    setSavedAt(null);

    const patch: UpdateJournalEntry = {
      outcome: (outcome || null) as Outcome | null,
      exit_price: asNum(exitPrice),
      r_multiple: asNum(rMultiple),
      review_md: review || null,
      exited_at: outcome && outcome !== "OPEN" ? new Date().toISOString() : null,
    };

    try {
      const res = await fetch(`/api/journal/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || `Failed to save (HTTP ${res.status})`);
      setEntry(data.entry);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingPatch(false);
    }
  }

  async function onDelete() {
    if (!confirm("Delete this entry permanently?")) return;
    const res = await fetch(`/api/journal/${id}`, { method: "DELETE" });
    if (res.ok) router.replace("/journal");
  }

  return (
    <div className="relative min-h-screen bg-black text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-56 -left-56 h-[700px] w-[700px] rounded-full bg-purple-600/20 blur-3xl" />
        <div className="absolute -bottom-56 -right-56 h-[700px] w-[700px] rounded-full bg-fuchsia-600/20 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen">
        <Sidebar />

        <main className="flex-1">
          <Topbar />

          <div className="p-6">
            {loadError ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-200">
                {loadError}
              </div>
            ) : !entry ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-xs text-white/50">
                Loading...
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white/80">
                      {entry.pair} · {entry.timeframe} · {entry.direction}
                    </div>
                    <div className="mt-1 text-xs text-white/40">
                      {entry.setup_type ?? "No setup type"} · Created {new Date(entry.created_at).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={onDelete}
                    className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/20"
                  >
                    Delete
                  </button>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-4">
                  <ReadCard label="Entry" value={entry.entry_price !== null ? String(entry.entry_price) : "—"} />
                  <ReadCard label="Stop loss" value={entry.stop_loss !== null ? String(entry.stop_loss) : "—"} />
                  <ReadCard label="Take profit" value={entry.take_profit !== null ? String(entry.take_profit) : "—"} />
                  <ReadCard
                    label="R:R"
                    value={entry.risk_reward !== null ? `${entry.risk_reward}:1` : "—"}
                  />
                </div>

                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="text-sm text-white/80">Thesis</div>
                  <div className="mt-2 whitespace-pre-wrap text-xs leading-5 text-white/60">
                    {entry.thesis_md || "No thesis recorded."}
                  </div>
                </div>

                <form
                  onSubmit={saveReview}
                  className="mt-6 rounded-2xl border border-purple-500/30 bg-purple-500/5 p-5"
                >
                  <div className="text-sm text-purple-100">Review &amp; close out</div>
                  <div className="mt-1 text-xs text-white/40">
                    Set the outcome and write what you learned. This is what trains the agent.
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <Field label="Outcome">
                      <select
                        value={outcome}
                        onChange={(e) => setOutcome(e.target.value as Outcome | "")}
                        className={inputClass}
                      >
                        <option value="">—</option>
                        {OUTCOMES.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Exit price">
                      <input
                        type="number"
                        step="0.00001"
                        value={exitPrice}
                        onChange={(e) => setExitPrice(e.target.value)}
                        className={inputClass}
                      />
                    </Field>

                    <Field label="R multiple">
                      <input
                        type="number"
                        step="0.1"
                        value={rMultiple}
                        onChange={(e) => setRMultiple(e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  <Field label="Review (what happened, what to learn)" wide>
                    <textarea
                      rows={6}
                      value={review}
                      onChange={(e) => setReview(e.target.value)}
                      className={`${inputClass} resize-y`}
                    />
                  </Field>

                  {saveError ? (
                    <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200">
                      {saveError}
                    </div>
                  ) : null}

                  {savedAt && !saveError ? (
                    <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                      Saved at {new Date(savedAt).toLocaleTimeString()} · outcome {entry.outcome ?? "—"} · exit {entry.exit_price ?? "—"} · R {entry.r_multiple ?? "—"}
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={savingPatch}
                    className="mt-4 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm text-purple-100 transition hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingPatch ? "Saving..." : "Save review"}
                  </button>
                </form>

                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-white/80">AI analysis</div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/40">
                      Coming next
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-white/40">
                    Claude / OpenAI will grade the setup, critique the thesis, and label the trade for bot training. Wiring next phase.
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-purple-400/60";

function ReadCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-white/50">{label}</div>
      <div className="mt-1 text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "md:col-span-3 mt-4" : ""}`}>
      <div className="mb-1 text-xs text-white/60">{label}</div>
      {children}
    </label>
  );
}
