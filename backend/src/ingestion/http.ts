const USER_AGENT = "JobAtlas/1.0 (+https://jobatlas.io; job aggregation)";

/** Feeds are a few hundred KB; anything far past that is a bug or an attack. */
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

export class FetchError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "FetchError";
  }
}

async function request(url: string, signal: AbortSignal, accept: string) {
  const response = await fetch(url, {
    signal,
    headers: { "User-Agent": USER_AGENT, Accept: accept },
  });

  if (!response.ok) {
    throw new FetchError(`GET ${url} responded ${response.status}`, response.status);
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new FetchError(`GET ${url} returned ${declaredLength} bytes, over the ${MAX_RESPONSE_BYTES} limit`);
  }

  return response;
}

export async function fetchJson<T = unknown>(url: string, signal: AbortSignal): Promise<T> {
  const response = await request(url, signal, "application/json");
  return (await response.json()) as T;
}

export async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const response = await request(url, signal, "application/rss+xml, application/xml, text/xml");
  return response.text();
}

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Some feeds ship text that was already UTF-8 decoded as Latin-1 upstream, so
 * an apostrophe arrives as mojibake (RemoteOK does this on most
 * records). Our own decoding is correct, so the only fix is to reverse the
 * upstream damage.
 *
 * The round trip validates itself: genuinely Latin-1 text such as "café"
 * yields a replacement character and is left untouched.
 */
export function repairMojibake(value: string): string {
  // A UTF-8 lead byte misread as Latin-1, followed by a continuation byte.
  if (!/[\u00c2-\u00c3\u00e0-\u00ef][\u0080-\u00bf]/.test(value)) return value;

  const repaired = Buffer.from(value, "latin1").toString("utf8");
  return repaired.includes("\ufffd") ? value : repaired;
}

export function text(value: unknown): string {
  if (typeof value === "string") return repairMojibake(value).trim();
  if (typeof value === "number") return String(value);
  return "";
}

/**
 * Upstream feeds vary on whether timestamps carry a zone. Remotive sends bare
 * local-looking stamps ("2026-08-08T21:48:06"); reading those as UTC is the
 * documented intent and avoids the value shifting with the server's timezone.
 */
export function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;

  const withZone = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw;
  const parsed = Date.parse(withZone);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/** Feeds use 0 to mean "not disclosed"; the column should stay NULL. */
export function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(text(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * `jobs` carries CHECK (salary_min <= salary_max), and a violation aborts the
 * whole insert rather than one row, so an inverted pair from upstream is
 * corrected here instead of being allowed to reach the database.
 */
export function salaryRange(minValue: unknown, maxValue: unknown): { min: number | null; max: number | null } {
  const min = positiveNumber(minValue);
  const max = positiveNumber(maxValue);
  if (min !== null && max !== null && min > max) return { min: max, max: min };
  return { min, max };
}
