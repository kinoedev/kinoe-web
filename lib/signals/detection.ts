// ─── Core candle types ────────────────────────────────────────────────────────

export type OandaCandle = {
  complete: boolean;
  time: string;
  mid: { o: string; h: string; l: string; c: string };
};

export type ParsedCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export function parseCandles(candles: OandaCandle[]): ParsedCandle[] {
  return candles
    .filter((c) => c.complete)
    .map((c) => ({
      time: c.time,
      open: Number(c.mid.o),
      high: Number(c.mid.h),
      low: Number(c.mid.l),
      close: Number(c.mid.c),
    }));
}

// ─── Bias ─────────────────────────────────────────────────────────────────────

export function getTrendBias(candles: ParsedCandle[]): string {
  const recent = candles.slice(-20);
  if (recent.length < 20) return "NEUTRAL";
  const change = (recent[recent.length - 1].close - recent[0].close) / recent[0].close;
  if (change > 0.003) return "BULL";
  if (change < -0.003) return "BEAR";
  return "NEUTRAL";
}

export function getHigherTimeframeBias(candles: ParsedCandle[]): string {
  const recent = candles.slice(-10);
  if (recent.length < 10) return "NEUTRAL";
  const change = (recent[recent.length - 1].close - recent[0].close) / recent[0].close;
  if (change > 0.005) return "BULL";
  if (change < -0.005) return "BEAR";
  return "NEUTRAL";
}

// ─── Pattern detection ────────────────────────────────────────────────────────

export type KTResult = {
  isValidSetup: boolean;
  score: number;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward: number | null;
  reason: string;
};

export function detectKangarooTail(candles: ParsedCandle[], bias: string): KTResult {
  const last = candles[candles.length - 1];
  if (!last) return { isValidSetup: false, score: 0, entry: null, stopLoss: null, takeProfit: null, riskReward: null, reason: "No candle." };

  const range = last.high - last.low;
  const body = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;

  if (range <= 0) return { isValidSetup: false, score: 0, entry: null, stopLoss: null, takeProfit: null, riskReward: null, reason: "Invalid range." };

  const bodyRatio = body / range;
  const upperWickRatio = upperWick / range;
  const lowerWickRatio = lowerWick / range;

  const isBearish = bias === "BEAR" && upperWickRatio >= 0.6 && bodyRatio <= 0.3;
  const isBullish = bias === "BULL" && lowerWickRatio >= 0.6 && bodyRatio <= 0.3;

  if (!isBearish && !isBullish) {
    return { isValidSetup: false, score: Math.round(Math.max(upperWickRatio, lowerWickRatio) * 50), entry: null, stopLoss: null, takeProfit: null, riskReward: null, reason: "No valid KT on latest candle." };
  }

  const rr = 3;
  if (isBearish) {
    const entry = last.close;
    const stop = last.high;
    return { isValidSetup: true, score: 80, entry, stopLoss: stop, takeProfit: entry - (stop - entry) * rr, riskReward: rr, reason: "Bearish KT: long upper wick with bearish bias." };
  }
  const entry = last.close;
  const stop = last.low;
  return { isValidSetup: true, score: 80, entry, stopLoss: stop, takeProfit: entry + (entry - stop) * rr, riskReward: rr, reason: "Bullish KT: long lower wick with bullish bias." };
}

export function detectBigShadow(candles: ParsedCandle[]): boolean {
  if (candles.length < 2) return false;
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const range = curr.high - curr.low;
  if (range <= 0) return false;
  return curr.high > prev.high && curr.low < prev.low && Math.abs(curr.close - curr.open) / range >= 0.7;
}

export function detectInsideBar(candles: ParsedCandle[]): boolean {
  if (candles.length < 2) return false;
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  return curr.high <= prev.high && curr.low >= prev.low;
}

// ─── Basic key levels (used by signal/log route) ──────────────────────────────

export type KeyLevel = { price: number; type: "support" | "resistance" };

export function extractKeyLevels(candles: ParsedCandle[]): KeyLevel[] {
  const levels: KeyLevel[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i + 1].high)
      levels.push({ price: candles[i].high, type: "resistance" });
    if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i + 1].low)
      levels.push({ price: candles[i].low, type: "support" });
  }
  return [...levels.filter((l) => l.type === "resistance").slice(-3), ...levels.filter((l) => l.type === "support").slice(-3)];
}

