/** Small HTTP helpers. Every response is JSON; every error names a machine code. */

export type ErrorCode =
  | "badRequest"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "rateLimited"
  | "quotaExceeded"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  rateLimited: 429,
  quotaExceeded: 503,
  internal: 500,
};

export function ok(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, { status: 200, ...init });
}

/**
 * `code` is for the client to branch on and `detail` is for a person to read. Kept
 * separate so the wording can change without breaking a client, and so a detail can be
 * vague where being specific would leak (see the login handler).
 */
export function fail(code: ErrorCode, detail?: string, init: ResponseInit = {}): Response {
  return Response.json({ error: code, detail }, { status: STATUS[code], ...init });
}

/** Parse a JSON body, refusing anything that is not a plain object. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get("content-type")?.includes("application/json") !== true) return null;
  try {
    const value: unknown = await request.json();
    if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function str(body: Record<string, unknown>, key: string, max = 512): string | null {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0 || value.length > max) return null;
  return value;
}
