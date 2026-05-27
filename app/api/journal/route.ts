import { NextRequest, NextResponse } from "next/server";
import { createJournalEntry, listJournalEntries } from "@/lib/db/queries";
import type { NewJournalEntry } from "@/lib/db/types";

export async function GET() {
  try {
    const entries = await listJournalEntries();
    return NextResponse.json({ ok: true, entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: NewJournalEntry;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.pair || !body.timeframe || !body.direction) {
    return NextResponse.json(
      { ok: false, error: "pair, timeframe, and direction are required" },
      { status: 400 }
    );
  }
  if (body.direction !== "LONG" && body.direction !== "SHORT") {
    return NextResponse.json(
      { ok: false, error: "direction must be LONG or SHORT" },
      { status: 400 }
    );
  }

  try {
    const entry = await createJournalEntry(body);
    return NextResponse.json({ ok: true, entry }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
