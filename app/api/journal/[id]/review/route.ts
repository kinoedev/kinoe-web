import { NextRequest, NextResponse } from "next/server";
import { updateTradeReview } from "@/lib/journal/store";

type Ctx = { params: Promise<{ id: string }> };

/** Body: any of { playbook_id, rules_followed, rating, setup_type, stop_loss } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const p: Parameters<typeof updateTradeReview>[1] = {};
    if ("playbook_id" in body) p.playbook_id = (body.playbook_id as string) || null;
    if ("rules_followed" in body) p.rules_followed = Array.isArray(body.rules_followed) ? body.rules_followed.map(String) : [];
    if ("rating" in body) p.rating = body.rating === null ? null : Math.min(5, Math.max(1, Math.round(Number(body.rating))));
    if ("setup_type" in body) p.setup_type = (body.setup_type as string) || null;
    if ("stop_loss" in body) p.stop_loss = body.stop_loss === null || body.stop_loss === "" ? null : Number(body.stop_loss);
    const entry = await updateTradeReview(id, p);
    if (!entry) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
