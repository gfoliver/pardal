import { ENGINE_VERSION, MatchProtocol } from "@fut/protocol";
import { handleAuth } from "./auth/routes.js";
import type { Env } from "./env.js";
import { fail, ok } from "./http.js";

export { RateLimiter } from "./durable/RateLimiter.js";

/**
 * The API.
 *
 * It is a NOTARY, not a simulator. On the Cloudflare free plan a Worker gets 10ms of CPU
 * per invocation, and a spatial match costs about 6,400ms — so the server mints seeds,
 * seals and publishes inputs, and records and compares results, while the clients do the
 * arithmetic. That is not a limitation being worked around; it is the architecture, and
 * it holds because the simulation is bit-identical on every runtime (there is a
 * conformance harness that proves it against V8, SpiderMonkey, JavaScriptCore and
 * workerd).
 *
 * Free-plan behaviour worth knowing while reading this: exceeding a quota REFUSES the
 * operation, it never bills. So a flood produces an outage until 00:00 UTC rather than an
 * invoice, and the static site plus single-player career keep working throughout. That
 * trade is deliberate — see the cost-zero guard in the tests.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // The clock is read ONCE, here, and passed down. Nothing below reaches for it, so
    // every handler is testable at an arbitrary instant and nothing depends on how long
    // a request took.
    const nowMs = Date.now();
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (path === "/" || path === "/health") {
        return ok({
          service: "fut-api",
          engineVersion: ENGINE_VERSION,
          protocolVersion: MatchProtocol.version,
        });
      }

      const auth = await handleAuth(request, env, nowMs, path);
      if (auth) return auth;

      return fail("notFound", `no route for ${request.method} ${path}`);
    } catch (error) {
      // Never echo the error to the caller: at this point it may contain a bound SQL
      // value, which for these routes means a password-equivalent derived key.
      console.error("unhandled", { path, method: request.method, error: String(error) });
      return fail("internal");
    }
  },
} satisfies ExportedHandler<Env>;
