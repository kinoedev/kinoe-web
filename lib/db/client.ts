import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

function getSql() {
  if (_sql) return _sql;
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL not set — provision Vercel Postgres and pull env vars.");
  }
  _sql = neon(connectionString);
  return _sql;
}

export const sql: NeonQueryFunction<false, false> = new Proxy(
  ((..._args: unknown[]) => {
    throw new Error("sql() called before DB initialized");
  }) as unknown as NeonQueryFunction<false, false>,
  {
    apply(_target, _thisArg, args) {
      return (getSql() as unknown as (...a: unknown[]) => unknown)(...args);
    },
    get(_target, prop) {
      const fn = getSql() as unknown as Record<string, unknown>;
      return fn[prop as string];
    },
  }
);