// ─── Full analysis engine ─────────────────────────────────────────────────────

export type KeyLevelDetailed = {
  type: "support" | "resistance";
  price: number;
  strengthScore: number;
  reason: string;
};

export type TradePlan = {
  direction: "LONG" | "SHORT";
  entryTrigger: string;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  invalidation: string;
};

export type PairAnalysisResult = {
  pair: string;
  timeframe: string;
  higherTimeframeBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  executionTimeframeBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  marketState: "TRENDING" | "RANGING" | "BREAKOUT" | "REVERSAL";
  setupDetected: boolean;
  setupType: string | null;
  confidenceScore: number;
  keyLevels: KeyLevelDetailed[];
  tradeStatus: "TRADE_READY" | "WATCHLIST" | "NO_TRADE" | "AVOID";
  blockers: string[];
  triggerConditions: string[];
  potentialTradePlan: TradePlan | null;
};

function mapBias(bias: string): "BULLISH" | "BEARISH" | "NEUTRAL" {
  if (bias === "BULL") return "BULLISH";
  if (bias === "BEAR") return "BEARISH";
  return "NEUTRAL";
}

function extractKeyLevelsDetailed(candles: ParsedCandle[]): KeyLevelDetailed[] {
  type Raw = KeyLevelDetailed & { idx: number };
  const raw: Raw[] = [];

  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];
    if (curr.high > prev.high && curr.high > next.high)
      raw.push({ type: "resistance", price: curr.high, strengthScore: 0, reason: "", idx: i });
    if (curr.low < prev.low && curr.low < next.low)
      raw.push({ type: "support", price: curr.low, strengthScore: 0, reason: "", idx: i });
  }

  const currentPrice = candles[candles.length - 1].close;

  const scored = raw.map((level) => {
    let score = 40;
    const reasons: string[] = [];
    const tolerance = level.price * 0.0015;

    let touches = 0;
    for (const c of candles) {
      const val = level.type === "resistance" ? c.high : c.low;
      if (Math.abs(val - level.price) <= tolerance) touches++;
    }
    if (touches >= 3) { score += 25; reasons.push(`tested ${touches}×`); }
    else if (touches >= 2) { score += 12; reasons.push(`tested ${touches}×`); }

    const candlesAgo = candles.length - 1 - level.idx;
    if (candlesAgo <= 10) { score += 20; reasons.push("very recent"); }
    else if (candlesAgo <= 30) { score += 10; reasons.push("recent"); }

    const p = level.price;
    const isRound = p % 0.01 < 0.001 || p % 0.005 < 0.0005 || p % 100 < 1 || p % 50 < 0.5;
    if (isRound) { score += 15; reasons.push("round number"); }

    return {
      type: level.type,
      price: Number(level.price.toFixed(5)),
      strengthScore: Math.min(score, 100),
      reason: reasons.length ? reasons.join(", ") : `swing ${level.type === "resistance" ? "high" : "low"}`,
      idx: level.idx,
    };
  });

  return scored
    .sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice))
    .slice(0, 6)
    .map(({ idx: _i, ...rest }) => rest);
}

function calculateMarketState(
  h4Bias: string,
  d1Bias: string,
  candles: ParsedCandle[],
  keyLevels: KeyLevelDetailed[]
): "TRENDING" | "RANGING" | "BREAKOUT" | "REVERSAL" {
  const currentPrice = candles[candles.length - 1].close;

  const recentBreakout = keyLevels.some((l) => {
    const dist = Math.abs(l.price - currentPrice) / currentPrice;
    return dist < 0.002;
  });
  if (recentBreakout && h4Bias !== "NEUTRAL") return "BREAKOUT";

  if (h4Bias !== "NEUTRAL" && d1Bias !== "NEUTRAL" && h4Bias !== d1Bias) return "REVERSAL";
  if (h4Bias !== "NEUTRAL" && (d1Bias === h4Bias || d1Bias === "NEUTRAL")) return "TRENDING";
  return "RANGING";
}

