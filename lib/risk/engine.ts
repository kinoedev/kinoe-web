import type { AgentSettings } from "@/lib/db/types";
import type { ParsedCandle } from "@/lib/signals/candles";
import { calculateADR } from "@/lib/signals/levels";
import { getTrailingConsecutiveLosses } from "@/lib/db/queries";
import { checkNewsBlackout } from "./news";

export type RiskCheckResult = {
  pass: boolean;
  reason: string;
  detail?: string;
};

export type GlobalRiskReport = {
  pass: boolean;
  checks: { name: string; result: RiskCheckResult }[];
};

export type PairRiskReport = {
  pass: boolean;
  reason?: string;
};

// ─── Global checks (run once before scanning) ────────────────────────────────

export async function checkConsecutiveLossCooldown(
  cooldownAfterLosses: number,
  cooldownHours: number
): Promise<RiskCheckResult> {
  if (cooldownAfterLosses <= 0) return { pass: true, reason: "Cooldown disabled." };

  const { count, lastLossAt } = await getTrailingConsecutiveLosses();

  if (count < cooldownAfterLosses) {
    return { pass: true, reason: `${count} consecutive loss(es) — below threshold of ${cooldownAfterLosses}.` };
  }

  if (!lastLossAt) return { pass: true, reason: "No loss timestamp found." };

  const lastLossMs = new Date(lastLossAt).getTime();
  const cooldownMs = cooldownHours * 60 * 60 * 1000;
  const elapsed = Date.now() - lastLossMs;

  if (elapsed < cooldownMs) {
    const hoursLeft = ((cooldownMs - elapsed) / 3600000).toFixed(1);
    return {
      pass: false,
      reason: `Consecutive loss cooldown active.`,
      detail: `${count} losses in a row — cooldown resets in ${hoursLeft}h.`,
    };
  }

  return { pass: true, reason: "Cooldown period has elapsed." };
}

export async function runGlobalRiskChecks(settings: AgentSettings): Promise<GlobalRiskReport> {
  const checks: { name: string; result: RiskCheckResult }[] = [];

  const cooldown = await checkConsecutiveLossCooldown(
    settings.cooldown_after_losses,
    settings.cooldown_hours
  );
  checks.push({ name: "consecutive_loss_cooldown", result: cooldown });

  const pass = checks.every((c) => c.result.pass);
  return { pass, checks };
}

// ─── Per-pair checks (run after candles are fetched) ─────────────────────────

export async function checkPairNewsBlackout(
  pair: string,
  blackoutMinutes: number
): Promise<PairRiskReport> {
  const result = await checkNewsBlackout(pair, blackoutMinutes);
  if (result.blocked) {
    return { pass: false, reason: result.reason };
  }
  return { pass: true };
}

export function checkPairVolatility(
  pair: string,
  d1Candles: ParsedCandle[],
  maxAdrMultiplier: number
): PairRiskReport {
  const avgAdr = calculateADR(d1Candles, 14);
  if (avgAdr <= 0) return { pass: true };

  const latest = d1Candles[d1Candles.length - 1];
  if (!latest) return { pass: true };

  const currentRange = latest.high - latest.low;

  if (currentRange > avgAdr * maxAdrMultiplier) {
    return {
      pass: false,
      reason: `${pair}: volatility spike — current range ${(currentRange * 10000).toFixed(1)} pips vs avg ${(avgAdr * 10000).toFixed(1)} pips (>${maxAdrMultiplier}x).`,
    };
  }

  if (currentRange < avgAdr * 0.3) {
    return {
      pass: false,
      reason: `${pair}: market too compressed — current range ${(currentRange * 10000).toFixed(1)} pips vs avg ${(avgAdr * 10000).toFixed(1)} pips (<30% of avg).`,
    };
  }

  return { pass: true };
}
