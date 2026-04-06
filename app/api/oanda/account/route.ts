import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.OANDA_API_KEY;
  const accountId = process.env.OANDA_ACCOUNT_ID;

  if (!apiKey || !accountId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing OANDA_API_KEY or OANDA_ACCOUNT_ID in .env.local",
      },
      { status: 500 }
    );
  }

  const baseUrl = "https://api-fxpractice.oanda.com";
  const url = `${baseUrl}/v3/accounts/${accountId}/summary`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: res.status,
          body: text,
        },
        { status: res.status }
      );
    }

    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Unexpected error",
      },
      { status: 500 }
    );
  }
}