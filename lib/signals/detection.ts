// Thin orchestrator — imports from focused sub-modules.
// External code should import specific functions from sub-modules directly
// where possible; this file re-exports everything for backward compat.

export { parseCandles, calculateATR } from "./candles";
export type { OandaCandle, ParsedCandle } from "./candles";

export { getTrendBias, getHigherTimeframeBias } from "./bias";

export { detectKangarooTail, detectBigShadow, detectInsideBar } from "./patterns";
export type { KTResult } from "./patterns";

export { extractKeyLevels, extractKeyLevelsDetailed, calculateMarketState, calculateADR, checkClearPath } from "./levels";
export type { KeyLevel, KeyLevelDetailed, ClearPathResult } from "./levels";

export { buildTradePlan } from "./planner";
export type { TradePlan } from "./planner";

export {
  calculateConfidenceBreakdown,
  getBlockers,
  getTriggerConditions,
  getTradeStatus,
} from "./confidence";
export type { ConfidenceBreakdown } from "./confidence";

export { analyzeMarketStructure } from "./structure";
export type { StructureAnalysis, SwingPoint } from "./structure";

// ─── Composite result type ────────────────────────────────────────────────────

import type { ParsedCandle } from "./candles";
import type { KeyLevelDetailed } from "./levels";
import type { TradePlan } from "./planner";
import type { ConfidenceBreakdown } from "./confidence";
import type { StructureAnalysis } from "./structure";

export type PairAnalysisResult = {
  pair: string;
  timeframe: string;
  higherTimeframeBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  executionTimeframeBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  marketState: "TRENDING" | "RANGING" | "BREAKOUT" | "REVERSAL";
  structureAnalysis: StructureAnalysis;
  setupDetected: boolean;
  setupType: string | null;
  confidenceScore: number;
  confidenceBreakdown: ConfidenceBreakdown;
  keyLevels: KeyLevelDetailed[];
  tradeStatus: "TRADE_READY" | "WATCHLIST" | "NO_TRADE" | "AVOID";
  blockers: string[];
  triggerConditions: string[];
  potentialTradePlan: TradePlan | null;
  m15EntryPlan: TradePlan | null;
  m15SetupType: string | null;
  m15Note: string;
};

// ─── Main analysis function ───────────────────────────────────────────────────

import { getTrendBias, getHigherTimeframeBias } from "./bias";
import { detectKangarooTail, detectBigShadow, detectInsideBar } from "./patterns";
import { extractKeyLevelsDetailed, calculateMarketState, checkClearPath } from "./levels";
import { buildTradePlan } from "./planner";
import { calculateConfidenceBreakdown, getBlockers, getTriggerConditions, getTradeStatus } from "./confidence";
import { analyzeMarketStructure } from "./structure";
import { calculateATR } from "./candles";
import { analyzeM15Entry } from "./m15";

function mapBias(bias: string): "BULLISH" | "BEARISH" | "NEUTRAL" {
  if (bias === "BULL") return "BULLISH";
  if (bias === "BEAR") return "BEARISH";
  return "NEUTRAL";
}

export function runFullPairAnalysis(
  pair: string,
  h4Candles: ParsedCandle[],
  d1Candles: ParsedCandle[],
  utcHour?: number,
  m15Candles?: ParsedCandle[]
): PairAnalysisResult {
  const now = utcHour ?? new Date().getUTCHours();

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
  const structureAnalysis = analyzeMarketStructure(h4Candles);
  const atr14 = calculateATR(h4Candles, 14);

  const confidenceBreakdown = calculateConfidenceBreakdown({
    h4Bias: h4BiasRaw, d1Bias: d1BiasRaw, setupDetected, setupType,
    marketState, ktResult, keyLevels, currentPrice, utcHour: now,
    structureAnalysis,
  });

  const blockers = getBlockers({ h4Bias: h4BiasRaw, d1Bias: d1BiasRaw, setupDetected, marketState });
  const triggerConditions = getTriggerConditions({ setupDetected, setupType, h4Bias: h4BiasRaw, ktResult, keyLevels, currentPrice });

  const potentialTradePlan = buildTradePlan({
    setupDetected, setupType, h4Bias: h4BiasRaw, ktResult, candles: h4Candles, atr14,
  });

  // Clear path check — add blocker if a key level sits between entry and TP within 1R
  if (potentialTradePlan) {
    const pathCheck = checkClearPath(
      potentialTradePlan.direction,
      currentPrice,
      potentialTradePlan.takeProfit,
      potentialTradePlan.stopLoss,
      keyLevels
    );
    if (!pathCheck.clear && pathCheck.reason) {
      blockers.push(`Level blocking path: ${pathCheck.reason}`);
    }
  }

  // Structure mismatch blocker — if H4 bias conflicts with market structure
  if (
    structureAnalysis.bias !== "NEUTRAL" &&
    h4BiasRaw !== "NEUTRAL" &&
    ((structureAnalysis.bias === "BULLISH" && h4BiasRaw === "BEAR") ||
     (structureAnalysis.bias === "BEARISH" && h4BiasRaw === "BULL"))
  ) {
    blockers.push(`Bias conflicts with market structure (${structureAnalysis.bias} structure, ${h4BiasRaw} bias)`);
  }

  const tradeStatus = getTradeStatus(setupDetected, confidenceBreakdown.total, h4BiasRaw, d1BiasRaw, blockers);

  const m15Result = m15Candles && m15Candles.length >= 10
    ? analyzeM15Entry(m15Candles, h4BiasRaw)
    : { found: false, setupType: null, entryPlan: null, note: "M15 data not fetched" };

  return {
    pair,
    timeframe: "H4",
    higherTimeframeBias: mapBias(d1BiasRaw),
    executionTimeframeBias: mapBias(h4BiasRaw),
    marketState,
    structureAnalysis,
    setupDetected,
    setupType,
    confidenceScore: confidenceBreakdown.total,
    confidenceBreakdown,
    keyLevels,
    tradeStatus,
    blockers,
    triggerConditions,
    potentialTradePlan,
    m15EntryPlan: m15Result.entryPlan,
    m15SetupType: m15Result.setupType,
    m15Note: m15Result.note,
  };
}
