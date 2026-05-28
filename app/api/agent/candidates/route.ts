import { NextResponse } from "next/server";
import { listAgentCandidates } from "@/lib/db/queries";

export async function GET() {
  try {
    const candidates = await listAgentCandidates(50);
    return NextResponse.json({ ok: true, candidates });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load candidates" },
      { status: 500 }
    );
  }
}
