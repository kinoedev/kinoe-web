import { redirect } from "next/navigation";

/** Notebook tab → today's (CME) trading day. */
export default function NotebookIndex() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const d = new Date(`${g("year")}-${g("month")}-${g("day")}T12:00:00Z`);
  if (Number(g("hour")) >= 17) d.setUTCDate(d.getUTCDate() + 1);
  if (d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 2);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  redirect(`/journal/day/${d.toISOString().slice(0, 10)}`);
}

export const dynamic = "force-dynamic";
