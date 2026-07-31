import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jsonPost, startServer, type TestServer } from "./harness.js";

/** Stands in for the client-side PBKDF2 output. Any fixed 64-hex string will do here. */
const dk = (seed: string): string => seed.padEnd(64, "0").slice(0, 64);

let server: TestServer;
beforeAll(async () => {
  server = await startServer();
}, 60_000);
afterAll(async () => {
  await server.dispose();
});

interface SessionBody {
  userId: string;
  kind?: string;
  accessToken: string;
  refreshToken: string;
  recoveryCode?: string;
}

describe("the salt endpoint", () => {
  it("answers for an account that does not exist, identically to one that does", async () => {
    // The whole reason the salt is derived rather than stored. If this endpoint could be
    // used to tell a real username from an invented one, it would be the enumeration
    // oracle everything else is built to avoid.
    const unknown = await server.json<{ salt: string }>("/auth/salt?u=nobody-at-all");
    expect(unknown.status).toBe(200);
    expect(unknown.body.salt).toMatch(/^[0-9a-f]{64}$/);

    await server.json("/auth/register", jsonPost({ username: "realuser", derivedKey: dk("a") }));
    const known = await server.json<{ salt: string }>("/auth/salt?u=realuser");
    expect(known.status).toBe(unknown.status);
    expect(Object.keys(known.body).sort()).toEqual(Object.keys(unknown.body).sort());
  });

  it("gives the same salt every time, and a different one per username", async () => {
    const a = await server.json<{ salt: string }>("/auth/salt?u=sameperson");
    const b = await server.json<{ salt: string }>("/auth/salt?u=sameperson");
    const c = await server.json<{ salt: string }>("/auth/salt?u=otherperson");
    expect(a.body.salt).toBe(b.body.salt);
    expect(a.body.salt).not.toBe(c.body.salt);
  });

  it("normalises the username, so case and width cannot fork an account", async () => {
    const lower = await server.json<{ salt: string }>("/auth/salt?u=casetest");
    const upper = await server.json<{ salt: string }>("/auth/salt?u=CaseTest");
    expect(upper.body.salt).toBe(lower.body.salt);
  });
});

describe("registration and login", () => {
  it("registers, then logs in with the same derived key", async () => {
    const reg = await server.json<SessionBody>(
      "/auth/register",
      jsonPost({ username: "alice", derivedKey: dk("alice-key") }),
    );
    expect(reg.status).toBe(200);
    expect(reg.body.accessToken).toMatch(/^v1\./);
    // Shown exactly once, and there is no email reset — so the response has to carry it
    // and say so.
    expect(reg.body.recoveryCode).toMatch(/^[A-Z2-9-]+$/);

    const login = await server.json<SessionBody>(
      "/auth/login",
      jsonPost({ username: "alice", derivedKey: dk("alice-key") }),
    );
    expect(login.status).toBe(200);
    expect(login.body.userId).toBe(reg.body.userId);
  });

  it("logs in under any casing of the registered name", async () => {
    await server.json("/auth/register", jsonPost({ username: "Bob.Smith", derivedKey: dk("bob") }));
    const login = await server.json<SessionBody>(
      "/auth/login",
      jsonPost({ username: "BOB.SMITH", derivedKey: dk("bob") }),
    );
    expect(login.status).toBe(200);
  });

  it("refuses a taken username, whatever the casing", async () => {
    await server.json("/auth/register", jsonPost({ username: "carol", derivedKey: dk("c") }));
    const dup = await server.json<{ error: string }>(
      "/auth/register",
      jsonPost({ username: "CAROL", derivedKey: dk("other") }),
    );
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("conflict");
  });

  it("says the same thing for an unknown user as for a wrong password", async () => {
    // Otherwise the login form becomes the enumeration oracle the salt endpoint is not.
    await server.json("/auth/register", jsonPost({ username: "dave", derivedKey: dk("dave") }));
    const wrongPassword = await server.json<{ error: string; detail: string }>(
      "/auth/login",
      jsonPost({ username: "dave", derivedKey: dk("wrong") }),
    );
    const noSuchUser = await server.json<{ error: string; detail: string }>(
      "/auth/login",
      jsonPost({ username: "not-a-user", derivedKey: dk("wrong") }),
    );
    expect(wrongPassword.status).toBe(noSuchUser.status);
    expect(wrongPassword.body).toEqual(noSuchUser.body);
  });

  it("rejects a malformed username before touching the database", async () => {
    for (const username of ["ab", "a".repeat(40), "has space", "emoji🙂"]) {
      const res = await server.json<{ error: string }>(
        "/auth/register",
        jsonPost({ username, derivedKey: dk("x") }),
      );
      expect(res.status, username).toBe(400);
    }
  });
});

