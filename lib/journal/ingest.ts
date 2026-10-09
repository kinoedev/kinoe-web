import { mergePairRows, pairsToTrades, parseTradeFile, performanceRowsFromCsv, type PairRow, type ParseResult, type ParsedTrade } from "./import";
import { parsePerformancePdf } from "./pdf";

export type UploadFile = { name: string; text?: string; base64?: string };

export type FileCheck = {
  name: string;
  kind: "pdf" | "csv-performance" | "csv-fills";
  rows: number;
  /** Totals printed in the report, when it has them. */
  reportGross: number | null;
  reportFees: number | null;
  reportNet: number | null;
  reportTrades: number | null;
  /** Our gross from the same rows — should equal reportGross. */
  parsedGross: number;
  error?: string;
};

const rowsGross = (rows: PairRow[]) => rows.reduce((s, r) => s + (r.pnl ?? 0), 0);

/** Parse every uploaded file, merge overlapping performance exports, and build trades once. */
export async function parseUploads(files: UploadFile[], tz: string): Promise<{ result: ParseResult; checks: FileCheck[] }> {
  const warnings: string[] = [];
  const checks: FileCheck[] = [];
  const pairSets: PairRow[][] = [];
  const fillTrades: ParsedTrade[] = [];
  let rowsRead = 0;
  let sawPdf = false;
  let sawFills = false;

  for (const f of files) {
    try {
      const isPdf = f.name.toLowerCase().endsWith(".pdf") || (!!f.base64 && !f.text);
      if (isPdf) {
        if (!f.base64) throw new Error("PDF content missing");
        const rep = await parsePerformancePdf(new Uint8Array(Buffer.from(f.base64, "base64")), tz);
        sawPdf = true;
        rowsRead += rep.rows.length;
        pairSets.push(rep.rows);
        checks.push({
          name: f.name,
          kind: "pdf",
          rows: rep.rows.length,
          reportGross: rep.totals.grossPnl,
          reportFees: rep.totals.fees,
          reportNet: rep.totals.totalPnl,
          reportTrades: rep.totals.trades,
          parsedGross: rowsGross(rep.rows),
        });
        if (rep.totals.trades !== null && rep.totals.trades !== rep.rows.length) {
          warnings.push(`${f.name}: read ${rep.rows.length} of ${rep.totals.trades} trade rows.`);
        }
        continue;
      }
      const text = f.text ?? Buffer.from(f.base64 ?? "", "base64").toString("utf8");
      const perf = performanceRowsFromCsv(text, tz, warnings);
      if (perf) {
        rowsRead += perf.length;
        pairSets.push(perf);
        checks.push({ name: f.name, kind: "csv-performance", rows: perf.length, reportGross: null, reportFees: null, reportNet: null, reportTrades: null, parsedGross: rowsGross(perf) });
        continue;
      }
      const parsed = parseTradeFile(text, tz);
      sawFills = true;
      rowsRead += parsed.rowsRead;
      warnings.push(...parsed.warnings.map((w) => `${f.name}: ${w}`));
      fillTrades.push(...parsed.trades);
      checks.push({
        name: f.name,
        kind: "csv-fills",
        rows: parsed.rowsRead,
        reportGross: null,
        reportFees: null,
        reportNet: null,
        reportTrades: null,
        parsedGross: parsed.trades.reduce((s, t) => s + t.grossPnl, 0),
      });
    } catch (err) {
      checks.push({
        name: f.name,
        kind: "csv-fills",
        rows: 0,
        reportGross: null,
        reportFees: null,
        reportNet: null,
        reportTrades: null,
        parsedGross: 0,
        error: err instanceof Error ? err.message : "Couldn't read file",
      });
    }
  }

  // Biggest export first, so when files overlap the most complete report's rows (and fee rate) win.
  const merged = mergePairRows([...pairSets].sort((a, b) => b.length - a.length));
  const trades = [...pairsToTrades(merged, warnings), ...fillTrades].sort((a, b) => a.entryTs - b.entryTs);
  const format: ParseResult["format"] = sawPdf ? "tradovate-pdf" : sawFills && !pairSets.length ? "fills" : "tradovate-performance";
  return { result: { format, rowsRead, trades, warnings }, checks };
}
