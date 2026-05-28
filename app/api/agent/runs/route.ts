import { NextResponse } from "next/server";
import { listAgentRuns } from "@/lib/db/queries";

export async function GET() {
  try {
    const runs = await listAgentRuns(20);
    return NextResponse.json({ ok: true, runs });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load runs" },
      { status: 500 }
    );
  }
}
