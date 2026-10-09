/** Walk-forward Breakout Lab: every 15m close through a zone, read at the close, outcome measured after. */
import type { Bar } from "@/lib/futures/types";
import { aggregate } from "@/lib/futures/sessions";
import type { FuturesSymbol } from "@/lib/futures/symbols";
import { analyzeZones, type Zone } from "@/lib/indicators/zones";
import { failureOutcome, outcome, prepareContext, readBreak, readFailure, type BreakoutContext } from "@/lib/indicators/breakout";
import type { FailureRow, StudyRow } from "@/lib/indicators/breakoutStats";

const M15 = 15 * 60_000;
const H1 = 60 * 60_000;
const DAY = 86_400_000;

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

/** Zone breaks on bar i (close through, coming from the other side). */
export function zoneBreaks(ctx: BreakoutContext, i: number, zones: Zone[]): { zone: Zone; dir: "LONG" | "SHORT" }[] {
  const b = ctx.bars[i];
  const p = ctx.bars[i - 1];
  const out: { zone: Zone; dir: "LONG" | "SHORT" }[] = [];
  for (const z of zones) {
    if (p.close <= z.top && b.close > z.top) out.push({ zone: z, dir: "LONG" });
    else if (p.close >= z.bottom && b.close < z.bottom) out.push({ zone: z, dir: "SHORT" });
  }
  return out;
}

/** False breaks on bar i: wick through a zone edge, close back inside, coming from inside. */
export function zoneFailures(ctx: BreakoutContext, i: number, zones: Zone[]): { zone: Zone; dir: "LONG" | "SHORT" }[] {
  const b = ctx.bars[i];
  const p = ctx.bars[i - 1];
  const out: { zone: Zone; dir: "LONG" | "SHORT" }[] = [];
  for (const z of zones) {
    if (p.close <= z.top && b.high > z.top && b.close <= z.top) out.push({ zone: z, dir: "SHORT" });
    else if (p.close >= z.bottom && b.low < z.bottom && b.close >= z.bottom) out.push({ zone: z, dir: "LONG" });
  }
  return out;
}

export function runBreakoutStudy(input: { symbol: FuturesSymbol; minute: Bar[]; hourly: Bar[]; from: number; to: number }): {
  rows: StudyRow[];
  failures: FailureRow[];
  sessions: number;
} {
  const minute = [...input.minute].sort((a, b) => a.ts - b.ts);
  const hourly = [...input.hourly].sort((a, b) => a.ts - b.ts);
  const ctx = prepareContext(aggregate(minute, M15), hourly);
  const rows: StudyRow[] = [];
  const failures: FailureRow[] = [];
  const lastFail = new Map<string, number>();
  let zones: Zone[] = [];
  let curDay = "";
  let sessions = 0;
  const lastBreak = new Map<string, number>();

  for (let i = 30; i < ctx.bars.length - 1; i++) {
    const b = ctx.bars[i];
    if (b.ts < input.from || b.ts >= input.to) continue;
    if (ctx.day[i] !== curDay) {
      curDay = ctx.day[i];
      const t = b.ts;
      try {
        zones = analyzeZones({
          symbol: input.symbol,
          hourly: hourly.slice(lowerBound(hourly, t - 150 * DAY), lowerBound(hourly, t - H1 + 1)),
          minute: minute.slice(lowerBound(minute, t - 10 * DAY), lowerBound(minute, t)),
          asOf: t,
        }).zones;
        sessions++;
      } catch {
        zones = [];
      }
      lastBreak.clear();
      lastFail.clear();
    }
    for (const { zone, dir } of zoneBreaks(ctx, i, zones)) {
      const key = `${zone.price}|${dir}`;
      if ((lastBreak.get(key) ?? -99) >= i - 4) continue;
      lastBreak.set(key, i);
      const read = readBreak(ctx, i, dir, zone.label);
      const o = outcome(ctx, i, dir, zone.top, zone.bottom);
      rows.push({
        symbol: input.symbol.root,
        ts: read.ts,
        dir,
        level: zone.label,
        score: read.score,
        quality: read.quality,
        features: read.features,
        ...o,
      });
    }
    for (const { zone, dir } of zoneFailures(ctx, i, zones)) {
      const key = `${zone.price}|${dir}`;
      if ((lastFail.get(key) ?? -99) >= i - 4) continue;
      lastFail.set(key, i);
      failures.push({
        symbol: input.symbol.root,
        ts: ctx.bars[i].ts + M15,
        dir,
        level: zone.label,
        features: readFailure(ctx, i, dir),
        ...failureOutcome(ctx, i, dir),
      });
    }
  }
  return { rows, failures, sessions };
}
