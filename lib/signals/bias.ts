import type { ParsedCandle } from "./candles";

export function getTrendBias(candles: ParsedCandle[]): "BULL" | "BEAR" | "NEUTRAL" {
  const recent = candles.slice(-20);
  if (recent.length < 20) return "NEUTRAL";
  const change = (recent[recent.length - 1].close - recent[0].close) / recent[0].close;
  if (change > 0.003) return "BULL";
  if (change < -0.003) return "BEAR";
  return "NEUTRAL";
}

export function getHigherTimeframeBias(candles: ParsedCandle[]): "BULL" | "BEAR" | "NEUTRAL" {
  const recent = candles.slice(-10);
  if (recent.length < 10) return "NEUTRAL";
  const change = (recent[recent.length - 1].close - recent[0].close) / recent[0].close;
  if (change > 0.005) return "BULL";
  if (change < -0.005) return "BEAR";
  return "NEUTRAL";
}
