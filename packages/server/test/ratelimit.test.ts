import { describe, expect, it } from "vitest";
import { isolateAllows } from "../src/ratelimit.js";
import { jsonPost, startServer } from "./harness.js";

describe("the isolate-local pre-filter", () => {
  // Tested directly rather than through a request, because it is keyed on the caller's
  // IP and the point of the design is that it stands down when there ISN'T one.
  it("allows up to the limit, then refuses within the window", () => {
    const key = `k${Math.random()}`;
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(isolateAllows(key, 3, 60_000, t0), `attempt ${i}`).toBe(true);
    expect(isolateAllows(key, 3, 60_000, t0)).toBe(false);
  });

  it("forgives once the window has passed", () => {
    const key = `k${Math.random()}`;
    const t0 = 2_000_000;
    for (let i = 0; i < 3; i++) isolateAllows(key, 3, 60_000, t0);
    expect(isolateAllows(key, 3, 60_000, t0 + 59_999)).toBe(false);
    expect(isolateAllows(key, 3, 60_000, t0 + 60_000)).toBe(true);
  });

  it("keeps separate keys separate, so one caller cannot lock out another", () => {
    const t0 = 3_000_000;
    for (let i = 0; i < 3; i++) isolateAllows("caller-a", 3, 60_000, t0);
    expect(isolateAllows("caller-a", 3, 60_000, t0)).toBe(false);
    expect(isolateAllows("caller-b", 3, 60_000, t0)).toBe(true);
  });
});

describe("the per-account token bucket", () => {
  it("throttles repeated failures against ONE account, whatever the caller", async () => {
    // This is the layer the IP-based ones cannot provide: an attacker spread across many
    // addresses is still hammering a single username, and only the account knows that.
    const server = await startServer();
    try {
      await server.json("/auth/register", jsonPost({ username: "target", derivedKey: "a".repeat(64) }));

      let refused = 0;
      let unauthorised = 0;
      // The bucket holds 10 tokens, so an eleventh attempt inside the window must be
      // refused on rate rather than on credentials.
      for (let i = 0; i < 14; i++) {
        const res = await server.json<{ error: string }>(
          "/auth/login",
          jsonPost({ username: "target", derivedKey: "b".repeat(64) }),
        );
        if (res.status === 429) refused++;
        if (res.status === 401) unauthorised++;
      }
      expect(unauthorised).toBeGreaterThan(0);
      expect(refused, "an account under attack must eventually be throttled").toBeGreaterThan(0);
      expect(unauthorised + refused).toBe(14);

      // And the throttle is on the ACCOUNT, not the caller: a different username from the
      // same place still works.
      await server.json("/auth/register", jsonPost({ username: "bystander", derivedKey: "c".repeat(64) }));
      const bystander = await server.json(
        "/auth/login",
        jsonPost({ username: "bystander", derivedKey: "c".repeat(64) }),
      );
      expect(bystander.status, "a throttled account must not lock out anyone else").toBe(200);
    } finally {
      await server.dispose();
    }
  }, 60_000);
});
