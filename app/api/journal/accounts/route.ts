import { NextRequest, NextResponse } from "next/server";
import { cleanAccountInput, createAccount, listAccounts } from "@/lib/journal/store";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, accounts: await listAccounts() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const account = await createAccount(cleanAccountInput(body));
    return NextResponse.json({ ok: true, account }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
