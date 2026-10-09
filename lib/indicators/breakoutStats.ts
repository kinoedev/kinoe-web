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

// ── Plain-English read of a study ───────────────────────────────────────────

const PLAIN: Record<string, { helps: string; warns: string; what: string }> = {
  "Displacement candle": {
    what: "a big-bodied 15m candle (at least one normal candle's range) that closes near its high (or low, for shorts)",
    helps: "Only take breaks where the 15m candle is big and closes strong. Skip breaks made by small or wicky candles.",
    warns: "Big displacement candles are failing more often here — wait for a retest instead of entering on the break candle.",
  },
  "Fair value gap": {
    what: "a gap left between the candle two bars back and the break candle",
    helps: "Favour breaks that leave a fair value gap — and use the gap as your retest entry.",
    warns: "Breaks that leave a fair value gap are failing more often — expect the gap to get filled before any continuation.",
  },
  "Volume ≥ 1.5× normal": {
    what: "the break candle traded at least 1.5× the usual volume for that time of day",
    helps: "Favour breaks on heavy volume.",
    warns: "Heavy-volume breaks are failing more often here — they may be exhaustion moves.",
  },
  "Volume < 0.8× normal": {
    what: "the break candle traded less than 0.8× the usual volume for that time of day",
    helps: "Light-volume breaks are holding better than expected here.",
    warns: "Skip breaks on light volume.",
  },
  "Swept opposite liquidity first": {
    what: "price ran the stops on the other side (e.g. took the previous day's low) shortly before breaking",
    helps: "Favour breaks that come right after a stop run on the other side.",
    warns: "Breaks right after a stop run are failing more often here.",
  },
  "Only wicked through liquidity": {
    what: "the break candle poked through an obvious high/low but closed back inside it",
    helps: "Wick-only breaks are holding better than expected here.",
    warns: "Treat a candle that only wicks through an obvious high/low as a trap — fade it, don't chase it.",
  },
  "Untaken liquidity ahead": {
    what: "an untouched high/low (stops) sits within 3 ATR in the break direction",
    helps: "Favour breaks with an untouched high/low ahead to draw price.",
    warns: "Breaks with untouched liquidity ahead are failing more often here.",
  },
  "Stochastic divergence": {
    what: "price made a new high/low but the stochastic didn't",
    helps: "Divergence isn't stopping these breaks — don't skip a break just because of it.",
    warns: "Skip breaks that come with stochastic divergence.",
  },
  "With 1H trend": {
    what: "the 1H chart is making higher highs and lows in the break direction (or lower, for shorts)",
    helps: "Favour breaks in the direction of the 1H trend.",
    warns: "With-trend breaks are failing more often here — late in the move?",
  },
  "Against 1H trend": {
    what: "the break goes against the 1H trend",
    helps: "Counter-trend breaks are holding better than expected here.",
    warns: "Skip breaks against the 1H trend.",
  },
  "RTH open (8:30–11 CT)": {
    what: "the break happened between 8:30 and 11:00 CT",
    helps: "Breaks in the first 2½ hours of the day session follow through more often.",
    warns: "Avoid breakout trades between 8:30 and 11:00 CT.",
  },
  "Evening (5pm–2am CT)": {
    what: "the break happened in the evening Globex session",
    helps: "Evening-session breaks follow through more often.",
    warns: "Evening-session breaks fail more often — be pickier at night.",
  },
};

export type StudyExplanation = {
  headline: string;
  label: string;
  helps: { feature: string; what: string; rule: string; detail: string }[];
  warns: { feature: string; what: string; rule: string; detail: string }[];
  unclear: string[];
  caveat: string | null;
};

const p0 = (x: number) => `${Math.round(x * 100)}%`;

export function explainStudy(s: ReturnType<typeof studySummary>): StudyExplanation {
  const base = s.overall.follow;
  const headline =
    `${s.overall.n.toLocaleString()} zone breaks: ${p0(base)} kept going (ran 1 ATR past the close), ${p0(s.overall.fail)} closed back inside. ` +
    (Math.abs(base - 0.5) < 0.06
      ? "On their own, breaks are close to a coin flip — the edge has to come from which breaks you take."
      : base > 0.5
        ? "Breaks lean toward continuing on these contracts."
        : "Breaks lean toward failing on these contracts — fading weak breaks may pay more than chasing.");

  const [strong, , trap] = s.byQuality;
  const strongEdge = strong.n >= 30 ? strong.follow - base : 0;
  const trapEdge = trap.n >= 30 ? base - trap.follow : 0;
  const label =
    strong.n < 30
      ? "Not enough Strong breaks yet to judge the label."
      : `Strong breaks kept going ${p0(strong.follow)} of the time vs ${p0(base)} for all breaks (${strongEdge >= 0 ? "+" : ""}${Math.round(strongEdge * 100)} pts)` +
        (trap.n >= 30 ? `; Likely-trap breaks ${p0(trap.follow)} (${trapEdge >= 0 ? "−" : "+"}${Math.abs(Math.round(trapEdge * 100))} pts). ` : ". ") +
        (strongEdge >= 0.05 && trapEdge >= 0.05
          ? "The label is doing its job: take Strong, skip Likely trap."
          : strongEdge >= 0.05
            ? "Strong is worth following; the trap label isn't separating losers yet."
            : "The label isn't separating good from bad breaks yet — lean on the features marked as helping below.");

  const helps: StudyExplanation["helps"] = [];
  const warns: StudyExplanation["warns"] = [];
  const unclear: string[] = [];
  for (const f of s.features) {
    const plain = PLAIN[f.feature];
    const detail = `${p0(f.with.follow)} with (${f.with.n}) vs ${p0(f.without.follow)} without`;
    if (significant(f.with, f.without) && plain) {
      (f.lift > 0 ? helps : warns).push({ feature: f.feature, what: plain.what, rule: f.lift > 0 ? plain.helps : plain.warns, detail });
    } else if (Math.abs(f.lift) >= 0.08 && f.with.n < 100) {
      unclear.push(`${f.feature}: ${f.lift > 0 ? "+" : ""}${Math.round(f.lift * 100)} pts but only ${f.with.n} breaks — watch it, don't trade it yet.`);
    }
  }
  const caveat =
    s.overall.n < 300
      ? "Fewer than 300 breaks — treat every conclusion as provisional and re-run with more days."
      : "These are follow-through rates, not profits: a rule that helps here still needs a stop, a target and the backtester to prove it pays.";
  return { headline, label, helps, warns, unclear, caveat };
}
