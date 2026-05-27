import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const provided = req.headers.get("x-admin-token");
  const expected = process.env.MIGRATE_TOKEN;

  if (!expected) {
    return NextResponse.json({ ok: false, error: "MIGRATE_TOKEN not set" }, { status: 500 });
  }
  if (!provided || provided !== expected) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const rows = await sql`
      SELECT id, pair, timeframe, direction, outcome, r_multiple, exit_price, review_md, created_at, updated_at
      FROM journal_entries
      ORDER BY created_at DESC
      LIMIT 10
    `;
    const countRows = await sql`SELECT COUNT(*)::int AS n FROM journal_entries`;
    return NextResponse.json({ ok: true, count: countRows[0]?.n ?? 0, recent: rows });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
