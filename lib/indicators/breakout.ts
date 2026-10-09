/**
 * Breakout Quality — reads a 15m close through a zone and labels it Strong / Weak / Likely trap.
 *
 * Clean by design: no indicator panels, one label plus the reasons behind it.
 *  - Liquidity (ICT): previous day high/low, Asia and London session highs/lows, equal highs/lows.
 *      · swept the opposite side first (stop run, then expansion)      → strong
 *      · the break bar only wicked through resting liquidity            → trap
 *      · untaken liquidity still ahead to draw price                     → supportive
 *  - Displacement: big body vs ATR, closing near its extreme; fair value gap left behind.
 *  - Relative volume: break bar volume vs the same 15m slot on prior sessions.
 *  - Stochastic divergence: new price high/low without a new stochastic high/low → warning.
 *  - 1H structure: higher highs & higher lows (or the reverse) in the break direction.
 */
import type { Bar } from "@/lib/futures/types";
import { chicagoClock } from "@/lib/futures/sessions";

export type Dir = "LONG" | "SHORT";
export type Quality = "STRONG" | "WEAK" | "TRAP";

export type LiquidityLevel = { price: number; side: "BUY" | "SELL"; name: string; formedAt: number };

export type BreakFeatures = {
  bodyAtr: number;
  closeLocation: number;
  displacement: boolean;
  fvg: boolean;
  relVol: number | null;
  sweptOppositeFirst: string | null;
  sweepOnBreak: string | null;
  drawAhead: string | null;
  divergence: boolean;
  trend: "WITH" | "AGAINST" | "MIXED";
  session: "RTH_OPEN" | "RTH" | "EVENING" | "OVERNIGHT";
};

export type BreakRead = {
  ts: number;
  dir: Dir;
  price: number;
  level: string;
  score: number;
  quality: Quality;
  reasons: { text: string; good: boolean }[];
  features: BreakFeatures;
};

const M15 = 15 * 60_000;
const H1 = 60 * 60_000;

// ── Context: everything precomputed once per bar series ─────────────────────

export type BreakoutContext = {
  bars: Bar[];
  hourly: Bar[];
  atr: number[];
  stochK: number[];
  relVol: (number | null)[];
  day: string[];
  minutes: number[];
};

function tradingDayFast(ms: number): string {
  const { minutes, date } = chicagoClock(ms);
  if (minutes < 17 * 60) return date;
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function prepareContext(bars15: Bar[], hourly: Bar[]): BreakoutContext {
  const bars = [...bars15].sort((a, b) => a.ts - b.ts);
  const n = bars.length;

  // Wilder-style ATR(14) on true range
  const atr: number[] = new Array(n).fill(0);
  let a = 0;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const tr = i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close));
    a = i < 14 ? (a * i + tr) / (i + 1) : (a * 13 + tr) / 14;
    atr[i] = a;
  }

  // Stochastic %K(14) smoothed by 3
  const raw: number[] = bars.map((_, i) => {
    const from = Math.max(0, i - 13);
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = from; j <= i; j++) {
      hh = Math.max(hh, bars[j].high);
      ll = Math.min(ll, bars[j].low);
    }
    return hh > ll ? ((bars[i].close - ll) / (hh - ll)) * 100 : 50;
  });
  const stochK = raw.map((_, i) => {
    const s = raw.slice(Math.max(0, i - 2), i + 1);
    return s.reduce((x, y) => x + y, 0) / s.length;
  });

  // Relative volume vs the same 15m slot over up to 10 prior sessions
  const day = bars.map((b) => tradingDayFast(b.ts));
  const minutes = bars.map((b) => chicagoClock(b.ts).minutes);
  const slotHist = new Map<number, { day: string; vol: number }[]>();
  const relVol: (number | null)[] = bars.map((b, i) => {
    const hist = slotHist.get(minutes[i]) ?? [];
    const prior = hist.filter((h) => h.day !== day[i]).slice(-10);
    const avg = prior.length >= 3 ? prior.reduce((s, h) => s + h.vol, 0) / prior.length : null;
    hist.push({ day: day[i], vol: b.volume });
    slotHist.set(minutes[i], hist);
    return avg && avg > 0 ? b.volume / avg : null;
  });

  return { bars, hourly: [...hourly].sort((x, y) => x.ts - y.ts), atr, stochK, relVol, day, minutes };
}

