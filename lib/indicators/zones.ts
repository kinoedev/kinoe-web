/**
 * Auto key-level zones — Kinoe's weekly level routine, as code.
 *
 * Conventions encoded here:
 *  - Week-scoped set: 5-session range high/low, last session's day high/low,
 *    VAH / POC / VAL, and the outer swing high/low.
 *  - Swings are the OUTER levels: the swing high sits above the range high and
 *    the swing low below the range low — the range nests inside the swings.
 *  - Long-term structural levels come from repeated 60-minute pivots.
 *  - Every zone is judged on 60-minute behaviour: a "test" is a visit that gets
 *    rejected; a "break" is a visit that closes out the other side.
 *  - Levels sitting in thin (low-volume) parts of the profile score higher.
 *  - Output is capped at 3–5 rectangle zones, labelled "price — reason".
 */
import type { Bar } from "@/lib/futures/types";
import { atr, groupSessions, isSessionComplete, type Session } from "@/lib/futures/sessions";
import { formatPrice, roundToTick, type FuturesSymbol } from "@/lib/futures/symbols";
import { buildProfile, isLowVolumeAt, type VolumeProfile } from "./profile";

export type LevelKind =
  | "WEEK_HIGH"
  | "WEEK_LOW"
  | "DAY_HIGH"
  | "DAY_LOW"
  | "SWING_HIGH"
  | "SWING_LOW"
  | "POC"
  | "VAH"
  | "VAL"
  | "LVN"
  | "STRUCTURE"
  | "LOOKBACK_HIGH"
  | "LOOKBACK_LOW";

export type Level = {
  kind: LevelKind;
  name: string;
  price: number;
  scope: "week" | "structural";
  baseScore: number;
};

export type Zone = {
  side: "resistance" | "support";
  price: number;
  top: number;
  bottom: number;
  members: Level[];
  tests: number;
  breaks: number;
  testingNow: boolean;
  lowVolume: boolean;
  score: number;
  label: string;
};

export type WeekLevel = Level & { tests: number; breaks: number; lowVolume: boolean; label: string };

export type ZoneAnalysis = {
  symbol: string;
  asOf: number;
  lastPrice: number;
  weekStart: string;
  weekEnd: string;
  atrHour: number;
  atrDay: number;
  profile: Pick<VolumeProfile, "poc" | "vah" | "val" | "lvns"> | null;
  weekSet: WeekLevel[];
  zones: Zone[];
  nested: boolean;
  proximity: { status: "IN_ZONE" | "APPROACHING" | "CLEAR"; zone: Zone | null; distance: number; distanceAtr: number };
  notes: string[];
};

export type ZoneInput = {
  symbol: FuturesSymbol;
  /** 60-minute bars, ideally 3–6 months for structure. */
  hourly: Bar[];
  /** 1-minute bars covering at least the last week, for a sharp profile. Optional. */
  minute?: Bar[];
  /** Latest time the data covers (defaults to the last bar). */
  asOf?: number;
  weekSessions?: number;
  minZones?: number;
  maxZones?: number;
  /** Sessions of 60m history used to count tests/breaks (default 20 ≈ one month). */
  testLookbackSessions?: number;
};

const NAMES: Record<LevelKind, string> = {
  WEEK_HIGH: "Week high",
  WEEK_LOW: "Week low",
  DAY_HIGH: "Day high",
  DAY_LOW: "Day low",
  SWING_HIGH: "Swing high",
  SWING_LOW: "Swing low",
  POC: "POC",
  VAH: "VAH",
  VAL: "VAL",
  LVN: "LVN",
  STRUCTURE: "Structure",
  LOOKBACK_HIGH: "Lookback high",
  LOOKBACK_LOW: "Lookback low",
};

const BASE_SCORE: Record<LevelKind, number> = {
  WEEK_HIGH: 30,
  WEEK_LOW: 30,
  SWING_HIGH: 24,
  SWING_LOW: 24,
  POC: 24,
  DAY_HIGH: 22,
  DAY_LOW: 22,
  LOOKBACK_HIGH: 22,
  LOOKBACK_LOW: 22,
  VAH: 20,
  VAL: 20,
  LVN: 18,
  STRUCTURE: 16,
};

type Pivot = { idx: number; price: number; type: "high" | "low" };

function pivots(bars: Bar[], k: number): Pivot[] {
  const out: Pivot[] = [];
  for (let i = k; i < bars.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (bars[j].high >= bars[i].high) isHigh = false;
      if (bars[j].low <= bars[i].low) isLow = false;
    }
    if (isHigh) out.push({ idx: i, price: bars[i].high, type: "high" });
    if (isLow) out.push({ idx: i, price: bars[i].low, type: "low" });
  }
  return out;
}

