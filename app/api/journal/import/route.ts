import { NextRequest, NextResponse } from "next/server";
import { feesFor } from "@/lib/journal/import";
import { parseUploads, type UploadFile } from "@/lib/journal/ingest";
import { deleteImport, getAccount, importTrades, listImports } from "@/lib/journal/store";

export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, imports: await listImports() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

/**
 * Body: { accountId, files: [{ name, text? , base64? }], dryRun? }
 * Tradovate Performance PDFs/CSVs and Orders CSVs. Overlapping exports are merged; trades already
 * in the journal are skipped. dryRun returns a preview without saving.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { accountId?: string; files?: UploadFile[]; dryRun?: boolean };
    if (!body.accountId) return NextResponse.json({ ok: false, error: "Pick an account first" }, { status: 400 });
    const files = (body.files ?? []).filter((f) => f && f.name && (f.text || f.base64));
    if (!files.length) return NextResponse.json({ ok: false, error: "No files" }, { status: 400 });
    const account = await getAccount(body.accountId);
    if (!account) return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });

    const { result, checks } = await parseUploads(files, account.timezone);
    const t = result.trades;
    if (body.dryRun) {
      const fees = t.reduce((s, x) => s + (x.fees ?? feesFor(x, account.fees_micro_rt, account.fees_mini_rt)), 0);
      const gross = t.reduce((s, x) => s + x.grossPnl, 0);
      return NextResponse.json({
        ok: true,
        preview: {
          format: result.format,
          rowsRead: result.rowsRead,
          trades: t.length,
          from: t.length ? Math.min(...t.map((x) => x.entryTs)) : null,
          to: t.length ? Math.max(...t.map((x) => x.exitTs)) : null,
          gross,
          fees,
          net: gross - fees,
          feesFromReport: t.some((x) => x.fees !== null),
          symbols: [...new Set(t.map((x) => x.root))],
          withStops: t.filter((x) => x.initialStop !== null).length,
          warnings: result.warnings,
          checks,
          sample: t.slice(-8).reverse().map((x) => ({
            symbol: x.symbol,
            direction: x.direction,
            qty: x.qty,
            entryTs: x.entryTs,
            exitTs: x.exitTs,
            entryPrice: x.entryPrice,
            exitPrice: x.exitPrice,
            grossPnl: x.grossPnl,
          })),
        },
      });
    }
    const name = files.length === 1 ? files[0].name : `${files.length} files`;
    const res = await importTrades(account.id, name, result);
    return NextResponse.json({ ok: true, result: res, warnings: result.warnings, checks });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Import failed" }, { status: 400 });
  }
}

/** ?id= — undo an import (removes the trades it created). */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  try {
    const removed = await deleteImport(id);
    return NextResponse.json({ ok: true, removed });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
