import { analyzeZones, type ZoneAnalysis } from "@/lib/indicators/zones";
import { FUTURES_SYMBOLS, type FuturesSymbol } from "./symbols";
import { creditSpent, executeFetch, loadBars, LOOKBACK_DAYS, planFetches, pruneMinuteBars, saveSnapshot } from "./store";

export type ScanOutcome =
  | {
      ok: true;
      scannedAt: string;
      dataThrough: string;
      results: ZoneAnalysis[];
      errors: { symbol: string; error: string }[];
      spend: { thisScan: number; rowsDownloaded: number; total: number; last30d: number };
    }
  | { ok: false; needsConfirm: true; estimate: number; limit: number; message: string };

/** Spend over this needs an explicit confirm from the page. */
export function costLimit(): number {
  const n = Number(process.env.DATABENTO_MAX_COST_USD);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export async function runFuturesScan(opts: { symbols?: FuturesSymbol[]; confirm?: boolean } = {}): Promise<ScanOutcome> {
  const symbols = opts.symbols ?? FUTURES_SYMBOLS;
  const { plans, availableEnd } = await planFetches(symbols);
  const estimate = plans.reduce((s, p) => s + p.cost, 0);
  const limit = costLimit();

  if (estimate > limit && !opts.confirm) {
    return {
      ok: false,
      needsConfirm: true,
      estimate,
      limit,
      message: `This scan needs about $${estimate.toFixed(2)} of Databento credit, above your $${limit.toFixed(2)} per-scan limit.`,
    };
  }

  let rowsDownloaded = 0;
  for (const plan of plans) rowsDownloaded += await executeFetch(plan);
  if (plans.some((p) => p.schema === "ohlcv-1m")) await pruneMinuteBars();

  const results: ZoneAnalysis[] = [];
  const errors: { symbol: string; error: string }[] = [];
  const dataThrough = Math.max(availableEnd["ohlcv-1h"].getTime(), availableEnd["ohlcv-1m"].getTime());

  for (const symbol of symbols) {
    try {
      const [hourly, minute] = await Promise.all([
        loadBars(symbol.root, "ohlcv-1h", LOOKBACK_DAYS["ohlcv-1h"] + 2),
        loadBars(symbol.root, "ohlcv-1m", LOOKBACK_DAYS["ohlcv-1m"] + 2),
      ]);
      const analysis = analyzeZones({ symbol, hourly, minute, asOf: dataThrough });
      await saveSnapshot({
        symbol: symbol.root,
        weekStart: analysis.weekStart,
        weekEnd: analysis.weekEnd,
        asOf: analysis.asOf,
        lastPrice: analysis.lastPrice,
        analysis,
      });
      results.push(analysis);
    } catch (err) {
      errors.push({ symbol: symbol.root, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const spent = await creditSpent();
  return {
    ok: true,
    scannedAt: new Date().toISOString(),
    dataThrough: new Date(dataThrough).toISOString(),
    results,
    errors,
    spend: { thisScan: estimate, rowsDownloaded, total: spent.total, last30d: spent.last30d },
  };
}