// ── Liquidity ───────────────────────────────────────────────────────────────

/** Liquidity pools known before bar i: PDH/PDL, Asia & London ranges, equal highs/lows. */
export function liquidityLevels(ctx: BreakoutContext, i: number): LiquidityLevel[] {
  const { bars, day, minutes, atr } = ctx;
  const out: LiquidityLevel[] = [];
  const today = day[i];

  // Previous trading day high/low
  let j = i - 1;
  while (j >= 0 && day[j] === today) j--;
  if (j >= 0) {
    const prevDay = day[j];
    let hi = -Infinity;
    let lo = Infinity;
    let k = j;
    for (; k >= 0 && day[k] === prevDay; k--) {
      hi = Math.max(hi, bars[k].high);
      lo = Math.min(lo, bars[k].low);
    }
    out.push({ price: hi, side: "BUY", name: "PDH", formedAt: k + 1 }, { price: lo, side: "SELL", name: "PDL", formedAt: k + 1 });
  }

  // Session ranges within today, before bar i (CT): Asia 18:00–23:00, London 01:00–04:00
  const ranges: [string, (m: number) => boolean][] = [
    ["Asia", (m) => m >= 18 * 60 && m < 23 * 60],
    ["London", (m) => m >= 60 && m < 4 * 60],
  ];
  for (const [name, inRange] of ranges) {
    let hi = -Infinity;
    let lo = Infinity;
    let last = -1;
    for (let k = j + 1; k < i; k++) {
      if (day[k] !== today || !inRange(minutes[k])) continue;
      hi = Math.max(hi, bars[k].high);
      lo = Math.min(lo, bars[k].low);
      last = k;
    }
    // Only once the range is complete (bar i is after it)
    if (last >= 0 && !inRange(minutes[i])) {
      out.push({ price: hi, side: "BUY", name: `${name} high`, formedAt: last }, { price: lo, side: "SELL", name: `${name} low`, formedAt: last });
    }
  }

  // Equal highs / lows: two 15m swing points within 0.1 ATR over the last 64 bars
  const from = Math.max(2, i - 64);
  const tol = 0.1 * (atr[i - 1] || atr[i] || 1);
  const highs: { p: number; k: number }[] = [];
  const lows: { p: number; k: number }[] = [];
  for (let k = from; k < i - 2; k++) {
    const b = bars[k];
    if (b.high >= bars[k - 1].high && b.high >= bars[k - 2].high && b.high >= bars[k + 1].high && b.high >= bars[k + 2].high) highs.push({ p: b.high, k });
    if (b.low <= bars[k - 1].low && b.low <= bars[k - 2].low && b.low <= bars[k + 1].low && b.low <= bars[k + 2].low) lows.push({ p: b.low, k });
  }
  const pairs = (pts: { p: number; k: number }[], side: "BUY" | "SELL", name: string) => {
    for (let x = 0; x < pts.length; x++)
      for (let y = x + 1; y < pts.length; y++)
        if (Math.abs(pts[x].p - pts[y].p) <= tol) {
          const price = side === "BUY" ? Math.max(pts[x].p, pts[y].p) : Math.min(pts[x].p, pts[y].p);
          out.push({ price, side, name, formedAt: pts[y].k + 2 });
        }
  };
  pairs(highs, "BUY", "Equal highs");
  pairs(lows, "SELL", "Equal lows");

  // Keep only liquidity still resting (not traded through between formation and bar i)
  return out.filter((l) => {
    for (let k = l.formedAt + 1; k < i; k++) {
      if (l.side === "BUY" && bars[k].high > l.price) return false;
      if (l.side === "SELL" && bars[k].low < l.price) return false;
    }
    return Number.isFinite(l.price);
  });
}

