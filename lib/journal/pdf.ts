/**
 * Tradovate "Performance" PDF reports → pair rows.
 * Text is extracted with unpdf (pdf.js), regrouped into lines by y position, then matched row by row.
 */
import { getDocumentProxy } from "unpdf";
import { parseMoney, type PairRow } from "./import";
import { parseTimestamp } from "./time";

export type PdfReport = {
  rows: PairRow[];
  totals: { grossPnl: number | null; fees: number | null; totalPnl: number | null; trades: number | null };
};

export async function pdfLines(data: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(data);
  const out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const lines = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const key = [...lines.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      const l = lines.get(key) ?? [];
      l.push({ x: it.transform[4], s: it.str.trim() });
      lines.set(key, l);
    }
    for (const [, items] of [...lines.entries()].sort((a, b) => b[0] - a[0])) {
      out.push(items.sort((a, b) => a.x - b.x).map((i) => i.s).join("  "));
    }
  }
  return out;
}

const ROW =
  /^([A-Z0-9]{2,5}[FGHJKMNQUVXZ]\d{1,2})\s+(\d+)\s+([\d.,]+)\s+(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})\s+.*?(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})\s+([\d.,]+)\s+(\$\(?[\d,.]+\)?|-?\$[\d,.]+)\s*$/;

function total(lines: string[], label: string): number | null {
  for (const l of lines) {
    const i = l.indexOf(label);
    if (i === -1) continue;
    const m = l.slice(i + label.length).match(/^\s*(\$\(?[\d,.]+\)?|-?\$[\d,.]+|\d+)/);
    if (m) return m[1].includes("$") ? parseMoney(m[1]) : Number(m[1]);
  }
  return null;
}

export function parsePerformanceLines(lines: string[], tz: string): PdfReport {
  const rows: PairRow[] = [];
  for (const l of lines) {
    const m = l.trim().match(ROW);
    if (!m) continue;
    const [, symbol, qty, buy, boughtRaw, soldRaw, sell, pnl] = m;
    const bought = parseTimestamp(boughtRaw, tz);
    const sold = parseTimestamp(soldRaw, tz);
    if (bought === null || sold === null) continue;
    rows.push({
      symbol,
      qty: Number(qty),
      buyPrice: Number(buy.replace(/,/g, "")),
      sellPrice: Number(sell.replace(/,/g, "")),
      bought,
      sold,
      pnl: parseMoney(pnl),
    });
  }
  const totals = {
    grossPnl: total(lines, "Gross P/L"),
    fees: total(lines, "Trade Fees & Comm."),
    totalPnl: total(lines, "Total P/L"),
    trades: total(lines, "# of Trades"),
  };
  // The report only states total fees: spread them per contract so the file's net P&L is exact.
  const contracts = rows.reduce((s, r) => s + r.qty, 0);
  if (totals.fees !== null && contracts > 0) {
    const perContract = Math.abs(totals.fees) / contracts;
    for (const r of rows) r.feePerContract = perContract;
  }
  return { rows, totals };
}

export async function parsePerformancePdf(data: Uint8Array, tz: string): Promise<PdfReport> {
  const lines = await pdfLines(data);
  if (!lines.some((l) => l.includes("Buy Price") && l.includes("Sell Price"))) {
    throw new Error("This PDF doesn't look like a Tradovate Performance report.");
  }
  return parsePerformanceLines(lines, tz);
}
