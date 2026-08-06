// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, localSessionStore, MatchApi, type Session } from "../src/lib/mp/api";

/**
 * What the CLIENT has to get right, which is not the same as what the wire contract says.
 *
 * The server's own tests drive the real worker in workerd and cover the protocol. These cover the four
 * things that live only on this side and that a screen would otherwise get wrong: an access token that
 * expires mid-session, an API that is deliberately unavailable, a network that is simply gone, and the
 * ETag caching the request budget depends on.
 */

const BASE = "https://api.test";

/** A scripted fetch: each entry answers one request, and the calls are recorded for assertions. */
function stub(...answers: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const next = answers.shift();
    if (!next) throw new Error(`no scripted answer for ${String(url)}`);
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetch: fn as unknown as typeof globalThis.fetch, calls, remaining: () => answers.length };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

const SESSION: Session = { userId: "u1", kind: "guest", accessToken: "a-1", refreshToken: "r-1" };

const held = (session: Session | null = SESSION) => {
  let value = session;
  return { read: () => value, write: (s: Session | null) => void (value = s), get current() { return value; } };
};

describe("signing in", () => {
  it("keeps the session it was given, so later calls carry the token", async () => {
    const store = held(null);
    const net = stub(json(SESSION), json({ matchId: "m1" }));
    const api = new MatchApi({ baseUrl: BASE, fetch: net.fetch, store });
    await api.signInAsGuest();
    expect(store.current?.accessToken).toBe("a-1");
    await api.challenge("flamengo", "f".repeat(64));
    expect((net.calls[1]!.init.headers as Record<string, string>).authorization).toBe("Bearer a-1");
  });

  it("refuses to call a protected route with no session at all", async () => {
    const net = stub();
    const api = new MatchApi({ baseUrl: BASE, fetch: net.fetch, store: held(null) });
    await expect(api.challenge("flamengo", "x")).rejects.toMatchObject({ failure: { kind: "auth" } });
    // And it did not spend a request finding out.
    expect(net.calls).toHaveLength(0);
  });
});

describe("an access token that has expired", () => {
  it("refreshes once and retries, so an hour-old tab is not logged out", async () => {
    const store = held();
    const net = stub(
      json({ error: "unauthorized" }, { status: 401 }),
      json({ accessToken: "a-2", refreshToken: "r-2", userId: "u1", kind: "guest" }),
      json({ matchId: "m1" }),
    );
    const api = new MatchApi({ baseUrl: BASE, fetch: net.fetch, store });
    await expect(api.challenge("flamengo", "hash")).resolves.toMatchObject({ matchId: "m1" });
    expect(net.calls.map((c) => c.url)).toEqual([
      `${BASE}/match/challenge`,
      `${BASE}/auth/refresh`,
      `${BASE}/match/challenge`,
    ]);
    // The retry carries the NEW token, and the new one is what survives a reload.
    expect((net.calls[2]!.init.headers as Record<string, string>).authorization).toBe("Bearer a-2");
    expect(store.current?.accessToken).toBe("a-2");
  });

  it("does not retry forever when the refresh token is dead — it ends the session", async () => {
    const store = held();
    const net = stub(json({ error: "unauthorized" }, { status: 401 }), json({ error: "unauthorized" }, { status: 401 }));
    const api = new MatchApi({ baseUrl: BASE, fetch: net.fetch, store });
    await expect(api.challenge("flamengo", "hash")).rejects.toMatchObject({ failure: { kind: "auth" } });
    // Holding a session the server rejects would make every later call fail the same way with no way out.
    expect(store.current).toBeNull();
    expect(net.calls).toHaveLength(2);
  });

  it("refreshes ONCE when several requests discover the expiry together", async () => {
    // Five parallel 401s must not become five refreshes: the rate limiter would answer for it.
    const net = stub(
      json({}, { status: 401 }),
      json({}, { status: 401 }),
      json({ accessToken: "a-2", refreshToken: "r-2", userId: "u1", kind: "guest" }),
      json({ matchId: "m1" }),
      json({ matchId: "m2" }),
    );
    const api = new MatchApi({ baseUrl: BASE, fetch: net.fetch, store: held() });
    await Promise.all([api.challenge("a", "h"), api.challenge("b", "h")]);
    expect(net.calls.filter((c) => c.url.endsWith("/auth/refresh"))).toHaveLength(1);
  });
});

