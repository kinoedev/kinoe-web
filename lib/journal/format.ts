export function money(n: number | null | undefined, opts: { sign?: boolean; cents?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: opts.cents === false ? 0 : 2,
    maximumFractionDigits: opts.cents === false ? 0 : 2,
  });
  const sign = n < 0 ? "−" : opts.sign && n > 0 ? "+" : "";
  return `${sign}$${abs}`;
}

export function compactMoney(n: number): string {
  const a = Math.abs(n);
  const s = a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : a.toFixed(0);
  return `${n < 0 ? "−" : ""}$${s}`;
}

export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
export const ratio = (x: number) => (x === Infinity ? "∞" : x.toFixed(2));

export function duration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "—";
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function ctTime(iso: string | null, withDate = true): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    ...(withDate ? { month: "short", day: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
  });
}

export const pnlClass = (n: number | null | undefined) =>
  !n ? "text-white/60" : n > 0 ? "text-emerald-300" : "text-red-300";

/** Today's CME trading day in Chicago (rolls at 17:00 CT). */
export function todayTradingDay(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const d = new Date(`${g("year")}-${g("month")}-${g("day")}T12:00:00Z`);
  if (Number(g("hour")) >= 17) d.setUTCDate(d.getUTCDate() + 1);
  if (d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 2);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
