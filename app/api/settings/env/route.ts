import { NextResponse } from "next/server";

const CHECKED_VARS = [
  "DATABENTO_API_KEY",
  "DATABENTO_MAX_COST_USD",
  "ANTHROPIC_API_KEY",
  "AI_PROVIDER",
  "AI_MODEL_ANTHROPIC",
  "DATABASE_URL",
  "SITE_PASSWORD",
  "SITE_AUTH_SECRET",
];

export async function GET() {
  const vars: Record<string, boolean> = {};
  for (const key of CHECKED_VARS) {
    vars[key] = !!process.env[key];
  }

  return NextResponse.json({
    ok: true,
    vars,
  });
}