function calculateConfidenceScore({
  h4Bias, d1Bias, setupDetected, setupType, marketState, ktResult, keyLevels, currentPrice,
}: {
  h4Bias: string; d1Bias: string; setupDetected: boolean; setupType: string | null;
  marketState: string; ktResult: KTResult; keyLevels: KeyLevelDetailed[]; currentPrice: number;
}): number {
  let score = 0;

  if (h4Bias !== "NEUTRAL") score += 15;
  if (d1Bias !== "NEUTRAL" && d1Bias === h4Bias) score += 20;

  if (setupDetected) {
    if (setupType === "Kangaroo Tail") score += 30;
    else if (setupType === "Big Shadow") score += 25;
    else if (setupType === "Inside Bar") score += 15;
  }

  if (marketState === "TRENDING") score += 15;
  else if (marketState === "BREAKOUT") score += 10;
  else if (marketState === "REVERSAL") score -= 10;

  const strongNearby = keyLevels.find((l) => Math.abs(l.price - currentPrice) / currentPrice < 0.003 && l.strengthScore >= 70);
  const medNearby = keyLevels.find((l) => Math.abs(l.price - currentPrice) / currentPrice < 0.005 && l.strengthScore >= 50);
  if (strongNearby) score += 15;
  else if (medNearby) score += 8;

  if (ktResult.isValidSetup && (ktResult.riskReward ?? 0) >= 3) score += 5;

  return Math.max(0, Math.min(score, 100));
}

function getBlockers({
  h4Bias, d1Bias, setupDetected, marketState,
}: {
  h4Bias: string; d1Bias: string; setupDetected: boolean; marketState: string;
}): string[] {
  const blockers: string[] = [];
  if (h4Bias !== "NEUTRAL" && d1Bias !== "NEUTRAL" && h4Bias !== d1Bias)
    blockers.push("H4 and D1 biases conflict — potential trap");
  if (!setupDetected)
    blockers.push("No valid setup pattern on current candle");
  if (marketState === "RANGING")
    blockers.push("Market is in a range — no directional edge");
  if (h4Bias === "NEUTRAL")
    blockers.push("H4 trend bias is neutral");
  if (marketState === "REVERSAL" && setupDetected)
    blockers.push("Setup is counter-trend — higher risk");
  return blockers;
}

function getTriggerConditions({
  setupDetected, setupType, h4Bias, ktResult, keyLevels, currentPrice,
}: {
  setupDetected: boolean; setupType: string | null; h4Bias: string;
  ktResult: KTResult; keyLevels: KeyLevelDetailed[]; currentPrice: number;
}): string[] {
  const triggers: string[] = [];

  if (setupDetected && setupType === "Kangaroo Tail" && ktResult.entry !== null) {
    triggers.push(
      h4Bias === "BULL"
        ? `Buy stop above KT high at ${ktResult.entry}`
        : `Sell stop below KT low at ${ktResult.entry}`
    );
  }

  if (setupDetected && setupType === "Inside Bar") {
    triggers.push("Break of inside bar high (LONG) or low (SHORT) with momentum close");
  }

  if (!setupDetected) {
    const nearRes = keyLevels.find((l) => l.type === "resistance" && l.price > currentPrice);
    const nearSup = keyLevels.find((l) => l.type === "support" && l.price < currentPrice);
    if (h4Bias === "BULL" && nearSup)
      triggers.push(`Bullish setup pattern at support ${nearSup.price} (str: ${nearSup.strengthScore})`);
    else if (h4Bias === "BEAR" && nearRes)
      triggers.push(`Bearish setup pattern at resistance ${nearRes.price} (str: ${nearRes.strengthScore})`);
    else
      triggers.push("Wait for a clear setup pattern (KT, Big Shadow, or Inside Bar) to form");
  }

  return triggers;
}

