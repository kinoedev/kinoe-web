import { NextRequest, NextResponse } from "next/server";
import { getAgentSettings, updateAgentSettings } from "@/lib/db/queries";

export async function GET() {
  try {
    const settings = await getAgentSettings();
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const settings = await updateAgentSettings(body);
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to update settings" },
      { status: 500 }
    );
  }
}
