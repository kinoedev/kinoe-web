import { NextRequest, NextResponse } from "next/server";
import { cleanAccountInput, refreshAccountFees, updateAccount } from "@/lib/journal/store";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const patch = cleanAccountInput(body);
    const account = await updateAccount(id, patch);
    if (!account) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if ("fees_micro_rt" in patch || "fees_mini_rt" in patch) await refreshAccountFees(id);
    return NextResponse.json({ ok: true, account });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
