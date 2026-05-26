import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, AUTH_TTL_SECONDS, buildCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "Server missing SITE_PASSWORD" }, { status: 500 });
  }

  let password: string | undefined;
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : undefined;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  if (!password) {
    return NextResponse.json({ ok: false, error: "Password required" }, { status: 400 });
  }

  const a = new TextEncoder().encode(password);
  const b = new TextEncoder().encode(expected);
  let mismatch = a.length !== b.length ? 1 : 0;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);

  if (mismatch !== 0) {
    return NextResponse.json({ ok: false, error: "Wrong password" }, { status: 401 });
  }

  const cookie = await buildCookie();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_TTL_SECONDS,
  });
  return res;
}
