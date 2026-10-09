/** Aggregate Breakout Lab rows: which features actually separate follow-through from failure. */
import type { BreakFeatures, Quality } from "./breakout";

export type StudyRow = {
  symbol: string;
  ts: number;
  dir: "LONG" | "SHORT";
  level: string;
  score: number;
  quality: Quality;
  features: BreakFeatures;
  followed: boolean;
  failed: boolean;
  mfeAtr: number;
  maeAtr: number;
};

export type Bucket = { label: string; n: number; follow: number; fail: number; avgMfe: number; avgMae: number };

function bucket(label: string, rows: StudyRow[]): Bucket {
  const n = rows.length;
  const avg = (f: (r: StudyRow) => number) => (n ? rows.reduce((s, r) => s + f(r), 0) / n : 0);
  return {
    label,
    n,
    follow: n ? rows.filter((r) => r.followed).length / n : 0,
    fail: n ? rows.filter((r) => r.failed).length / n : 0,
    avgMfe: avg((r) => r.mfeAtr),
    avgMae: avg((r) => r.maeAtr),
  };
}

export type FeatureLift = { feature: string; with: Bucket; without: Bucket; lift: number };

const FEATURES: [string, (f: BreakFeatures) => boolean][] = [
  ["Displacement candle", (f) => f.displacement],
  ["Fair value gap", (f) => f.fvg],
  ["Volume ≥ 1.5× normal", (f) => (f.relVol ?? 0) >= 1.5],
  ["Volume < 0.8× normal", (f) => f.relVol !== null && f.relVol < 0.8],
  ["Swept opposite liquidity first", (f) => !!f.sweptOppositeFirst],
  ["Only wicked through liquidity", (f) => !!f.sweepOnBreak],
  ["Untaken liquidity ahead", (f) => !!f.drawAhead],
  ["Stochastic divergence", (f) => f.divergence],
  ["With 1H trend", (f) => f.trend === "WITH"],
  ["Against 1H trend", (f) => f.trend === "AGAINST"],
  ["RTH open (8:30–11 CT)", (f) => f.session === "RTH_OPEN"],
  ["Evening (5pm–2am CT)", (f) => f.session === "EVENING"],
];

export function studySummary(rows: StudyRow[]) {
  const overall = bucket("All breaks", rows);
  const byQuality = (["STRONG", "WEAK", "TRAP"] as Quality[]).map((q) => bucket(q === "STRONG" ? "Strong" : q === "WEAK" ? "Weak" : "Likely trap", rows.filter((r) => r.quality === q)));
  const features: FeatureLift[] = FEATURES.map(([name, test]) => {
    const w = bucket(name, rows.filter((r) => test(r.features)));
    const wo = bucket(`not ${name}`, rows.filter((r) => !test(r.features)));
    return { feature: name, with: w, without: wo, lift: w.n && wo.n ? w.follow - wo.follow : 0 };
  });
  const bySymbol = [...new Set(rows.map((r) => r.symbol))].sort().map((s) => bucket(s, rows.filter((r) => r.symbol === s)));
  return { overall, byQuality, features, bySymbol };
}

/**
 * Is a follow-rate difference bigger than noise? Two-proportion z-test. |z| ≥ 2.6 (≈ p < 0.01)
 * because a dozen features are tested at once — at p < 0.05 one would "pass" by luck alone.
 */
export function significant(a: Bucket, b: Bucket): boolean {
  if (a.n < 30 || b.n < 30) return false;
  const p = (a.follow * a.n + b.follow * b.n) / (a.n + b.n);
  const se = Math.sqrt(p * (1 - p) * (1 / a.n + 1 / b.n));
  return se > 0 && Math.abs(a.follow - b.follow) / se >= 2.6;
}
