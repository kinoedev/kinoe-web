export const AUTH_COOKIE = "kinoe_auth";
export const AUTH_TTL_SECONDS = 60 * 60 * 24 * 30;

function getSecret(): string {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) throw new Error("Missing SITE_AUTH_SECRET");
  return secret;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function signPayload(payload: string): Promise<string> {
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(sig);
}

export async function sign(payload: string): Promise<string> {
  return `${payload}.${await signPayload(payload)}`;
}

export async function verify(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sigHex = token.slice(dot + 1);

  const expectedHex = await signPayload(payload);
  if (!constantTimeEqual(sigHex, expectedHex)) return false;

  const expiresAt = Number(payload.split(":")[1]);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  return true;
}

export async function buildCookie(): Promise<string> {
  const expiresAt = Date.now() + AUTH_TTL_SECONDS * 1000;
  return sign(`v1:${expiresAt}`);
}
