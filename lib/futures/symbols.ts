export type FuturesSymbol = {
  /** Root symbol used everywhere in Kinoe (journal, scanner, URLs). */
  root: string;
  name: string;
  /** Minimum price increment. */
  tick: number;
  /** Dollar value of one tick for one contract. */
  tickValue: number;
  /** Databento continuous symbol — `.v.0` follows the highest-volume contract, so it rolls with the market. */
  databento: string;
  /** TradingView continuous front-month symbol. */
  tradingView: string;
};

export const DATABENTO_DATASET = "GLBX.MDP3";

export const FUTURES_SYMBOLS: FuturesSymbol[] = [
  { root: "MNQ", name: "Micro Nasdaq-100", tick: 0.25, tickValue: 0.5, databento: "MNQ.v.0", tradingView: "CME_MINI:MNQ1!" },
  { root: "MES", name: "Micro S&P 500", tick: 0.25, tickValue: 1.25, databento: "MES.v.0", tradingView: "CME_MINI:MES1!" },
  { root: "MGC", name: "Micro Gold", tick: 0.1, tickValue: 1, databento: "MGC.v.0", tradingView: "COMEX:MGC1!" },
  { root: "MCL", name: "Micro Crude Oil", tick: 0.01, tickValue: 1, databento: "MCL.v.0", tradingView: "NYMEX:MCL1!" },
];

export function getSymbol(root: string): FuturesSymbol | undefined {
  return FUTURES_SYMBOLS.find((s) => s.root === root.toUpperCase());
}

export function tickDecimals(tick: number): number {
  const s = String(tick);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : s.length - dot - 1;
}

export function roundToTick(price: number, tick: number): number {
  const d = tickDecimals(tick);
  return Number((Math.round(price / tick) * tick).toFixed(d));
}

export function formatPrice(price: number, tick: number): string {
  const d = tickDecimals(tick);
  return price.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
