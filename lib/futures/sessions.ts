import type { Bar } from "./types";

/**
 * CME Globex sessions run 17:00 → 16:00 America/Chicago. A bar belongs to the
 * trading day that session closes on, so Sunday 17:00 CT is Monday's session.
 */
const SESSION_OPEN_HOUR_CT = 17;
const SESSION_CLOSE_HOUR_CT = 16;

const ctFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type CtParts = { year: number; month: number; day: number; hour: number; minute: number };

function chicagoParts(ms: number): CtParts {
  const parts = ctFormatter.formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Trading-day key (YYYY-MM-DD) for a timestamp. */
export function tradingDay(ms: number): string {
  const p = chicagoParts(ms);
  const key = dateKey(p.year, p.month, p.day);
  return p.hour >= SESSION_OPEN_HOUR_CT ? addDays(key, 1) : key;
}

/** UTC epoch ms for a wall-clock time in Chicago on a given date. */
export function chicagoToUtc(key: string, hour: number, minute = 0): number {
  const guess = Date.parse(`${key}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  // Chicago is UTC-5 or UTC-6; correct the guess by the observed offset.
  for (const offsetH of [5, 6]) {
    const candidate = guess + offsetH * 3_600_000;
    const p = chicagoParts(candidate);
    if (dateKey(p.year, p.month, p.day) === key && p.hour === hour && p.minute === minute) return candidate;
  }
  return guess + 6 * 3_600_000;
}

/** The session for `key` has closed by `asOf` (16:00 CT on that date). */
export function isSessionComplete(key: string, asOf: number): boolean {
  return asOf >= chicagoToUtc(key, SESSION_CLOSE_HOUR_CT);
}

export type Session = {
  key: string;
  start: number;
  end: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  bars: Bar[];
};

/** Group bars (any interval) into Globex sessions, oldest first. */
export function groupSessions(bars: Bar[]): Session[] {
  const map = new Map<string, Bar[]>();
  for (const b of bars) {
    const k = tradingDay(b.ts);
    const list = map.get(k);
    if (list) list.push(b);
    else map.set(k, [b]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, list]) => {
      list.sort((a, b) => a.ts - b.ts);
      return {
        key,
        start: list[0].ts,
        end: list[list.length - 1].ts,
        open: list[0].open,
        high: Math.max(...list.map((b) => b.high)),
        low: Math.min(...list.map((b) => b.low)),
        close: list[list.length - 1].close,
        volume: list.reduce((s, b) => s + b.volume, 0),
        bars: list,
      };
    });
}

/** Roll fine bars into fixed buckets (e.g. 1m → 15m). Buckets align to UTC epoch. */
export function aggregate(bars: Bar[], intervalMs: number): Bar[] {
  const out: Bar[] = [];
  let cur: Bar | null = null;
  for (const b of [...bars].sort((a, c) => a.ts - c.ts)) {
    const bucket = Math.floor(b.ts / intervalMs) * intervalMs;
    if (!cur || cur.ts !== bucket) {
      if (cur) out.push(cur);
      cur = { ts: bucket, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function atr(bars: Bar[], period = 14): number {
  if (bars.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const pc = bars[i - 1].close;
    trs.push(Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)));
  }
  const recent = trs.slice(-period);
  return recent.reduce((s, v) => s + v, 0) / recent.length;
}