/**
 * Count visits to a zone on 60-minute bars. A visit is a run of consecutive bars
 * that touch the zone. It's a test if price leaves on the side it came from and
 * a break if it closes out the other side. A visit still in progress is flagged
 * rather than counted.
 */
export function countTests(bars: Bar[], bottom: number, top: number) {
  const sideOf = (close: number): "above" | "below" | "inside" =>
    close > top ? "above" : close < bottom ? "below" : "inside";

  let tests = 0;
  let breaks = 0;
  let inVisit = false;
  let entry: "above" | "below" | "inside" | null = null;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const touched = b.high >= bottom && b.low <= top;
    if (touched && !inVisit) {
      inVisit = true;
      // The bar before a visit didn't touch the zone, so its close is clearly above or below.
      entry = i > 0 ? sideOf(bars[i - 1].close) : null;
    } else if (!touched && inVisit) {
      // First bar fully clear of the zone decides how the visit ended.
      const exit = sideOf(b.close);
      if (entry === "above" || entry === "below") {
        if (exit === entry) tests++;
        else breaks++;
      }
      inVisit = false;
      entry = null;
    }
  }
  return { tests, breaks, testingNow: inVisit };
}

function makeLevel(kind: LevelKind, price: number, scope: Level["scope"], tick: number, nameOverride?: string, bonus = 0): Level {
  return { kind, name: nameOverride ?? NAMES[kind], price: roundToTick(price, tick), scope, baseScore: BASE_SCORE[kind] + bonus };
}

function clusterStructure(piv: Pivot[], mergeDist: number, tick: number): Level[] {
  const sorted = [...piv].sort((a, b) => a.price - b.price);
  const clusters: Pivot[][] = [];
  for (const p of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && p.price - last[0].price <= mergeDist) last.push(p);
    else clusters.push([p]);
  }
  return clusters
    .filter((c) => c.length >= 4)
    .map((c) => {
      const prices = c.map((p) => p.price).sort((a, b) => a - b);
      const median = prices[Math.floor(prices.length / 2)];
      return makeLevel("STRUCTURE", median, "structural", tick, `Structure (${c.length} pivots)`, Math.min(12, (c.length - 4) * 2));
    });
}

function testsText(tests: number, breaks: number) {
  return `${tests} test${tests === 1 ? "" : "s"}, ${breaks} break${breaks === 1 ? "" : "s"}`;
}

