import type { Trade } from "./engine";

export type Stats = {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWinR: number;
  avgLossR: number;
  /** Average R per trade — the edge. */
  expectancyR: number;
  totalR: number;
  /** Gross R won / gross R lost. Infinity when there are no losses. */
  profitFactor: number;
  /** Largest peak-to-trough drop of the cumulative R curve. */
  maxDrawdownR: number;
  totalUsd: number;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export function computeStats(trades: Trade[]): Stats {
  const ordered = [...trades].sort((a, b) => a.exitTs - b.exitTs);
  const winsR = ordered.filter((t) => t.r > 0).map((t) => t.r);
  const lossesR = ordered.filter((t) => t.r <= 0).map((t) => t.r);
  const grossWin = winsR.reduce((s, r) => s + r, 0);
  const grossLoss = -lossesR.reduce((s, r) => s + r, 0);

  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  for (const t of ordered) {
    equity += t.r;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  }

  return {
    trades: ordered.length,
    wins: winsR.length,
    losses: lossesR.length,
    winRate: ordered.length ? winsR.length / ordered.length : 0,
    avgWinR: mean(winsR),
    avgLossR: mean(lossesR),
    expectancyR: mean(ordered.map((t) => t.r)),
    totalR: equity,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    maxDrawdownR: maxDd,
    totalUsd: ordered.reduce((s, t) => s + t.pnlUsd, 0),
  };
}

export type Breakdown = { label: string; stats: Stats }[];

export function breakdown(trades: Trade[]): Breakdown {
  const groups: [string, (t: Trade) => boolean][] = [
    ["Setup A · break & retest", (t) => t.setup === "A"],
    ["Setup B · failed break", (t) => t.setup === "B"],
    ["RTH (8:30–3:00 CT)", (t) => t.session === "RTH"],
    ["Evening / Globex", (t) => t.session === "ETH"],
    ["Longs", (t) => t.dir === "LONG"],
    ["Shorts", (t) => t.dir === "SHORT"],
  ];
  const symbols = [...new Set(trades.map((t) => t.symbol))].sort();
  if (symbols.length > 1) for (const s of symbols) groups.push([s, (t) => t.symbol === s]);
  return groups.map(([label, f]) => ({ label, stats: computeStats(trades.filter(f)) })).filter((g) => g.stats.trades > 0);
}

/** Plain-language read of the numbers. */
export function verdict(s: Stats): { tone: "good" | "meh" | "bad" | "thin"; text: string } {
  if (s.trades < 30) return { tone: "thin", text: `Only ${s.trades} trades — too few to judge an edge. Add days or symbols.` };
  if (s.expectancyR >= 0.2) return { tone: "good", text: `+${s.expectancyR.toFixed(2)}R per trade over ${s.trades} trades. Promising — forward test it on sim before sizing up.` };
  if (s.expectancyR > 0) return { tone: "meh", text: `+${s.expectancyR.toFixed(2)}R per trade — positive but thin. Check the breakdown for the part that carries it.` };
  return { tone: "bad", text: `${s.expectancyR.toFixed(2)}R per trade — no edge in this sample. Change one rule at a time and retest.` };
}
