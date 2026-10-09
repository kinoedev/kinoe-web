import { NextRequest, NextResponse } from "next/server";
import { getNote, listTrades, saveNote, type DailyNote } from "@/lib/journal/store";

type Ctx = { params: Promise<{ day: string }> };
const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { day } = await params;
  if (!valid(day)) return NextResponse.json({ ok: false, error: "Bad date" }, { status: 400 });
  try {
    const [note, trades] = await Promise.all([getNote(day), listTrades({ from: day, to: day })]);
    return NextResponse.json({ ok: true, note, trades });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { day } = await params;
  if (!valid(day)) return NextResponse.json({ ok: false, error: "Bad date" }, { status: 400 });
  try {
    const body = (await req.json()) as Partial<DailyNote>;
    const rating = body.rating === null || body.rating === undefined ? null : Math.min(5, Math.max(1, Math.round(Number(body.rating))));
    const note = await saveNote(day, { ...body, rating });
    return NextResponse.json({ ok: true, note });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