describe("the failures a screen has to tell apart", () => {
  it("names the daily allowance, which is a deliberate outage and not a bug", async () => {
    // Free plan: exceeding a quota REFUSES the request rather than billing for it, and it clears at
    // 00:00 UTC. A spinner or "something went wrong" would be a lie about both cause and cure.
    const api = new MatchApi({ baseUrl: BASE, fetch: stub(new Response("<html>error 1027</html>", { status: 503 })).fetch, store: held() });
    await expect(api.challenge("a", "h")).rejects.toMatchObject({ failure: { kind: "quota" } });
  });

  it("names a refusal with the server's own code, so the screen can explain it", async () => {
    const api = new MatchApi({
      baseUrl: BASE,
      fetch: stub(json({ error: "conflict", detail: "you and the host are on different dataset builds" }, { status: 409 })).fetch,
      store: held(),
    });
    const error = await api.join("ABC123", "flamengo", "hash").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).failure).toEqual({
      kind: "refused",
      code: "conflict",
      detail: "you and the host are on different dataset builds",
    });
  });

  it("tells a network fault from a server answer", async () => {
    const api = new MatchApi({ baseUrl: BASE, fetch: stub(new TypeError("Failed to fetch")).fetch, store: held() });
    await expect(api.challenge("a", "h")).rejects.toMatchObject({ failure: { kind: "offline" } });
  });
});

describe("reading a fixture repeatedly", () => {
  it("sends the ETag back and reuses what it had on a 304", async () => {
    /*
     * The request budget depends on this. Polling two endpoints every ten seconds is 72,000 requests a
     * day against a 100,000 daily allowance — so the client asks rarely AND cheaply, and an unchanged
     * fixture must cost a 304 with no body.
     */
    const net = stub(
      json({ matchId: "m1", state: "awaiting_lineups" }, { headers: { etag: '"v1"', "content-type": "application/json" } }),
      new Response(null, { status: 304, headers: { etag: '"v1"' } }),
    );
    const api = new MatchApi({ baseUrl: BASE, fetch: net.fetch, store: held() });
    const first = await api.match("m1");
    const again = await api.match("m1");
    expect(again).toEqual(first);
    expect((net.calls[1]!.init.headers as Record<string, string>)["if-none-match"]).toBe('"v1"');
  });

  it("takes the new version when the fixture has moved on", async () => {
    const net = stub(
      json({ matchId: "m1", state: "awaiting_lineups" }, { headers: { etag: '"v1"', "content-type": "application/json" } }),
      json({ matchId: "m1", state: "determined" }, { headers: { etag: '"v2"', "content-type": "application/json" } }),
    );
    const api = new MatchApi({ baseUrl: BASE, fetch: net.fetch, store: held() });
    await api.match("m1");
    expect((await api.match("m1")).state).toBe("determined");
  });
});

describe("where the session is kept", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("survives a reload", async () => {
    const store = localSessionStore("test.session");
    const api = new MatchApi({ baseUrl: BASE, fetch: stub(json(SESSION)).fetch, store });
    await api.signInAsGuest();
    expect(new MatchApi({ baseUrl: BASE, fetch: stub().fetch, store: localSessionStore("test.session") }).current?.userId).toBe("u1");
  });

  it("ignores a stored session it cannot trust, instead of throwing on boot", async () => {
    localStorage.setItem("test.session", '{"accessToken":42}');
    expect(new MatchApi({ baseUrl: BASE, fetch: stub().fetch, store: localSessionStore("test.session") }).current).toBeNull();
    localStorage.setItem("test.session", "{not json");
    expect(new MatchApi({ baseUrl: BASE, fetch: stub().fetch, store: localSessionStore("test.session") }).current).toBeNull();
  });

  it("forgets everything on sign-out", async () => {
    const store = localSessionStore("test.session");
    const api = new MatchApi({ baseUrl: BASE, fetch: stub(json(SESSION)).fetch, store });
    await api.signInAsGuest();
    api.signOut();
    expect(store.read()).toBeNull();
  });
});
