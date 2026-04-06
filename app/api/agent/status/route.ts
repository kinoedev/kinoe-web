import { NextResponse } from "next/server"

export async function GET() {
  const url = process.env.N8N_STATUS_URL
  const secret = process.env.N8N_SHARED_SECRET

  if (!url) {
    return NextResponse.json(
      { ok: false, error: "Missing N8N_STATUS_URL" },
      { status: 500 }
    )
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-kinoe-secret": secret ?? "",
        Accept: "application/json",
      },
      cache: "no-store",
    })

    const text = await res.text()

    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    )
  }
}