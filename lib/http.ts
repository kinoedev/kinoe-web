/**
 * fetch + JSON parse that turns non-JSON server responses (Vercel timeout / crash pages)
 * into a readable error instead of "Unexpected token '<'".
 */
export async function fetchJson<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (res.status === 504 || /timeout/i.test(text)) {
      throw new Error("The server ran out of time (Vercel's 60-second limit). Anything already downloaded is saved — click again to continue.");
    }
    if (res.status === 413) throw new Error("That upload is too large — try fewer files at once.");
    throw new Error(`The server returned an error (HTTP ${res.status}). Try again; if it keeps happening, tell Claude what you clicked.`);
  }
}

/** Parse a Response as JSON with the same friendly errors as fetchJson. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (res.status === 504 || /timeout/i.test(text)) {
      throw new Error("The server ran out of time (Vercel's 60-second limit). Anything already downloaded is saved — click again to continue.");
    }
    if (res.status === 413) throw new Error("That upload is too large — try fewer files at once.");
    throw new Error(`The server returned an error (HTTP ${res.status}). Try again; if it keeps happening, tell Claude what you clicked.`);
  }
}
