import type { Env } from "./env.js";

/**
 * Cross-origin access, because the site and the API are never the same origin.
 *
 * In production the app is served from `*.pages.dev` and this Worker from `*.workers.dev`; in
 * development the app is on `localhost:5173` and the Worker on `127.0.0.1:8787`. Every call the client
 * makes is therefore cross-origin, and a browser will not even SEND a JSON POST without a successful
 * preflight — the failure looks like the server rejecting the request when the request never happened.
 *
 * AN ALLOWLIST, NOT `*`. It costs nothing here (the allowlist is a var, not a lookup) and it keeps the
 * answer honest: a wildcard would invite any page on the internet to drive somebody's session if a
 * future route ever moved the token out of a header and into a cookie. The origin is ECHOED rather than
 * returned as the literal list, which is what the spec requires, and `Vary: Origin` goes with it so a
 * cache cannot serve one origin's answer to another.
 *
 * Unknown origins get no CORS headers at all rather than an error: the request still runs, the browser
 * still refuses to hand over the response, and nothing here has to guess whether a caller is a browser.
 */

/** Dev origins are always allowed. Anything else comes from `ALLOWED_ORIGINS`, comma-separated. */
const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

function allowed(env: Env): readonly string[] {
  const configured = (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter((o) => o.length > 0);
  return [...DEV_ORIGINS, ...configured];
}

/** The headers for this request's origin, or nothing when we do not know it. */
export function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !allowed(env).includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    vary: "Origin",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    // `if-none-match` is on the list because the room is polled with it — without it every poll costs a
    // full body, which is the difference between 100 requests a day and the whole free allowance.
    "access-control-allow-headers": "authorization, content-type, if-none-match",
    "access-control-expose-headers": "etag",
    "access-control-max-age": "86400",
  };
}

/**
 * The preflight answer.
 *
 * 204 with no body, and only for an origin we allow — an OPTIONS from anywhere else falls through to the
 * router and gets the same 404 any unknown route does.
 */
export function preflight(request: Request, env: Env): Response | null {
  if (request.method !== "OPTIONS") return null;
  const headers = corsHeaders(request, env);
  if (Object.keys(headers).length === 0) return null;
  return new Response(null, { status: 204, headers });
}

/** Copy the CORS headers onto a response the router has already built. */
export function withCors(response: Response, headers: Record<string, string>): Response {
  if (Object.keys(headers).length === 0) return response;
  const merged = new Headers(response.headers);
  for (const [k, v] of Object.entries(headers)) merged.set(k, v);
  // A 304 must keep its status and empty body; `new Response(null, …)` is the only safe copy for it.
  return new Response(response.status === 204 || response.status === 304 ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}
