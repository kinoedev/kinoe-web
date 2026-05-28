import type { KeyLevelDetailed } from "./levels";
import type { KTResult } from "./patterns";
import type { StructureAnalysis } from "./structure";

export type ConfidenceBreakdown = {
  h4_trend: number;           // 0–20: H4 bias directional strength
  d1_alignment: number;       // 0–20: D1 agrees with H4
  setup_pattern: number;      // 0–25: KT=25, BigShadow=20, InsideBar=12, none=0
  key_level_proximity: number; // 0–15: nearness + strength of closest level
  session_timing: number;      // 0–15: London+NY overlap > London/NY solo > Tokyo > dead
  market_state_adj: number;    // -10 to +8: TRENDING, BREAKOUT, RANGING, REVERSAL
  structure_zone: number;      // -15 to +15: entry near HL/LH zone, or counter-structure
  rr_quality: number;          // 0–5: R:R bonus
  total: number;               // clamped 0–100
  factors: string[];           // human-readable explanation for each non-zero contribution
};

function scoreSessionTiming(utcHour: number): { score: number; label: string } {
  const londonOpen = utcHour >= 8 && utcHour < 17;
  const nyOpen = utcHour >= 13 && utcHour < 22;
  const tokyoOpen = utcHour >= 0 && utcHour < 9;

  if (londonOpen && nyOpen) return { score: 15, label: "London+NY overlap (peak liquidity)" };
  if (londonOpen) return { score: 12, label: "London session" };
  if (nyOpen) return { score: 10, label: "New York session" };
  if (tokyoOpen) return { score: 5, label: "Tokyo session" };
  return { score: 0, label: "off-session (dead zone)" };
}

