import { NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { creditSpent } from "@/lib/futures/store";
import { costLimit } from "@/lib/futures/scanner";

/** Cheap status for the sidebar and settings — database only, no Databento calls. */
export async function GET() {
  const configured = !!process.env.DATABENTO_API_KEY;
  try {
    const [spend, rows] = await Promise.all([
      creditSpent(),
      sql`SELECT MAX(created_at) AS scanned_at, MAX(as_of) AS data_through FROM futures_zone_snapshots`,
    ]);
    const last = rows as { scanned_at: string | null; data_through: string | null }[];
    return NextResponse.json({
      ok: true,
      configured,
      scannedAt: last[0]?.scanned_at ?? null,
      dataThrough: last[0]?.data_through ?? null,
      spend,
      limit: costLimit(),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, configured, error: err instanceof Error ? err.message : "Status failed" });
  }
}
