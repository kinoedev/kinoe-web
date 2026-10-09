/**
 * Walk-forward backtest of the 1H / 15m / 5m zone strategy.
 *
 *  1H  — the map. Zones are rebuilt at the start of every session from data that
 *        existed at that moment (no look-ahead). Bias from the week's value area
 *        and 1H swing structure decides which direction is allowed.
 *  15m — the setup.
 *        A · break & retest: a 15m close through a zone, then a retest within N bars.
 *        B · failed break: a 15m wick through a zone that closes back inside.
 *  5m  — the trigger. A 5m rejection candle at the zone; entry on a break of its
 *        high/low, stop beyond the zone and the candle, target = next zone, ≥ min R.
 *  1m  — fills. Stops are checked before targets inside a bar (worst case).
 */
import type { Bar } from "@/lib/futures/types";
import { aggregate, chicagoClock } from "@/lib/futures/sessions";
import { roundToTick, type FuturesSymbol } from "@/lib/futures/symbols";
import { analyzeZones, type Zone, type ZoneAnalysis } from "@/lib/indicators/zones";
import { newsBlackout } from "./news";

export type BacktestParams = {
  setupA: boolean;
  setupB: boolean;
  rth: boolean;
  eth: boolean;
  /** Only trade with the 1H bias (and only at value-area edges when ranging). */
  biasFilter: boolean;
  /** Skip zones that have broken more often than they've held. */
  zoneQualityFilter: boolean;
  newsFilter: boolean;
  /** Setup A outside RTH needs two consecutive 15m closes through the zone. */
  nightDoubleClose: boolean;
  minRR: number;
  maxLossesPerDay: number;
  /** 15m bars allowed for the retest after a break (setup A). */
  retestBars15: number;
  /** 15m bars allowed for the 5m trigger after a failed break (setup B). */
  failTriggerBars15: number;
  /** 5m bars a stop-entry order stays working. */
  orderExpiryBars5: number;
  stopBufferTicks: number;
  /** Slippage on stop orders (entry and stop-out). Targets are limits that need a 1-tick trade-through. */
  slippageTicks: number;
  /** Commission + fees per contract per side, in USD. */
  commissionPerSide: number;
};

export const DEFAULT_PARAMS: BacktestParams = {
  setupA: true,
  setupB: true,
  rth: true,
  eth: true,
  biasFilter: true,
  zoneQualityFilter: true,
  newsFilter: true,
  nightDoubleClose: true,
  minRR: 2,
  maxLossesPerDay: 2,
  retestBars15: 4,
  failTriggerBars15: 2,
  orderExpiryBars5: 3,
  stopBufferTicks: 2,
  slippageTicks: 1,
  commissionPerSide: 0.62,
};

type Dir = "LONG" | "SHORT";
type Bias = "LONG" | "SHORT" | "RANGE" | "NONE";

export type Trade = {
  symbol: string;
  day: string;
  setup: "A" | "B";
  dir: Dir;
  session: "RTH" | "ETH";
  bias: Bias;
  zone: string;
  signalTs: number;
  entryTs: number;
  exitTs: number;
  entry: number;
  stop: number;
  target: number;
  exit: number;
  exitReason: "TARGET" | "STOP" | "EOD";
  plannedRR: number;
  /** Result in R, measured against the risk at the actual fill. */
  r: number;
  points: number;
  /** Net of commission, one contract. */
  pnlUsd: number;
};

export type SkipCounts = {
  biasBlocked: number;
  notAtValueEdge: number;
  weakZone: number;
  noTarget: number;
  rrTooLow: number;
  news: number;
  dailyStop: number;
  sessionOff: number;
  tooLate: number;
  busy: number;
  orderNotFilled: number;
};

export type BacktestResult = {
  symbol: string;
  from: number;
  to: number;
  params: BacktestParams;
  sessionsTested: number;
  sessionsWithZones: number;
  setupsSeen: number;
  trades: Trade[];
  skips: SkipCounts;
  notes: string[];
};

export type BacktestInput = {
  symbol: FuturesSymbol;
  /** 1m bars from at least 10 days before `from` (profile warm-up) to `to`. */
  minute: Bar[];
  /** 1h bars from ~150 days before `from` to `to`. */
  hourly: Bar[];
  from: number;
  to: number;
  params?: Partial<BacktestParams>;
};