function buildTradePlan({
  setupDetected, setupType, h4Bias, ktResult, candles,
}: {
  setupDetected: boolean; setupType: string | null; h4Bias: string;
  ktResult: KTResult; candles: ParsedCandle[];
}): TradePlan | null {
  if (!setupDetected) return null;

  const last = candles[candles.length - 1];

  if (setupType === "Kangaroo Tail" && ktResult.entry !== null && ktResult.stopLoss !== null && ktResult.takeProfit !== null) {
    const dir = h4Bias === "BULL" ? "LONG" : "SHORT";
    return {
      direction: dir,
      entryTrigger: dir === "LONG" ? `Buy stop at KT high ${ktResult.entry}` : `Sell stop at KT low ${ktResult.entry}`,
      stopLoss: Number(ktResult.stopLoss.toFixed(5)),
      takeProfit: Number(ktResult.takeProfit.toFixed(5)),
      riskReward: ktResult.riskReward ?? 3,
      invalidation: dir === "LONG"
        ? `H4 close below KT low ${ktResult.stopLoss}`
        : `H4 close above KT high ${ktResult.stopLoss}`,
    };
  }

  if (setupType === "Big Shadow") {
    const isBull = last.close > last.open;
    const dir = isBull ? "LONG" : "SHORT";
    const entry = isBull ? last.high : last.low;
    const stop = isBull ? last.low : last.high;
    const risk = Math.abs(entry - stop);
    const tp = isBull ? entry + risk * 3 : entry - risk * 3;
    return {
      direction: dir,
      entryTrigger: `${dir === "LONG" ? "Buy stop" : "Sell stop"} at Big Shadow ${dir === "LONG" ? "high" : "low"} ${Number(entry.toFixed(5))}`,
      stopLoss: Number(stop.toFixed(5)),
      takeProfit: Number(tp.toFixed(5)),
      riskReward: 3,
      invalidation: `Candle closes ${dir === "LONG" ? "below" : "above"} Big Shadow body midpoint`,
    };
  }

  return null;
}

function getTradeStatus(
  setupDetected: boolean,
  confidenceScore: number,
  h4Bias: string,
  d1Bias: string,
  blockers: string[]
): "TRADE_READY" | "WATCHLIST" | "NO_TRADE" | "AVOID" {
  if (h4Bias !== "NEUTRAL" && d1Bias !== "NEUTRAL" && h4Bias !== d1Bias) return "AVOID";
  if (setupDetected && confidenceScore >= 65 && blockers.filter((b) => !b.includes("counter-trend")).length === 0) return "TRADE_READY";
  if (confidenceScore >= 35 || (h4Bias !== "NEUTRAL" && setupDetected)) return "WATCHLIST";
  return "NO_TRADE";
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export function runFullPairAnalysis(
  pair: string,
  h4Candles: ParsedCandle[],
  d1Candles: ParsedCandle[]
): PairAnalysisResult {
  const h4BiasRaw = getTrendBias(h4Candles);
  const d1BiasRaw = getHigherTimeframeBias(d1Candles);

  const ktResult = detectKangarooTail(h4Candles, h4BiasRaw);
  const bigShadow = detectBigShadow(h4Candles);
  const insideBar = detectInsideBar(h4Candles);

  const setupDetected = ktResult.isValidSetup || bigShadow || insideBar;
  const setupType = ktResult.isValidSetup ? "Kangaroo Tail" : bigShadow ? "Big Shadow" : insideBar ? "Inside Bar" : null;

  const keyLevels = extractKeyLevelsDetailed(h4Candles);
  const currentPrice = h4Candles[h4Candles.length - 1].close;
  const marketState = calculateMarketState(h4BiasRaw, d1BiasRaw, h4Candles, keyLevels);

  const confidenceScore = calculateConfidenceScore({
    h4Bias: h4BiasRaw, d1Bias: d1BiasRaw, setupDetected, setupType,
    marketState, ktResult, keyLevels, currentPrice,
  });

  const blockers = getBlockers({ h4Bias: h4BiasRaw, d1Bias: d1BiasRaw, setupDetected, marketState });
  const triggerConditions = getTriggerConditions({ setupDetected, setupType, h4Bias: h4BiasRaw, ktResult, keyLevels, currentPrice });
  const potentialTradePlan = buildTradePlan({ setupDetected, setupType, h4Bias: h4BiasRaw, ktResult, candles: h4Candles });
  const tradeStatus = getTradeStatus(setupDetected, confidenceScore, h4BiasRaw, d1BiasRaw, blockers);

  return {
    pair,
    timeframe: "H4",
    higherTimeframeBias: mapBias(d1BiasRaw),
    executionTimeframeBias: mapBias(h4BiasRaw),
    marketState,
    setupDetected,
    setupType,
    confidenceScore,
    keyLevels,
    tradeStatus,
    blockers,
    triggerConditions,
    potentialTradePlan,
  };
}