export function analyzeZones(input: ZoneInput): ZoneAnalysis {
  const { symbol } = input;
  const tick = symbol.tick;
  const weekN = input.weekSessions ?? 5;
  const minZones = input.minZones ?? 3;
  const maxZones = input.maxZones ?? 5;
  const testSessions = input.testLookbackSessions ?? 20;
  const notes: string[] = [];

  const hourly = [...input.hourly].sort((a, b) => a.ts - b.ts);
  const minute = [...(input.minute ?? [])].sort((a, b) => a.ts - b.ts);
  if (hourly.length < 50) throw new Error(`${symbol.root}: not enough hourly data (${hourly.length} bars)`);

  const lastHour = hourly[hourly.length - 1];
  const lastMin = minute[minute.length - 1];
  const asOf = input.asOf ?? Math.max(lastHour.ts + 3_600_000, lastMin ? lastMin.ts + 60_000 : 0);
  const lastPrice = lastMin && lastMin.ts > lastHour.ts ? lastMin.close : lastHour.close;

  const sessions = groupSessions(hourly);
  const completed = sessions.filter((s) => isSessionComplete(s.key, asOf));
  if (completed.length < weekN) throw new Error(`${symbol.root}: need ${weekN} completed sessions, have ${completed.length}`);

  const testFrom = sessions[Math.max(0, sessions.length - testSessions)].start;
  const testBars = hourly.filter((b) => b.ts >= testFrom);

  const week: Session[] = completed.slice(-weekN);
  const day = completed[completed.length - 1];
  const weekHigh = Math.max(...week.map((s) => s.high));
  const weekLow = Math.min(...week.map((s) => s.low));

  const atrHour = atr(hourly, 14);
  const atrDay = atr(
    completed.map((s) => ({ ts: s.start, open: s.open, high: s.high, low: s.low, close: s.close, volume: s.volume })),
    14
  );
  const tol = Math.max(2 * tick, 0.08 * atrHour);
  const halfWidth = Math.max(2 * tick, 0.1 * atrHour);
  const mergeDist = Math.max(2 * tol, 0.25 * atrHour);

  // ── Volume profile for the week (1m preferred, 60m fallback) ──────────────
  const weekFrom = week[0].start;
  const weekTo = week[week.length - 1].end + 3_600_000;
  const weekMinute = minute.filter((b) => b.ts >= weekFrom && b.ts < weekTo);
  const profileBars = weekMinute.length > 500 ? weekMinute : hourly.filter((b) => b.ts >= weekFrom && b.ts < weekTo);
  if (profileBars !== weekMinute) notes.push("Volume profile built from 60m bars (1m data unavailable) — VAH/POC/VAL are approximate.");
  const profile = buildProfile(profileBars, tick);
  // Profile edges are always thin, so only flag thin spots inside the profile's range.
  const edge = profile ? profile.volumes.length * profile.bucketSize * 0.1 : 0;
  const pLo = profile ? profile.base + edge : 0;
  const pHi = profile ? profile.base + profile.volumes.length * profile.bucketSize - edge : 0;
  const thinAt = (price: number) => !!profile && price > pLo && price < pHi && isLowVolumeAt(profile, price);

  // ── Week-scoped levels ────────────────────────────────────────────────────
  const levels: Level[] = [
    makeLevel("WEEK_HIGH", weekHigh, "week", tick),
    makeLevel("WEEK_LOW", weekLow, "week", tick),
    makeLevel("DAY_HIGH", day.high, "week", tick),
    makeLevel("DAY_LOW", day.low, "week", tick),
  ];
  if (profile) {
    levels.push(makeLevel("POC", profile.poc, "week", tick), makeLevel("VAH", profile.vah, "week", tick), makeLevel("VAL", profile.val, "week", tick));
    for (const lvn of profile.lvns) levels.push(makeLevel("LVN", lvn, "week", tick));
  }

  // ── Outer swings: nearest 60m pivot beyond the week range ─────────────────
  const piv = pivots(hourly, 4);
  const lookbackHigh = Math.max(...hourly.map((b) => b.high));
  const lookbackLow = Math.min(...hourly.map((b) => b.low));
  const swingHighs = piv.filter((p) => p.type === "high" && p.price > weekHigh + mergeDist).sort((a, b) => a.price - b.price);
  const swingLows = piv.filter((p) => p.type === "low" && p.price < weekLow - mergeDist).sort((a, b) => b.price - a.price);
  let swingHigh: number | null = swingHighs[0]?.price ?? null;
  let swingLow: number | null = swingLows[0]?.price ?? null;
  if (swingHigh === null && lookbackHigh > weekHigh + mergeDist) swingHigh = lookbackHigh;
  if (swingLow === null && lookbackLow < weekLow - mergeDist) swingLow = lookbackLow;
  if (swingHigh !== null) levels.push(makeLevel("SWING_HIGH", swingHigh, "week", tick));
  else notes.push("Week high is the highest price in the lookback — no outer swing high above it.");
  if (swingLow !== null) levels.push(makeLevel("SWING_LOW", swingLow, "week", tick));
  else notes.push("Week low is the lowest price in the lookback — no outer swing low below it.");
  const nested = (swingHigh === null || swingHigh > weekHigh) && (swingLow === null || swingLow < weekLow);

  // ── Long-term structure ───────────────────────────────────────────────────
  const sessionsInLookback = sessions.length;
  if (swingHigh !== lookbackHigh && lookbackHigh > weekHigh)
    levels.push(makeLevel("LOOKBACK_HIGH", lookbackHigh, "structural", tick, `${sessionsInLookback}-session high`));
  if (swingLow !== lookbackLow && lookbackLow < weekLow)
    levels.push(makeLevel("LOOKBACK_LOW", lookbackLow, "structural", tick, `${sessionsInLookback}-session low`));
  levels.push(...clusterStructure(piv, mergeDist, tick));

  // ── Score each level on its own (for the full weekly set) ─────────────────
  const fmt = (p: number) => formatPrice(p, tick);
  const weekSet: WeekLevel[] = levels
    .filter((l) => l.scope === "week")
    .map((l) => {
      const t = countTests(testBars, l.price - halfWidth, l.price + halfWidth);
      const lowVolume = thinAt(l.price);
      return { ...l, ...t, lowVolume, label: `${fmt(l.price)} — ${l.name} · ${testsText(t.tests, t.breaks)}${lowVolume ? " · low-volume" : ""}` };
    })
    .sort((a, b) => b.price - a.price);

  // ── Merge nearby levels into rectangle zones ──────────────────────────────
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const groups: Level[][] = [];
  for (const l of sorted) {
    const g = groups[groups.length - 1];
    if (g && l.price - g[0].price <= mergeDist) g.push(l);
    else groups.push([l]);
  }

  const zones: Zone[] = groups.map((members) => {
    const lead = [...members].sort((a, b) => b.baseScore - a.baseScore)[0];
    const bottom = roundToTick(Math.min(...members.map((m) => m.price)) - halfWidth, tick);
    const top = roundToTick(Math.max(...members.map((m) => m.price)) + halfWidth, tick);
    const { tests, breaks, testingNow } = countTests(testBars, bottom, top);
    const lowVolume = members.some((m) => m.kind === "LVN" || thinAt(m.price));

    const distance = lastPrice > top ? lastPrice - top : lastPrice < bottom ? bottom - lastPrice : 0;
    const distAtr = atrDay > 0 ? distance / atrDay : 0;
    let score = lead.baseScore + 8 * (new Set(members.map((m) => m.kind)).size - 1);
    score += Math.min(30, tests * 5) - Math.min(30, breaks * 8);
    if (lowVolume) score += 15;
    if (distAtr <= 1) score += 10;
    else if (distAtr <= 2) score += 5;
    else if (distAtr > 5) score -= 40;
    else if (distAtr > 3) score -= 15;

    const mid = (top + bottom) / 2;
    const side: Zone["side"] = bottom > lastPrice ? "resistance" : top < lastPrice ? "support" : lastPrice >= mid ? "support" : "resistance";
    const structurePivots = members.filter((m) => m.kind === "STRUCTURE").reduce((n, m) => n + Number(m.name.match(/\d+/)?.[0] ?? 0), 0);
    const names = [
      ...new Set(
        members
          .sort((a, b) => b.baseScore - a.baseScore)
          .map((m) => (m.kind === "STRUCTURE" ? `Structure (${structurePivots} pivots)` : m.name))
      ),
    ];
    const label = `${fmt(lead.price)} — ${names.join(" + ")} · ${testsText(tests, breaks)}${lowVolume ? " · low-volume" : ""}`;

    return { side, price: lead.price, top, bottom, members, tests, breaks, testingNow, lowVolume, score, label };
  });

  // ── Pick 3–5, making sure both sides of price are represented ─────────────
  // Keep picked zones at least half an hourly ATR apart so the chart isn't crowded.
  const minGap = 0.5 * atrHour;
  const gap = (a: Zone, b: Zone) => Math.max(0, Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top));
  const spaced = (z: Zone, list: Zone[]) => list.every((p) => gap(p, z) >= minGap);
  const ranked = [...zones].sort((a, b) => b.score - a.score);
  const picked: Zone[] = [];
  // The weekly set leads; long-term structure alone fills at most two slots.
  const structuralOnly = (z: Zone) => z.members.every((m) => m.scope === "structural");
  const maxStructural = 2;
  for (const z of ranked) {
    if (picked.length >= maxZones) break;
    if (structuralOnly(z) && picked.filter(structuralOnly).length >= maxStructural) continue;
    if (spaced(z, picked)) picked.push(z);
  }
  for (const side of ["resistance", "support"] as const) {
    if (!picked.some((z) => z.side === side)) {
      const best = ranked.find((z) => z.side === side && !picked.includes(z) && spaced(z, picked));
      if (best) {
        if (picked.length >= maxZones) picked.pop();
        picked.push(best);
      }
    }
  }
  while (picked.length < minZones && ranked.length > picked.length) {
    const next = ranked.find((z) => !picked.includes(z) && spaced(z, picked)) ?? ranked.find((z) => !picked.includes(z));
    if (!next) break;
    picked.push(next);
  }
  const finalZones = picked.sort((a, b) => b.price - a.price);

  // ── Scanner proximity ─────────────────────────────────────────────────────
  let nearest: Zone | null = null;
  let nearestDist = Infinity;
  for (const z of finalZones) {
    const d = lastPrice > z.top ? lastPrice - z.top : lastPrice < z.bottom ? z.bottom - lastPrice : 0;
    if (d < nearestDist) {
      nearestDist = d;
      nearest = z;
    }
  }
  const distanceAtr = atrHour > 0 && Number.isFinite(nearestDist) ? nearestDist / atrHour : Infinity;
  const status = nearestDist === 0 ? "IN_ZONE" : distanceAtr <= 1 ? "APPROACHING" : "CLEAR";

  return {
    symbol: symbol.root,
    asOf,
    lastPrice,
    weekStart: week[0].key,
    weekEnd: week[week.length - 1].key,
    atrHour,
    atrDay,
    profile: profile ? { poc: profile.poc, vah: profile.vah, val: profile.val, lvns: profile.lvns } : null,
    weekSet,
    zones: finalZones,
    nested,
    proximity: { status, zone: nearest, distance: Number.isFinite(nearestDist) ? nearestDist : 0, distanceAtr: Number.isFinite(distanceAtr) ? distanceAtr : 0 },
    notes,
  };
}
