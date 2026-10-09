/**
 * Trade import: Tradovate exports → round-trip trades.
 *
 * Supported:
 *  - Tradovate "Performance" CSV (Account Reports → Performance → Download): one row per matched
 *    buy/sell pair, with buyPrice, sellPrice, qty, pnl, boughtTimestamp, soldTimestamp.
 *  - Tradovate "Orders" / fills CSV (and most broker fill exports): one row per fill with
 *    side, quantity, price and time. Fills are matched FIFO into round trips.
 * Orders exports also carry stop orders, which are used to estimate each trade's initial stop (for R).
 */
import { createHash } from "crypto";
import { rootOf, specFor } from "./contracts";
import { parseTimestamp } from "./time";

export type Execution = { ts: number; side: "BUY" | "SELL"; qty: number; price: number; /** fees on this side, $ */ fee?: number };

export type ParsedTrade = {
  symbol: string;
  root: string;
  direction: "LONG" | "SHORT";
  entryTs: number;
  exitTs: number;
  /** Contracts opened over the trade (scale-ins add up). */
  qty: number;
  entryPrice: number;
  exitPrice: number;
  grossPnl: number;
  executions: Execution[];
  accountNumber: string | null;
  initialStop: number | null;
  /** Fees taken from the file itself (PDF reports). null → use the account's fee settings. */
  fees: number | null;
};

export type ParseResult = {
  format: "tradovate-performance" | "tradovate-pdf" | "fills";
  rowsRead: number;
  trades: ParsedTrade[];
  warnings: string[];
};

// ── CSV ─────────────────────────────────────────────────────────────────────

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** "$1,234.50" → 1234.5, "$(12.50)" / "-12.50" → -12.5 */
export function parseMoney(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const s = raw.trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s.replace(/\$/g, "")) || s.includes("(") || s.startsWith("-") || s.startsWith("$-");
  const n = Number(s.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function num(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw.replace(/[,$\s]/g, ""));
  return Number.isFinite(n) && raw.trim() !== "" ? n : null;
}

type Table = { headers: string[]; get: (row: string[], ...names: string[]) => string | undefined; rows: string[][] };

function table(rows: string[][]): Table {
  const headers = rows[0].map(norm);
  const index = new Map(headers.map((h, i) => [h, i]));
  return {
    headers,
    rows: rows.slice(1),
    get(row, ...names) {
      for (const n of names) {
        const i = index.get(norm(n));
        if (i !== undefined && row[i] !== undefined && row[i].trim() !== "") return row[i].trim();
      }
      return undefined;
    },
  };
}

// ── Grouping ────────────────────────────────────────────────────────────────

function pnlFor(symbol: string, direction: "LONG" | "SHORT", execs: Execution[]): number {
  const spec = specFor(symbol);
  const pv = spec?.pointValue ?? 1;
  // Cash flow: sells add, buys subtract (× point value). Works for partials and scale-ins.
  let cash = 0;
  for (const e of execs) cash += (e.side === "SELL" ? 1 : -1) * e.qty * e.price * pv;
  void direction;
  return Math.round(cash * 100) / 100;
}

function vwap(execs: Execution[]): number {
  const q = execs.reduce((s, e) => s + e.qty, 0);
  return q ? execs.reduce((s, e) => s + e.qty * e.price, 0) / q : 0;
}

/** Split a time-ordered fill stream for one symbol into flat-to-flat round trips (FIFO). */
function roundTrips(symbol: string, fills: Execution[], accountNumber: string | null): ParsedTrade[] {
  const out: ParsedTrade[] = [];
  let pos = 0;
  let current: Execution[] = [];
  for (const f of [...fills].sort((a, b) => a.ts - b.ts)) {
    const signed = f.side === "BUY" ? f.qty : -f.qty;
    if (pos !== 0 && Math.sign(pos + signed) !== Math.sign(pos) && pos + signed !== 0) {
      // Reversal: close the old position, open the new one with the remainder.
      const closeQty = Math.abs(pos);
      const share = (q: number) => (f.fee === undefined ? undefined : (f.fee * q) / f.qty);
      current.push({ ...f, qty: closeQty, fee: share(closeQty) });
      out.push(build(symbol, current, accountNumber));
      current = [{ ...f, qty: f.qty - closeQty, fee: share(f.qty - closeQty) }];
      pos = pos + signed;
      continue;
    }
    current.push(f);
    pos += signed;
    if (pos === 0) {
      out.push(build(symbol, current, accountNumber));
      current = [];
    }
  }
  return out;
}