export function calculateConfidenceBreakdown({
  h4Bias, d1Bias, setupDetected, setupType, marketState, ktResult, keyLevels, currentPrice, utcHour, structureAnalysis,
}: {
  h4Bias: string;
  d1Bias: string;
  setupDetected: boolean;
  setupType: string | null;
  marketState: string;
  ktResult: KTResult;
  keyLevels: KeyLevelDetailed[];
  currentPrice: number;
  utcHour: number;
  structureAnalysis?: StructureAnalysis;
}): ConfidenceBreakdown {
  const factors: string[] = [];

  // H4 trend (0–20)
  let h4_trend = 0;
  if (h4Bias !== "NEUTRAL") {
    h4_trend = 20;
    factors.push(`H4 trend ${h4Bias} (+${h4_trend})`);
  }

  // D1 alignment (0–20)
  let d1_alignment = 0;
  if (d1Bias !== "NEUTRAL") {
    if (d1Bias === h4Bias) {
      d1_alignment = 20;
      factors.push(`D1 aligns with H4 (+${d1_alignment})`);
    } else if (h4Bias === "NEUTRAL") {
      d1_alignment = 10;
      factors.push(`D1 bias present, H4 neutral (+${d1_alignment})`);
    }
    // d1 conflicts with h4 → 0 points (blocker handles the warning)
  }

  // Setup pattern (0–25)
  let setup_pattern = 0;
  if (setupDetected) {
    if (setupType === "Kangaroo Tail") setup_pattern = 25;
    else if (setupType === "Big Shadow") setup_pattern = 20;
    else if (setupType === "Inside Bar") setup_pattern = 12;
    if (setup_pattern > 0) factors.push(`${setupType} pattern (+${setup_pattern})`);
  }

  // Key level proximity (0–15)
  let key_level_proximity = 0;
  const strongNearby = keyLevels.find((l) => Math.abs(l.price - currentPrice) / currentPrice < 0.003 && l.strengthScore >= 70);
  const medNearby = keyLevels.find((l) => Math.abs(l.price - currentPrice) / currentPrice < 0.005 && l.strengthScore >= 50);
  if (strongNearby) {
    key_level_proximity = 15;
    factors.push(`Strong ${strongNearby.type} at ${strongNearby.price} (str ${strongNearby.strengthScore}) (+${key_level_proximity})`);
  } else if (medNearby) {
    key_level_proximity = 8;
    factors.push(`Medium ${medNearby.type} at ${medNearby.price} (str ${medNearby.strengthScore}) (+${key_level_proximity})`);
  }

  // Session timing (0–15)
  const session = scoreSessionTiming(utcHour);
  const session_timing = session.score;
  if (session_timing > 0) factors.push(`${session.label} (+${session_timing})`);
  else factors.push(`${session.label} (+0)`);

  // Market state adjustment (-10 to +8)
  let market_state_adj = 0;
  if (marketState === "TRENDING") { market_state_adj = 8; factors.push(`Trending market (+${market_state_adj})`); }
  else if (marketState === "BREAKOUT") { market_state_adj = 5; factors.push(`Breakout market (+${market_state_adj})`); }
  else if (marketState === "RANGING") { market_state_adj = -5; factors.push(`Ranging market (${market_state_adj})`); }
  else if (marketState === "REVERSAL") { market_state_adj = -10; factors.push(`Counter-trend reversal (${market_state_adj})`); }

  // Market structure zone (−15 to +15)
  let structure_zone = 0;
  if (structureAnalysis) {
    const { bias: structBias, nearStructuralZone, lastHL, lastLH } = structureAnalysis;

    if (nearStructuralZone) {
      if (structBias === "BULLISH" && h4Bias === "BULL") {
        structure_zone = 15;
        factors.push(`Entry at bullish HL zone (${lastHL?.price.toFixed(5)}) (+${structure_zone})`);
      } else if (structBias === "BEARISH" && h4Bias === "BEAR") {
        structure_zone = 15;
        factors.push(`Entry at bearish LH zone (${lastLH?.price.toFixed(5)}) (+${structure_zone})`);
      } else if (nearStructuralZone) {
        structure_zone = 5;
        factors.push(`Near structural zone — misaligned bias (+${structure_zone})`);
      }
    } else if (structBias !== "NEUTRAL" && structBias !== h4Bias.replace("BULL", "BULLISH").replace("BEAR", "BEARISH")) {
      // Counter-structure trade — penalize
      structure_zone = -15;
      factors.push(`Counter-structure trade (${structBias} structure, ${h4Bias} bias) (${structure_zone})`);
    } else if (structBias !== "NEUTRAL") {
      structure_zone = 0;
      factors.push(`Structure ${structBias} — not at zone yet`);
    }
  }

  // R:R quality (0–5)
  let rr_quality = 0;
  if (ktResult.isValidSetup && (ktResult.riskReward ?? 0) >= 3.5) {
    rr_quality = 5;
    factors.push(`R:R ${ktResult.riskReward} (+${rr_quality})`);
  } else if (ktResult.isValidSetup && (ktResult.riskReward ?? 0) >= 3) {
    rr_quality = 3;
    factors.push(`R:R ${ktResult.riskReward} (+${rr_quality})`);
  }

  const total = Math.max(0, Math.min(100,
    h4_trend + d1_alignment + setup_pattern + key_level_proximity + session_timing + market_state_adj + structure_zone + rr_quality
  ));

  return { h4_trend, d1_alignment, setup_pattern, key_level_proximity, session_timing, market_state_adj, structure_zone, rr_quality, total, factors };
}

export function getBlockers({
  h4Bias, d1Bias, setupDetected, marketState,
}: {
  h4Bias: string; d1Bias: string; setupDetected: boolean; marketState: string;
}): string[] {
  const blockers: string[] = [];
  if (h4Bias !== "NEUTRAL" && d1Bias !== "NEUTRAL" && h4Bias !== d1Bias)
    blockers.push("H4 and D1 biases conflict - potential trap");
  if (!setupDetected)
    blockers.push("No valid setup pattern on current candle");
  if (marketState === "RANGING")
    blockers.push("Market is in a range - no directional edge");
  if (h4Bias === "NEUTRAL")
    blockers.push("H4 trend bias is neutral");
  if (marketState === "REVERSAL" && setupDetected)
    blockers.push("Setup is counter-trend - higher risk");
  return blockers;
}

export function getTriggerConditions({
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

export function getTradeStatus(
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
