/** Timezone helpers that work for any IANA zone (no dependencies). */

const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(tz, f);
  }
  return f;
}

function wallParts(ms: number, tz: string) {
  const parts = fmt(tz).formatToParts(new Date(ms));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: g("year"), mo: g("month"), d: g("day"), h: g("hour"), mi: g("minute"), s: g("second") };
}

/** Convert a wall-clock time in `tz` to epoch ms. */
export function wallToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  // Two passes handle DST transitions.
  let ts = guess;
  for (let i = 0; i < 2; i++) {
    const p = wallParts(ts, tz);
    const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    ts += guess - asUtc;
  }
  return ts;
}

/**
 * Parse the timestamp formats brokers export: "10/08/2026 09:31:12", "10/08/2026 9:31:12 AM",
 * "2026-10-08 09:31:12", ISO strings with an offset. Naive times are read in `tz`.
 */
export function parseTimestamp(raw: string, tz: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))) return Date.parse(s);
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[ T,]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*([AaPp][Mm])?$/);
  if (m) {
    const [, mo, d, y, h, mi, sec, ap] = m;
    let year = Number(y);
    if (year < 100) year += 2000;
    let hour = Number(h);
    if (ap) {
      const pm = ap.toUpperCase() === "PM";
      if (pm && hour < 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
    }
    return wallToUtc(year, Number(mo), Number(d), hour, Number(mi), Number(sec ?? 0), tz);
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
  if (m) {
    const [, y, mo, d, h, mi, sec] = m;
    return wallToUtc(Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(sec ?? 0), tz);
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/** CME trading day (session closes 16:00 CT; trades from 17:00 CT count toward the next day). */
export function cmeTradingDay(ms: number): string {
  const p = wallParts(ms, "America/Chicago");
  const date = new Date(Date.UTC(p.y, p.mo - 1, p.d, 12));
  if (p.h >= 17) date.setUTCDate(date.getUTCDate() + 1);
  // Weekend sessions roll to Monday.
  const dow = date.getUTCDay();
  if (dow === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (dow === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Chicago hour-of-day and weekday, for reports. */
export function chicagoHour(ms: number): { hour: number; weekday: number } {
  const p = wallParts(ms, "America/Chicago");
  return { hour: p.h, weekday: new Date(Date.UTC(p.y, p.mo - 1, p.d, 12)).getUTCDay() };
}
