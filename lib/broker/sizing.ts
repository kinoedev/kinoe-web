// Position sizing — formula: units = (balance × riskPct) / |entry - sl|
// Units are the native OANDA quantity (1 unit = 1 currency or 1 oz for metals).
// Lots are for human reference: forex = units/100,000, metals = units/100.

const LOT_SIZES: Record<string, number> = {
  XAU_USD: 100,   // 100 oz per lot
  XAG_USD: 5000,  // 5000 oz per lot
};
const DEFAULT_LOT_SIZE = 100_000;

function lotSizeForPair(pair: string): number {
  return LOT_SIZES[pair] ?? DEFAULT_LOT_SIZE;
}

export type SizeResult = {
  units: number;       // OANDA order units (whole number)
  lots: number;        // human-readable lots (2 dp)
  riskAmount: number;  // USD at risk
  slPips: number;      // SL distance expressed in pips
  ok: boolean;
  reason?: string;
};

export function calculatePositionSize(
  entryPrice: number,
  stopLoss: number,
  accountBalance: number,
  riskPct = 0.01,    // default 1%
  pair = "EUR_USD"
): SizeResult {
  const slDistance = Math.abs(entryPrice - stopLoss);

  if (slDistance === 0) {
    return { units: 0, lots: 0, riskAmount: 0, slPips: 0, ok: false, reason: "SL distance is zero" };
  }
  if (accountBalance <= 0) {
    return { units: 0, lots: 0, riskAmount: 0, slPips: 0, ok: false, reason: "Invalid account balance" };
  }

  const riskAmount = accountBalance * riskPct;
  const rawUnits = riskAmount / slDistance;
  const units = Math.floor(rawUnits);

  if (units < 1) {
    return { units: 0, lots: 0, riskAmount, slPips: 0, ok: false, reason: "Position too small for this SL distance" };
  }

  const lotSize = lotSizeForPair(pair);
  const lots = Number((units / lotSize).toFixed(2));

  // Pip size for display: metals use 0.01, forex pairs use 0.0001
  const pipSize = pair.startsWith("XA") ? 0.01 : 0.0001;
  const slPips = Math.round(slDistance / pipSize);

  return { units, lots, riskAmount: Number(riskAmount.toFixed(2)), slPips, ok: true };
}

export function formatSizeForTelegram(size: SizeResult, pair: string): string {
  if (!size.ok) return `Size: N/A (${size.reason})`;
  const isMetals = pair.startsWith("XA");
  if (isMetals) {
    return `${size.units} units (${size.lots} lots) · $${size.riskAmount} risked`;
  }
  return `${size.units.toLocaleString()} units (${size.lots} lots) · $${size.riskAmount} risked`;
}
