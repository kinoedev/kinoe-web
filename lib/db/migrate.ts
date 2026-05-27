/**
 * Run with: npx tsx lib/db/migrate.ts
 *
 * Reads lib/db/schema.sql and applies it to whatever DATABASE_URL points at.
 * Idempotent — every CREATE uses IF NOT EXISTS.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("Set DATABASE_URL or POSTGRES_URL");

  const sql = neon(url);
  const rawSchema = readFileSync(join(process.cwd(), "lib/db/schema.sql"), "utf8");
  const schema = rawSchema
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  const statements = schema
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    process.stdout.write(`Applying: ${stmt.slice(0, 60).replace(/\s+/g, " ")}...`);
    await sql.query(stmt);
    process.stdout.write(" ok\n");
  }
  process.stdout.write("\nMigration complete.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