type Setup = {
  kind: "A" | "B";
  dir: Dir;
  zone: Zone;
  bias: Bias;
  signalTs: number;
  /** Setup A outside RTH: waiting for the second 15m close. */
  awaitingConfirm: boolean;
  activeFrom: number;
  expiresAt: number;
  /** Setup B: the wick extreme (stop goes beyond it). */
  extreme: number;
};

type Order = {
  setup: Setup;
  entry: number;
  stop: number;
  target: number;
  plannedRR: number;
  placedAt: number;
  expiresAt: number;
};

type Position = { order: Order; fillTs: number; fill: number };

const MIN = 60_000;
const M5 = 5 * MIN;
const M15 = 15 * MIN;
const H1 = 60 * MIN;
const DAY = 24 * H1;

const RTH_START = 8 * 60 + 30;
const RTH_END = 15 * 60;
const LAST_ENTRY = 15 * 60 + 30;
const FLATTEN = 15 * 60 + 59;
const SESSION_OPEN = 17 * 60;

/** First index with arr[i].ts >= ts. */
function lowerBound(arr: Bar[], ts: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].ts < ts) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Trading-day key (session closes 16:00 CT; 17:00 CT onwards belongs to the next day). Fast path via chicagoClock. */
function tradingDay(ms: number): string {
  const { minutes, date } = chicagoClock(ms);
  if (minutes < SESSION_OPEN) return date;
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function sessionOf(ms: number): "RTH" | "ETH" {
  const { minutes, weekday } = chicagoClock(ms);
  return weekday >= 1 && weekday <= 5 && minutes >= RTH_START && minutes < RTH_END ? "RTH" : "ETH";
}

function bandDistance(price: number, z: Zone): number {
  return price > z.top ? price - z.top : price < z.bottom ? z.bottom - price : 0;
}

export function runBacktest(input: BacktestInput): BacktestResult {
  const p: BacktestParams = { ...DEFAULT_PARAMS, ...input.params };
  const { symbol, from, to } = input;
  const tick = symbol.tick;
  const pointValue = symbol.tickValue / symbol.tick;
  const buffer = p.stopBufferTicks * tick;
  const slip = p.slippageTicks * tick;

  const minute = [...input.minute].sort((a, b) => a.ts - b.ts);
  const hourly = [...input.hourly].sort((a, b) => a.ts - b.ts);
  const bars5 = aggregate(minute, M5);
  const bars15 = aggregate(minute, M15);

  const skips: SkipCounts = {
    biasBlocked: 0,
    notAtValueEdge: 0,
    weakZone: 0,
    noTarget: 0,
    rrTooLow: 0,
    news: 0,
    dailyStop: 0,
    sessionOff: 0,
    tooLate: 0,
    busy: 0,
    orderNotFilled: 0,
  };
  const trades: Trade[] = [];
  const notes: string[] = [];

  // ── Per-session state ──────────────────────────────────────────────────────
  let day: string | null = null;
  let analysis: ZoneAnalysis | null = null;
  let zones: Zone[] = [];
  let lossesToday = 0;
  let stoppedToday = false;
  let sessionsTested = 0;
  let sessionsWithZones = 0;
  let setupsSeen = 0;
  let zoneErrors = 0;

  let setups: Setup[] = [];
  let order: Order | null = null;
  let position: Position | null = null;
  let lastClose = 0;
  let lastTs = 0;

  const biasCache = new Map<number, Bias>();
  function biasAt(t: number): Bias {
    if (!analysis?.profile) return "NONE";
    const key = Math.floor(t / H1);
    const cached = biasCache.get(key);
    if (cached) return cached;
    // Completed hourly bars only: bar start + 1h <= t.
    const end = lowerBound(hourly, t - H1 + 1);
    const h = hourly.slice(Math.max(0, end - 60), end);
    let bias: Bias = "NONE";
    if (h.length >= 20) {
      const k = 2;
      const highs: number[] = [];
      const lows: number[] = [];
      for (let i = k; i < h.length - k; i++) {
        let isH = true;
        let isL = true;
        for (let j = i - k; j <= i + k; j++) {
          if (j === i) continue;
          if (h[j].high >= h[i].high) isH = false;
          if (h[j].low <= h[i].low) isL = false;
        }
        if (isH) highs.push(h[i].high);
        if (isL) lows.push(h[i].low);
      }
      const close = h[h.length - 1].close;
      const higherLow = lows.length >= 2 && lows[lows.length - 1] > lows[lows.length - 2];
      const lowerHigh = highs.length >= 2 && highs[highs.length - 1] < highs[highs.length - 2];
      const { vah, val } = analysis.profile;
      if (close > vah) bias = higherLow ? "LONG" : "NONE";
      else if (close < val) bias = lowerHigh ? "SHORT" : "NONE";
      else bias = "RANGE";
    }
    biasCache.set(key, bias);
    return bias;
  }

  /** Bias / zone checks when a setup forms. Returns false (and counts why) if it's filtered out. */
  function allowed(dir: Dir, z: Zone, bias: Bias): boolean {
    if (p.zoneQualityFilter && z.breaks > z.tests) {
      skips.weakZone++;
      return false;
    }
    if (!p.biasFilter) return true;
    if (bias === "NONE" || (bias === "LONG" && dir !== "LONG") || (bias === "SHORT" && dir !== "SHORT")) {
      skips.biasBlocked++;
      return false;
    }
    if (bias === "RANGE" && analysis?.profile) {
      const near = 0.25 * (analysis.atrHour || 0);
      const atEdge = bandDistance(analysis.profile.vah, z) <= near || bandDistance(analysis.profile.val, z) <= near;
      if (!atEdge) {
        skips.notAtValueEdge++;
        return false;
      }
    }
    return true;
  }

  function startSession(key: string, t: number) {
    day = key;
    sessionsTested++;
    lossesToday = 0;
    stoppedToday = false;
    setups = [];
    order = null;
    biasCache.clear();
    const h = hourly.slice(lowerBound(hourly, t - 150 * DAY), lowerBound(hourly, t - H1 + 1));
    const m = minute.slice(lowerBound(minute, t - 10 * DAY), lowerBound(minute, t));
    try {
      analysis = analyzeZones({ symbol, hourly: h, minute: m, asOf: t });
      zones = analysis.zones;
      sessionsWithZones++;
    } catch {
      analysis = null;
      zones = [];
      zoneErrors++;
    }
  }

  function closePosition(ts: number, exit: number, reason: Trade["exitReason"]) {
    if (!position) return;
    const { order: o, fill, fillTs } = position;
    const sign = o.setup.dir === "LONG" ? 1 : -1;
    const exitPx = roundToTick(exit, tick);
    const points = sign * (exitPx - fill);
    const risk = Math.abs(fill - o.stop);
    const r = risk > 0 ? points / risk : 0;
    trades.push({
      symbol: symbol.root,
      day: day ?? "",
      setup: o.setup.kind,
      dir: o.setup.dir,
      session: sessionOf(fillTs),
      bias: o.setup.bias,
      zone: o.setup.zone.label,
      signalTs: o.setup.signalTs,
      entryTs: fillTs,
      exitTs: ts,
      entry: fill,
      stop: o.stop,
      target: o.target,
      exit: exitPx,
      exitReason: reason,
      plannedRR: o.plannedRR,
      r,
      points,
      pnlUsd: points * pointValue - 2 * p.commissionPerSide,
    });
    if (r < 0) {
      lossesToday++;
      if (lossesToday >= p.maxLossesPerDay) stoppedToday = true;
    }
    position = null;
  }

  // ── 15m close: new setups, confirmations, invalidations ───────────────────
  let prev15: Bar | null = null;
  function on15(b: Bar) {
    const end = b.ts + M15;
    const pb = prev15;
    prev15 = b;
    if (!pb || tradingDay(pb.ts) !== tradingDay(b.ts) || zones.length === 0) return;

    // Existing setups
    setups = setups.filter((s) => {
      const z = s.zone;
      if (s.kind === "A") {
        if (s.awaitingConfirm) {
          const holds = s.dir === "LONG" ? b.close > z.top : b.close < z.bottom;
          if (!holds) return false;
          s.awaitingConfirm = false;
          s.activeFrom = end;
          s.expiresAt = end + p.retestBars15 * M15;
          return true;
        }
        // Closed back through the far side: the break failed.
        if (s.dir === "LONG" && b.close < z.bottom) return false;
        if (s.dir === "SHORT" && b.close > z.top) return false;
      } else {
        // Failed break turned into a real break.
        if (s.dir === "SHORT" && b.close > z.top) return false;
        if (s.dir === "LONG" && b.close < z.bottom) return false;
      }
      return end < s.expiresAt;
    });

    const bias = biasAt(end);
    const night = sessionOf(b.ts) === "ETH";
    for (const z of zones) {
      const candidates: { kind: "A" | "B"; dir: Dir; extreme: number }[] = [];
      if (p.setupA) {
        if (pb.close <= z.top && b.close > z.top) candidates.push({ kind: "A", dir: "LONG", extreme: b.low });
        if (pb.close >= z.bottom && b.close < z.bottom) candidates.push({ kind: "A", dir: "SHORT", extreme: b.high });
      }
      if (p.setupB) {
        if (pb.close <= z.top && b.high > z.top && b.close <= z.top) candidates.push({ kind: "B", dir: "SHORT", extreme: b.high });
        if (pb.close >= z.bottom && b.low < z.bottom && b.close >= z.bottom) candidates.push({ kind: "B", dir: "LONG", extreme: b.low });
      }
      for (const c of candidates) {
        if (setups.some((s) => s.kind === c.kind && s.dir === c.dir && s.zone === z)) continue;
        setupsSeen++;
        if (!allowed(c.dir, z, bias)) continue;
        const awaitingConfirm = c.kind === "A" && night && p.nightDoubleClose;
        const window = c.kind === "A" ? p.retestBars15 : p.failTriggerBars15;
        setups.push({
          kind: c.kind,
          dir: c.dir,
          zone: z,
          bias,
          signalTs: end,
          awaitingConfirm,
          activeFrom: end,
          expiresAt: awaitingConfirm ? end + M15 + window * M15 : end + window * M15,
          extreme: c.extreme,
        });
      }
    }
  }

  // ── 5m close: triggers ────────────────────────────────────────────────────
  function nextTarget(dir: Dir, entry: number, own: Zone): number | null {
    let best: number | null = null;
    for (const z of zones) {
      if (z === own) continue;
      if (dir === "LONG" && z.bottom > entry && (best === null || z.bottom < best)) best = z.bottom;
      if (dir === "SHORT" && z.top < entry && (best === null || z.top > best)) best = z.top;
    }
    return best;
  }

  function on5(c: Bar) {
    const end = c.ts + M5;
    const keep: Setup[] = [];
    for (const s of setups) {
      if (s.awaitingConfirm || c.ts < s.activeFrom) {
        keep.push(s);
        continue;
      }
      if (c.ts >= s.expiresAt) continue;
      const z = s.zone;
      let trigger = false;
      if (s.kind === "A") {
        if (s.dir === "LONG") {
          if (c.close < z.bottom) continue;
          trigger = c.low <= z.top && c.close > z.top && c.close > c.open;
        } else {
          if (c.close > z.top) continue;
          trigger = c.high >= z.bottom && c.close < z.bottom && c.close < c.open;
        }
      } else if (s.dir === "SHORT") {
        s.extreme = Math.max(s.extreme, c.high);
        trigger = c.close < c.open && c.close < z.top;
      } else {
        s.extreme = Math.min(s.extreme, c.low);
        trigger = c.close > c.open && c.close > z.bottom;
      }
      if (!trigger) {
        keep.push(s);
        continue;
      }

      // One attempt per setup: from here the setup is consumed whatever happens.
      if (position || order) {
        skips.busy++;
        continue;
      }
      if (stoppedToday) {
        skips.dailyStop++;
        continue;
      }
      const sess = sessionOf(end);
      if ((sess === "RTH" && !p.rth) || (sess === "ETH" && !p.eth)) {
        skips.sessionOff++;
        continue;
      }
      const clock = chicagoClock(end);
      if (clock.minutes >= LAST_ENTRY && clock.minutes < SESSION_OPEN) {
        skips.tooLate++;
        continue;
      }
      if (p.newsFilter && newsBlackout(end, symbol.root)) {
        skips.news++;
        continue;
      }

      const long = s.dir === "LONG";
      const entry = roundToTick(long ? c.high + tick : c.low - tick, tick);
      const stop =
        s.kind === "A"
          ? roundToTick(long ? Math.min(z.bottom, c.low) - buffer : Math.max(z.top, c.high) + buffer, tick)
          : roundToTick(long ? Math.min(s.extreme, z.bottom, c.low) - buffer : Math.max(s.extreme, z.top, c.high) + buffer, tick);
      const target = nextTarget(s.dir, entry, z);
      if (target === null) {
        skips.noTarget++;
        continue;
      }
      const risk = long ? entry - stop : stop - entry;
      const reward = long ? target - entry : entry - target;
      const rr = risk > 0 ? reward / risk : 0;
      if (rr < p.minRR) {
        skips.rrTooLow++;
        continue;
      }
      order = { setup: s, entry, stop, target, plannedRR: rr, placedAt: end, expiresAt: end + p.orderExpiryBars5 * M5 };
    }
    setups = keep;
  }

  // ── Main loop over 1m bars ────────────────────────────────────────────────
  let i5 = lowerBound(bars5, from);
  let i15 = lowerBound(bars15, from);
  const startIdx = lowerBound(minute, from);
  const endIdx = lowerBound(minute, to);
  if (i15 > 0) prev15 = bars15[i15 - 1];

  for (let i = startIdx; i < endIdx; i++) {
    const m = minute[i];

    // 1. Bars that closed before this minute: 5m first (existing setups), then 15m (new setups).
    while (true) {
      const e5 = i5 < bars5.length ? bars5[i5].ts + M5 : Infinity;
      const e15 = i15 < bars15.length ? bars15[i15].ts + M15 : Infinity;
      const next = Math.min(e5, e15);
      if (next > m.ts) break;
      if (e5 === next) on5(bars5[i5++]);
      else on15(bars15[i15++]);
    }

    // 2. New session: flatten anything left over and rebuild zones.
    const key = tradingDay(m.ts);
    if (key !== day) {
      if (position) closePosition(lastTs, lastClose, "EOD");
      startSession(key, m.ts);
    }

    // 3. Working order
    if (order && !position) {
      const o: Order = order;
      const long = o.setup.dir === "LONG";
      if (m.ts >= o.expiresAt) {
        skips.orderNotFilled++;
        order = null;
      } else {
        const hitEntry = long ? m.high >= o.entry : m.low <= o.entry;
        const hitStop = long ? m.low <= o.stop : m.high >= o.stop;
        if (hitEntry) {
          const fill = roundToTick(long ? Math.max(o.entry, m.open) + slip : Math.min(o.entry, m.open) - slip, tick);
          position = { order: o, fillTs: m.ts, fill };
          order = null;
          // Same-minute stop: assume the worst.
          if (hitStop) closePosition(m.ts, long ? o.stop - slip : o.stop + slip, "STOP");
        } else if (hitStop) {
          skips.orderNotFilled++;
          order = null;
        }
      }
    } else if (position && position.fillTs !== m.ts) {
      // 4. Open position
      const o = position.order;
      const long = o.setup.dir === "LONG";
      if (long ? m.low <= o.stop : m.high >= o.stop) {
        closePosition(m.ts, long ? Math.min(o.stop, m.open) - slip : Math.max(o.stop, m.open) + slip, "STOP");
      } else if (long ? m.high >= o.target + tick : m.low <= o.target - tick) {
        closePosition(m.ts, o.target, "TARGET");
      }
    }

    // 5. Flatten before the daily close.
    const clock = chicagoClock(m.ts);
    if (clock.minutes >= FLATTEN && clock.minutes < SESSION_OPEN) {
      if (position) closePosition(m.ts, m.close, "EOD");
      order = null;
      setups = [];
    }

    lastClose = m.close;
    lastTs = m.ts;
  }
  if (position) closePosition(lastTs, lastClose, "EOD");

  if (zoneErrors > 0) notes.push(`${zoneErrors} session(s) skipped — not enough history to build zones.`);
  if (sessionsWithZones === 0) notes.push("No sessions had zones. Download more history first.");

  return {
    symbol: symbol.root,
    from,
    to,
    params: p,
    sessionsTested,
    sessionsWithZones,
    setupsSeen,
    trades,
    skips,
    notes,
  };
}