function trendAt(hourly: Bar[], t: number): "UP" | "DOWN" | "MIXED" {
  let end = hourly.length;
  while (end > 0 && hourly[end - 1].ts + H1 > t) end--;
  const h = hourly.slice(Math.max(0, end - 48), end);
  const hi: number[] = [];
  const lo: number[] = [];
  for (let i = 2; i < h.length - 2; i++) {
    if (h[i].high > Math.max(h[i - 1].high, h[i - 2].high, h[i + 1].high, h[i + 2].high)) hi.push(h[i].high);
    if (h[i].low < Math.min(h[i - 1].low, h[i - 2].low, h[i + 1].low, h[i + 2].low)) lo.push(h[i].low);
  }
  if (hi.length < 2 || lo.length < 2) return "MIXED";
  const hh = hi[hi.length - 1] > hi[hi.length - 2];
  const hl = lo[lo.length - 1] > lo[lo.length - 2];
  if (hh && hl) return "UP";
  if (!hh && !hl) return "DOWN";
  return "MIXED";
}

function sessionOf(minutes: number): BreakFeatures["session"] {
  if (minutes >= 8 * 60 + 30 && minutes < 11 * 60) return "RTH_OPEN";
  if (minutes >= 11 * 60 && minutes < 15 * 60) return "RTH";
  if (minutes >= 17 * 60 || minutes < 2 * 60) return "EVENING";
  return "OVERNIGHT";
}

// ── The read ────────────────────────────────────────────────────────────────

export function readBreak(ctx: BreakoutContext, i: number, dir: Dir, levelName: string): BreakRead {
  const { bars, atr, stochK, relVol, minutes } = ctx;
  const b = bars[i];
  const A = atr[i - 1] || atr[i] || 1;
  const long = dir === "LONG";
  const range = b.high - b.low || 1e-9;
  const bodyAtr = Math.abs(b.close - b.open) / A;
  const closeLocation = long ? (b.close - b.low) / range : (b.high - b.close) / range;
  const bodyWithDir = long ? b.close > b.open : b.close < b.open;
  const displacement = bodyWithDir && bodyAtr >= 1 && closeLocation >= 0.7;
  const fvg = i >= 2 && (long ? bars[i - 2].high < b.low : bars[i - 2].low > b.high);
  const rv = relVol[i];

  const liq = liquidityLevels(ctx, i);
  // Opposite-side sweep in the previous 8 bars: wick through sell-side, close back above (for longs)
  let sweptOppositeFirst: string | null = null;
  const before = liquidityLevels(ctx, Math.max(3, i - 8));
  for (const l of before) {
    if (l.side !== (long ? "SELL" : "BUY")) continue;
    for (let k = Math.max(0, i - 8); k < i; k++) {
      const c = bars[k];
      if (long ? c.low < l.price && c.close > l.price : c.high > l.price && c.close < l.price) {
        sweptOppositeFirst = l.name;
        break;
      }
    }
    if (sweptOppositeFirst) break;
  }
  // The break bar itself only wicked through same-side liquidity
  let sweepOnBreak: string | null = null;
  for (const l of liq) {
    if (l.side !== (long ? "BUY" : "SELL")) continue;
    if (long ? b.high > l.price && b.close < l.price : b.low < l.price && b.close > l.price) {
      sweepOnBreak = l.name;
      break;
    }
  }
  // Untaken liquidity ahead within 3 ATR — something to draw price
  const ahead = liq
    .filter((l) => (long ? l.side === "BUY" && l.price > b.close && l.price - b.close <= 3 * A : l.side === "SELL" && l.price < b.close && b.close - l.price <= 3 * A))
    .sort((x, y) => Math.abs(x.price - b.close) - Math.abs(y.price - b.close))[0];
  const drawAhead = ahead ? ahead.name : null;

  // Divergence: new extreme vs the last 15m swing in the last 30 bars, but stochastic lower
  let divergence = false;
  for (let k = i - 3; k >= Math.max(2, i - 30); k--) {
    const isSwing = long
      ? bars[k].high >= bars[k - 1].high && bars[k].high >= bars[k - 2].high && bars[k].high >= bars[k + 1].high && bars[k].high >= bars[k + 2].high
      : bars[k].low <= bars[k - 1].low && bars[k].low <= bars[k - 2].low && bars[k].low <= bars[k + 1].low && bars[k].low <= bars[k + 2].low;
    if (!isSwing) continue;
    const newExtreme = long ? b.high > bars[k].high : b.low < bars[k].low;
    if (newExtreme) divergence = long ? stochK[i] < stochK[k] - 5 : stochK[i] > stochK[k] + 5;
    break;
  }

  const t = trendAt(ctx.hourly, b.ts + M15);
  const trend: BreakFeatures["trend"] = t === "MIXED" ? "MIXED" : (t === "UP") === long ? "WITH" : "AGAINST";
  const session = sessionOf(minutes[i]);

  const features: BreakFeatures = { bodyAtr, closeLocation, displacement, fvg, relVol: rv, sweptOppositeFirst, sweepOnBreak, drawAhead, divergence, trend, session };
  const { score, reasons } = scoreBreak(features);
  const quality: Quality = sweepOnBreak || score < 40 ? "TRAP" : score >= 65 ? "STRONG" : "WEAK";
  return { ts: b.ts + M15, dir, price: b.close, level: levelName, score, quality, reasons, features };
}

