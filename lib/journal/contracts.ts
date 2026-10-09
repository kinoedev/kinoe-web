/** Contract specs for P&L and fees. Point value = dollars per 1.0 price move, one contract. */
export type ContractSpec = { root: string; name: string; tick: number; pointValue: number; micro: boolean };

const SPECS: ContractSpec[] = [
  { root: "ES", name: "E-mini S&P 500", tick: 0.25, pointValue: 50, micro: false },
  { root: "MES", name: "Micro S&P 500", tick: 0.25, pointValue: 5, micro: true },
  { root: "NQ", name: "E-mini Nasdaq-100", tick: 0.25, pointValue: 20, micro: false },
  { root: "MNQ", name: "Micro Nasdaq-100", tick: 0.25, pointValue: 2, micro: true },
  { root: "RTY", name: "E-mini Russell 2000", tick: 0.1, pointValue: 50, micro: false },
  { root: "M2K", name: "Micro Russell 2000", tick: 0.1, pointValue: 5, micro: true },
  { root: "YM", name: "E-mini Dow", tick: 1, pointValue: 5, micro: false },
  { root: "MYM", name: "Micro Dow", tick: 1, pointValue: 0.5, micro: true },
  { root: "CL", name: "Crude Oil", tick: 0.01, pointValue: 1000, micro: false },
  { root: "MCL", name: "Micro Crude Oil", tick: 0.01, pointValue: 100, micro: true },
  { root: "GC", name: "Gold", tick: 0.1, pointValue: 100, micro: false },
  { root: "MGC", name: "Micro Gold", tick: 0.1, pointValue: 10, micro: true },
  { root: "SI", name: "Silver", tick: 0.005, pointValue: 5000, micro: false },
  { root: "SIL", name: "Micro Silver", tick: 0.005, pointValue: 1000, micro: true },
  { root: "NG", name: "Natural Gas", tick: 0.001, pointValue: 10000, micro: false },
  { root: "6E", name: "Euro FX", tick: 0.00005, pointValue: 125000, micro: false },
  { root: "M6E", name: "Micro Euro FX", tick: 0.0001, pointValue: 12500, micro: true },
];

const BY_ROOT = new Map(SPECS.map((s) => [s.root, s]));

/** "MNQZ6" / "MNQZ26" / "MNQ" → "MNQ". Strips the month code and year. */
export function rootOf(symbol: string): string {
  const s = symbol.trim().toUpperCase().replace(/^[^A-Z0-9]+/, "");
  if (BY_ROOT.has(s)) return s;
  const m = s.match(/^([A-Z0-9]+?)([FGHJKMNQUVXZ])(\d{1,2})$/);
  if (m && BY_ROOT.has(m[1])) return m[1];
  return m ? m[1] : s;
}

export function specFor(symbol: string): ContractSpec | undefined {
  return BY_ROOT.get(rootOf(symbol));
}