function build(symbol: string, execs: Execution[], accountNumber: string | null): ParsedTrade {
  const direction = execs[0].side === "BUY" ? "LONG" : "SHORT";
  const entrySide = direction === "LONG" ? "BUY" : "SELL";
  const entries = execs.filter((e) => e.side === entrySide);
  const exits = execs.filter((e) => e.side !== entrySide);
  const hasFees = execs.some((e) => e.fee !== undefined);
  return {
    symbol,
    root: rootOf(symbol),
    direction,
    entryTs: execs[0].ts,
    exitTs: execs[execs.length - 1].ts,
    qty: entries.reduce((s, e) => s + e.qty, 0),
    entryPrice: vwap(entries),
    exitPrice: vwap(exits),
    grossPnl: pnlFor(symbol, direction, execs),
    executions: execs,
    accountNumber,
    initialStop: null,
    // Unrounded here; importTrades rounds cumulatively so the cents add up to the report's total.
    fees: hasFees ? execs.reduce((s, e) => s + (e.fee ?? 0), 0) : null,
  };
}

// ── Formats ─────────────────────────────────────────────────────────────────

/** One matched buy/sell pair, as Tradovate's Performance report lists them. */
export type PairRow = {
  symbol: string;
  qty: number;
  buyPrice: number;
  sellPrice: number;
  bought: number;
  sold: number;
  pnl: number | null;
  buyId?: number;
  sellId?: number;
  /** Round-turn fee per contract, when the report states its total fees. */
  feePerContract?: number;
  account?: string | null;
};

const pairKey = (r: PairRow) => [r.symbol, r.qty, r.buyPrice, r.sellPrice, r.bought, r.sold].join("|");

/**
 * Combine pair rows from several exports of the same account. Overlapping exports repeat the
 * same rows, but identical rows can also be genuine (two 1-lot fills at the same price and second),
 * so each distinct row keeps the highest count seen in any single file.
 */
export function mergePairRows(files: PairRow[][]): PairRow[] {
  const best = new Map<string, PairRow[]>();
  for (const rows of files) {
    const local = new Map<string, PairRow[]>();
    for (const r of rows) {
      const k = pairKey(r);
      const l = local.get(k) ?? [];
      l.push(r);
      local.set(k, l);
    }
    for (const [k, l] of local) if ((best.get(k)?.length ?? 0) < l.length) best.set(k, l);
  }
  return [...best.values()].flat();
}

export function pairsToTrades(rows: PairRow[], warnings: string[]): ParsedTrade[] {
  const bySymbol = new Map<string, { fills: Execution[]; pnl: number; account: string | null }>();
  for (const r of [...rows].sort((a, b) => Math.min(a.bought, a.sold) - Math.min(b.bought, b.sold))) {
    const entry = bySymbol.get(r.symbol) ?? { fills: [], pnl: 0, account: r.account ?? null };
    // Opening side goes first. Same-second scalps: the lower fill id came first.
    const buyFirst = r.bought < r.sold || (r.bought === r.sold && (r.buyId ?? 0) <= (r.sellId ?? 0));
    const halfFee = r.feePerContract !== undefined ? (r.feePerContract * r.qty) / 2 : undefined;
    const b: Execution = { ts: r.bought, side: "BUY", qty: r.qty, price: r.buyPrice, fee: halfFee };
    const sl: Execution = { ts: r.sold, side: "SELL", qty: r.qty, price: r.sellPrice, fee: halfFee };
    entry.fills.push(...(buyFirst ? [b, sl] : [sl, b]));
    entry.pnl += r.pnl ?? 0;
    bySymbol.set(r.symbol, entry);
  }
  const trades: ParsedTrade[] = [];
  for (const [symbol, { fills, account, pnl }] of bySymbol) {
    const group = roundTrips(symbol, fills, account);
    trades.push(...group);
    // Cross-check our P&L against the file's own P&L column.
    const ours = group.reduce((s, x) => s + x.grossPnl, 0);
    if (Math.abs(ours - pnl) > 0.01 * Math.max(1, Math.abs(pnl)) + 1) {
      warnings.push(`${symbol}: file P&L ${pnl.toFixed(2)} vs computed ${ours.toFixed(2)} — check the contract's point value.`);
    }
  }
  return trades.sort((a, b) => a.entryTs - b.entryTs);
}

function performanceCsvRows(t: Table, tz: string, warnings: string[]): PairRow[] {
  const out: PairRow[] = [];
  let bad = 0;
  for (const r of t.rows) {
    const symbol = t.get(r, "symbol", "contract");
    const qty = num(t.get(r, "qty", "quantity"));
    const buyPrice = num(t.get(r, "buyPrice"));
    const sellPrice = num(t.get(r, "sellPrice"));
    const bought = parseTimestamp(t.get(r, "boughtTimestamp") ?? "", tz);
    const sold = parseTimestamp(t.get(r, "soldTimestamp") ?? "", tz);
    if (!symbol || !qty || buyPrice === null || sellPrice === null || bought === null || sold === null) {
      bad++;
      continue;
    }
    out.push({
      symbol,
      qty,
      buyPrice,
      sellPrice,
      bought,
      sold,
      pnl: parseMoney(t.get(r, "pnl", "p&l", "profit")),
      buyId: num(t.get(r, "buyFillId")) ?? undefined,
      sellId: num(t.get(r, "sellFillId")) ?? undefined,
      account: t.get(r, "account", "accountName") ?? null,
    });
  }
  if (bad) warnings.push(`${bad} row(s) skipped — missing price, quantity or time.`);
  return out;
}