/** Starting weights. The Breakout Lab measures each one on real history — adjust these from its results. */
export function scoreBreak(f: BreakFeatures): { score: number; reasons: { text: string; good: boolean }[] } {
  let s = 50;
  const reasons: { text: string; good: boolean }[] = [];
  const add = (pts: number, text: string) => {
    s += pts;
    reasons.push({ text, good: pts > 0 });
  };
  if (f.displacement) add(15, "displacement candle");
  else if (f.bodyAtr < 0.5) add(-10, "small body");
  if (f.fvg) add(10, "left a fair value gap");
  if (f.relVol !== null) {
    if (f.relVol >= 1.5) add(15, `${f.relVol.toFixed(1)}× normal volume`);
    else if (f.relVol < 0.8) add(-10, `low volume (${f.relVol.toFixed(1)}×)`);
  }
  if (f.sweptOppositeFirst) add(10, `swept ${f.sweptOppositeFirst} first`);
  if (f.sweepOnBreak) add(-25, `only wicked ${f.sweepOnBreak}`);
  if (f.drawAhead) add(5, `${f.drawAhead} ahead`);
  if (f.divergence) add(-15, "stochastic divergence");
  if (f.trend === "WITH") add(10, "with 1H trend");
  if (f.trend === "AGAINST") add(-10, "against 1H trend");
  return { score: Math.max(0, Math.min(100, Math.round(s))), reasons };
}

// ── Outcome (for the study) ─────────────────────────────────────────────────

export type BreakOutcome = { followed: boolean; failed: boolean; mfeAtr: number; maeAtr: number };

/**
 * Follow-through: price travels 1 ATR(15m) beyond the break close within 8 bars before any 15m
 * close back through the zone's far side. Failure: that close-back happens first (or 8 bars pass).
 */
export function outcome(ctx: BreakoutContext, i: number, dir: Dir, zoneTop: number, zoneBottom: number, horizon = 8): BreakOutcome {
  const { bars, atr } = ctx;
  const A = atr[i] || 1;
  const entry = bars[i].close;
  let mfe = 0;
  let mae = 0;
  for (let k = i + 1; k < Math.min(bars.length, i + 1 + horizon); k++) {
    const b = bars[k];
    const fav = dir === "LONG" ? b.high - entry : entry - b.low;
    const adv = dir === "LONG" ? entry - b.low : b.high - entry;
    mfe = Math.max(mfe, fav);
    mae = Math.max(mae, adv);
    if (mfe >= A) return { followed: true, failed: false, mfeAtr: mfe / A, maeAtr: mae / A };
    const backThrough = dir === "LONG" ? b.close < zoneBottom : b.close > zoneTop;
    if (backThrough) return { followed: false, failed: true, mfeAtr: mfe / A, maeAtr: mae / A };
  }
  return { followed: false, failed: false, mfeAtr: mfe / A, maeAtr: mae / A };
}
