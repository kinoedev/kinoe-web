import { NextResponse } from "next/server";

const CHECKED_VARS = [
  "OANDA_API_KEY",
  "OANDA_ACCOUNT_ID",
  "OANDA_ACCOUNT_TYPE",
  "ANTHROPIC_API_KEY",
  "AI_PROVIDER",
  "AI_MODEL_ANTHROPIC",
  "AI_MODEL_SCANNER",
  "DATABASE_URL",
  "SITE_PASSWORD",
  "SITE_AUTH_SECRET",
  "N8N_STATUS_URL",
];

export async function GET() {
  const vars: Record<string, boolean> = {};
  for (const key of CHECKED_VARS) {
    vars[key] = !!process.env[key];
  }

  return NextResponse.json({
    ok: true,
    vars,
    oanda_type: process.env.OANDA_ACCOUNT_TYPE || "practice",
  });
}