type StopOrder = { symbol: string; ts: number; side: "BUY" | "SELL"; stop: number };

function parseFills(t: Table, tz: string, warnings: string[]): { trades: ParsedTrade[]; stops: StopOrder[] } {
  const bySymbol = new Map<string, { fills: Execution[]; account: string | null }>();
  const stops: StopOrder[] = [];
  let skipped = 0;
  for (const r of t.rows) {
    const symbol = t.get(r, "contract", "symbol", "instrument", "product");
    const sideRaw = (t.get(r, "b/s", "bs", "side", "action", "buysell") ?? "").toUpperCase();
    const side = sideRaw.startsWith("B") ? "BUY" : sideRaw.startsWith("S") ? "SELL" : null;
    const status = (t.get(r, "status", "orderstatus") ?? "Filled").toLowerCase();
    const type = (t.get(r, "type", "ordertype") ?? "").toLowerCase();
    const ts = parseTimestamp(t.get(r, "fillTime", "filltime", "timestamp", "time", "date") ?? "", tz);
    const stopPx = num(t.get(r, "stopPrice", "stop price", "decimalStop"));
    if (symbol && side && ts !== null && stopPx !== null && type.includes("stop")) stops.push({ symbol, ts, side, stop: stopPx });
    if (!status.includes("fill")) continue;
    const qty = num(t.get(r, "filledQty", "filled qty", "fillqty", "qty", "quantity"));
    const price = num(t.get(r, "avgPrice", "avg fill price", "avgfillprice", "fillprice", "price", "decimalFillAvg"));
    if (!symbol || !side || !qty || price === null || ts === null) {
      skipped++;
      continue;
    }
    const e = bySymbol.get(symbol) ?? { fills: [], account: t.get(r, "account") ?? null };
    e.fills.push({ ts, side, qty, price });
    bySymbol.set(symbol, e);
  }
  if (skipped) warnings.push(`${skipped} filled row(s) skipped — missing price, quantity or time.`);
  const trades: ParsedTrade[] = [];
  for (const [symbol, { fills, account }] of bySymbol) trades.push(...roundTrips(symbol, fills, account));
  return { trades, stops };
}

/** Initial stop = the first protective stop placed around entry, on the exit side. */
export function attachStops(trades: ParsedTrade[], stops: StopOrder[]) {
  for (const t of trades) {
    const exitSide = t.direction === "LONG" ? "SELL" : "BUY";
    const candidates = stops
      .filter((s) => rootOf(s.symbol) === t.root && s.side === exitSide && s.ts >= t.entryTs - 60_000 && s.ts <= t.exitTs)
      .filter((s) => (t.direction === "LONG" ? s.stop < t.entryPrice : s.stop > t.entryPrice))
      .sort((a, b) => a.ts - b.ts);
    if (candidates[0]) t.initialStop = candidates[0].stop;
  }
}

/** Performance CSV → pair rows (for merging with other exports), or null if it's another format. */
export function performanceRowsFromCsv(text: string, tz: string, warnings: string[]): PairRow[] | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const t = table(rows);
  const has = (...h: string[]) => h.every((x) => t.headers.includes(norm(x)));
  if (!(has("buyPrice", "sellPrice") && (has("boughtTimestamp") || has("soldTimestamp")))) return null;
  return performanceCsvRows(t, tz, warnings);
}

export function parseTradeFile(text: string, tz: string): ParseResult {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("The file has no data rows.");
  const t = table(rows);
  const has = (...h: string[]) => h.every((x) => t.headers.includes(norm(x)));
  const warnings: string[] = [];

  if (has("buyPrice", "sellPrice") && (has("boughtTimestamp") || has("soldTimestamp"))) {
    const trades = pairsToTrades(performanceCsvRows(t, tz, warnings), warnings);
    return { format: "tradovate-performance", rowsRead: t.rows.length, trades, warnings };
  }
  const sideCol = ["b/s", "bs", "side", "action", "buysell"].some((h) => t.headers.includes(norm(h)));
  if (sideCol) {
    const { trades, stops } = parseFills(t, tz, warnings);
    attachStops(trades, stops);
    return { format: "fills", rowsRead: t.rows.length, trades, warnings };
  }
  throw new Error(
    `Couldn't recognise this file. Expected a Tradovate Performance or Orders export. Columns found: ${rows[0].slice(0, 12).join(", ")}`
  );
}

export function tradeHash(accountId: string, t: ParsedTrade): string {
  const key = [accountId, t.root, t.direction, t.entryTs, t.exitTs, t.qty, t.entryPrice.toFixed(6), t.exitPrice.toFixed(6)].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 40);
}

export function feesFor(t: ParsedTrade, feesMicroRt: number, feesMiniRt: number): number {
  const micro = specFor(t.symbol)?.micro ?? false;
  return Math.round(t.qty * (micro ? feesMicroRt : feesMiniRt) * 100) / 100;
}