describe("guests", () => {
  it("issues a working session with no username at all", async () => {
    const guest = await server.json<SessionBody>("/auth/guest", jsonPost({}));
    expect(guest.status).toBe(200);
    expect(guest.body.kind).toBe("guest");

    const me = await server.json<{ kind: string; username: string | null }>("/me", {
      headers: { authorization: `Bearer ${guest.body.accessToken}` },
    });
    expect(me.body.kind).toBe("guest");
    expect(me.body.username).toBeNull();
  });

  it("upgrades to a real account, keeping the same user id", async () => {
    const guest = await server.json<SessionBody>("/auth/guest", jsonPost({}));
    const claimed = await server.json<SessionBody>(
      "/auth/claim",
      jsonPost({ username: "erin", derivedKey: dk("erin") }, guest.body.accessToken),
    );
    expect(claimed.status).toBe(200);
    // The id must survive: it is what every result, rating and league membership hangs on.
    expect(claimed.body.userId).toBe(guest.body.userId);
    expect(claimed.body.kind).toBe("full");

    const login = await server.json<SessionBody>(
      "/auth/login",
      jsonPost({ username: "erin", derivedKey: dk("erin") }),
    );
    expect(login.body.userId).toBe(guest.body.userId);
  });

  it("cannot be claimed twice, and a retry is harmless", async () => {
    const guest = await server.json<SessionBody>("/auth/guest", jsonPost({}));
    const first = await server.json(
      "/auth/claim",
      jsonPost({ username: "frank", derivedKey: dk("f") }, guest.body.accessToken),
    );
    expect(first.status).toBe(200);
    // The guard is `WHERE kind = 'guest'` and the row count, so a repeat is refused
    // rather than applied twice — which is what makes the operation safe to retry.
    const second = await server.json<{ error: string }>(
      "/auth/claim",
      jsonPost({ username: "frank2", derivedKey: dk("f") }, guest.body.accessToken),
    );
    expect(second.status).toBe(409);
  });

  it("does not consume the guest token when the username is taken", async () => {
    await server.json("/auth/register", jsonPost({ username: "taken", derivedKey: dk("t") }));
    const guest = await server.json<SessionBody>("/auth/guest", jsonPost({}));
    const collision = await server.json<{ error: string }>(
      "/auth/claim",
      jsonPost({ username: "taken", derivedKey: dk("g") }, guest.body.accessToken),
    );
    expect(collision.status).toBe(409);
    // Still a guest, and still able to try another name — losing the account to a typo
    // would be an unforgivable way to fail.
    const retry = await server.json<SessionBody>(
      "/auth/claim",
      jsonPost({ username: "not-taken", derivedKey: dk("g") }, guest.body.accessToken),
    );
    expect(retry.status).toBe(200);
    expect(retry.body.userId).toBe(guest.body.userId);
  });
});

describe("tokens", () => {
  it("rejects a tampered access token", async () => {
    const guest = await server.json<SessionBody>("/auth/guest", jsonPost({}));
    const [prefix, body, signature] = guest.body.accessToken.split(".") as [string, string, string];
    // A payload edit must fail on the SIGNATURE, before anything in it is parsed or
    // trusted — the claims are attacker-controlled until then.
    const forged = `${prefix}.${btoa('{"userId":"someone-else","kind":"full","exp":9999999999}')
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")}.${signature}`;
    const res = await server.fetch("/me", { headers: { authorization: `Bearer ${forged}` } });
    expect(res.status).toBe(401);
  });

  it("refreshes, and burns the refresh token in doing so", async () => {
    const guest = await server.json<SessionBody>("/auth/guest", jsonPost({}));
    const first = await server.json<SessionBody>(
      "/auth/refresh",
      jsonPost({ refreshToken: guest.body.refreshToken }),
    );
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(guest.body.refreshToken);

    // Single use: a stolen refresh token is worth exactly one refresh, and the real
    // holder being logged out is the signal that it was stolen.
    const replay = await server.json<{ error: string }>(
      "/auth/refresh",
      jsonPost({ refreshToken: guest.body.refreshToken }),
    );
    expect(replay.status).toBe(401);
  });

  it("rotate invalidates every refresh token the account has", async () => {
    const guest = await server.json<SessionBody>("/auth/guest", jsonPost({}));
    const second = await server.json<SessionBody>(
      "/auth/refresh",
      jsonPost({ refreshToken: guest.body.refreshToken }),
    );
    const rotated = await server.json<{ revoked: number }>(
      "/auth/rotate",
      jsonPost({}, second.body.accessToken),
    );
    expect(rotated.status).toBe(200);
    expect(rotated.body.revoked).toBeGreaterThanOrEqual(1);

    const dead = await server.json("/auth/refresh", jsonPost({ refreshToken: second.body.refreshToken }));
    expect(dead.status).toBe(401);
  });

  it("requires a token where a token is required", async () => {
    expect((await server.fetch("/me")).status).toBe(401);
    expect((await server.fetch("/me", { headers: { authorization: "Bearer nonsense" } })).status).toBe(401);
    expect((await server.fetch("/auth/rotate", { method: "POST" })).status).toBe(401);
  });
});

describe("the service itself", () => {
  it("reports the engine and protocol it speaks", async () => {
    // A client that disagrees with these two numbers cannot usefully attest anything, so
    // they are the first thing the API says about itself.
    const res = await server.json<{ engineVersion: string; protocolVersion: number }>("/health");
    expect(res.body.engineVersion).toMatch(/^[0-9a-f]{16}$/);
    expect(res.body.protocolVersion).toBe(1);
  });

  it("404s an unknown route without leaking anything", async () => {
    const res = await server.json<{ error: string }>("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("notFound");
  });
});
