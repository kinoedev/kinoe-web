import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { neon } from "@neondatabase/serverless";

export async function POST(req: NextRequest) {
  const provided = req.headers.get("x-admin-token");
  const expected = process.env.MIGRATE_TOKEN;

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "MIGRATE_TOKEN not set" },
      { status: 500 }
    );
  }
  if (!provided || provided !== expected) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL not set" },
      { status: 500 }
    );
  }

  const sql = neon(url);
  const schema = readFileSync(join(process.cwd(), "lib/db/schema.sql"), "utf8");
  const statements = schema
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  const applied: string[] = [];
  try {
    for (const stmt of statements) {
      await sql.query(stmt);
      applied.push(stmt.slice(0, 80).replace(/\s+/g, " "));
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
        applied,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, applied_count: applied.length, applied });
}
