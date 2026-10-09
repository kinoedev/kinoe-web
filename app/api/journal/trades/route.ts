import { NextRequest, NextResponse } from "next/server";
import { ensureDefaultPlaybooks, listAccounts, listNoteDays, listPlaybooks, listTrades } from "@/lib/journal/store";

/** Closed trades for the dashboard/reports, plus the lookups the pages need. ?account=&from=&to= */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  try {
    await ensureDefaultPlaybooks();
    const from = q.get("from");
    const to = q.get("to");
    const [trades, accounts, playbooks, notes] = await Promise.all([
      listTrades({ accountId: q.get("account") || null, from, to }),
      listAccounts(),
      listPlaybooks(),
      listNoteDays(from ?? "1900-01-01", to ?? "2999-12-31"),
    ]);
    return NextResponse.json({ ok: true, trades, accounts, playbooks, notes });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
