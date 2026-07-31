import { normaliseRecoveryCode, randomToken, recoveryCode, timingSafeEqual } from "../crypto.js";
import type { Env } from "../env.js";
import { fail, ok, readJson, str } from "../http.js";
import { accountAllows, identifiedIp, ipAllows, isolateAllows } from "../ratelimit.js";
import {
  deriveSalt,
  normaliseUsername,
  storedPasswordHash,
  storedRecoveryHash,
  storedTokenHash,
  validateUsername,
} from "./identity.js";
import { REFRESH_TTL_SECONDS, signAccessToken, verifyAccessToken } from "./tokens.js";

/**
 * Accounts, in the shape the product allows: a username, a password, and no email
 * anywhere — so also no email verification, no password-reset link, and no SMTP bill.
 *
 * The honest consequence, stated here because it must not be discovered later: THERE IS
 * NO PASSWORD RESET. What exists instead is a recovery code shown once at signup, and
 * (later) a league admin able to reset a member out of band, logged publicly to the
 * league feed so it cannot be done quietly.
 */

interface Session {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}

async function issueSession(
  env: Env,
  userId: string,
  kind: "guest" | "full",
  nowMs: number,
  label: string,
): Promise<Session> {
  const nowSeconds = Math.floor(nowMs / 1000);
  const refreshToken = randomToken();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, label) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(
      await storedTokenHash(refreshToken),
      userId,
      nowMs,
      nowMs + REFRESH_TTL_SECONDS * 1000,
      label,
    )
    .run();
  return {
    accessToken: await signAccessToken(env, { userId, kind }, nowSeconds),
    refreshToken,
    expiresIn: 3600,
  };
}

/** Who is calling, from the Authorization header. */
export async function authenticate(
  env: Env,
  request: Request,
  nowMs: number,
): Promise<{ userId: string; kind: "guest" | "full" } | null> {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ") !== true) return null;
  const result = await verifyAccessToken(env, header.slice(7), Math.floor(nowMs / 1000));
  if ("error" in result) return null;
  return { userId: result.claims.userId, kind: result.claims.kind };
}

export async function handleAuth(
  request: Request,
  env: Env,
  nowMs: number,
  path: string,
): Promise<Response | null> {
  const ip = identifiedIp(request);

  /**
   * Caller-based limiting, skipped when we cannot identify the caller — see
   * `identifiedIp` for why a placeholder key would be worse than no key. The
   * account-based limiter on login does not depend on this and always runs.
   */
  const callerAllows = async (bucket: string, limit: number): Promise<boolean> => {
    if (ip === null) return true;
    if (!isolateAllows(`${bucket}:${ip}`, limit, 60_000, nowMs)) return false;
    return ipAllows(env, ip);
  };

  // ---------------------------------------------------------------- salt
  if (path === "/auth/salt" && request.method === "GET") {
    const username = new URL(request.url).searchParams.get("u");
    if (username === null || username.length > 64) return fail("badRequest", "u is required");
    // Answers for every string, existing account or not, without touching the database.
    // That is the whole design: a stored salt would force us either to look up a row —
    // and answer differently for an account that does not exist — or to invent one,
    // which then has to be stable per username or two requests reveal the difference.
    return ok({ salt: await deriveSalt(env, username), iterations: 600_000, hash: "SHA-256" });
  }

  // ------------------------------------------------------------- register
  if (path === "/auth/register" && request.method === "POST") {
    if (!(await callerAllows("register", 10))) return fail("rateLimited");

    const body = await readJson(request);
    if (!body) return fail("badRequest", "expected a JSON object");
    const username = str(body, "username", 64);
    const derivedKey = str(body, "derivedKey", 256);
    if (!username || !derivedKey) return fail("badRequest", "username and derivedKey required");

    const problem = validateUsername(username);
    if (problem) return fail("badRequest", `username: ${problem.detail}`);

    const norm = normaliseUsername(username);
    const code = recoveryCode();
    const userId = crypto.randomUUID();
    try {
      await env.DB.prepare(
        `INSERT INTO users (id, username_norm, username, pw_hash, recovery_hash, kind, created_at)
         VALUES (?, ?, ?, ?, ?, 'full', ?)`,
      )
        .bind(
          userId,
          norm,
          username.trim(),
          await storedPasswordHash(env, derivedKey),
          await storedRecoveryHash(env, normaliseRecoveryCode(code)),
          nowMs,
        )
        .run();
    } catch {
      // The UNIQUE index on username_norm is the arbiter, not a prior SELECT: checking
      // first and inserting second is a race, and under it two people can claim the
      // same name.
      return fail("conflict", "that username is taken");
    }

    const session = await issueSession(env, userId, "full", nowMs, "registration");
    return ok({
      userId,
      ...session,
      // Shown exactly once. There is no second chance and no reset by email, so the
      // client has to make the user acknowledge it rather than tuck it in a corner.
      recoveryCode: code,
      recoveryWarning: "Save this now. It cannot be shown again and there is no email reset.",
    });
  }

  // ---------------------------------------------------------------- login
  if (path === "/auth/login" && request.method === "POST") {
    if (!(await callerAllows("login", 20))) return fail("rateLimited");

    const body = await readJson(request);
    if (!body) return fail("badRequest", "expected a JSON object");
    const username = str(body, "username", 64);
    const derivedKey = str(body, "derivedKey", 256);
    if (!username || !derivedKey) return fail("badRequest", "username and derivedKey required");

    const norm = normaliseUsername(username);
    // Per-ACCOUNT limiting, which the IP layer cannot do: an attacker spread across many
    // addresses is still hammering one username.
    if (!(await accountAllows(env, norm))) {
      return fail("rateLimited", "too many attempts for this account");
    }

    const row = await env.DB.prepare(
      "SELECT id, pw_hash, kind, disabled_at FROM users WHERE username_norm = ?",
    )
      .bind(norm)
      .first<{ id: string; pw_hash: string | null; kind: string; disabled_at: number | null }>();

    // One message for "no such account" and for "wrong password". Distinguishing them
    // turns the login form into the enumeration oracle the salt endpoint was carefully
    // built not to be.
    const expected = row?.pw_hash ?? null;
    const candidate = await storedPasswordHash(env, derivedKey);
    if (!row || expected === null || !timingSafeEqual(expected, candidate)) {
      return fail("unauthorized", "wrong username or password");
    }
    if (row.disabled_at !== null) return fail("forbidden", "this account is disabled");

    const session = await issueSession(env, row.id, row.kind === "guest" ? "guest" : "full", nowMs, "login");
    return ok({ userId: row.id, kind: row.kind, ...session });
  }

  // ---------------------------------------------------------------- guest
  if (path === "/auth/guest" && request.method === "POST") {
    if (!(await callerAllows("guest", 5))) return fail("rateLimited");

    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, kind, created_at) VALUES (?, 'guest', ?)")
      .bind(userId, nowMs)
      .run();
    const session = await issueSession(env, userId, "guest", nowMs, "guest");
    return ok({
      userId,
      kind: "guest",
      ...session,
      // Said plainly rather than buried: a guest lives on this device's refresh token
      // and nothing else. Losing it loses the account, which is why a season-long league
      // will require a claimed one — a guest who vanishes orphans a fixture forever.
      warning: "A guest account exists only on this device. Claim a username to keep it.",
    });
  }

  // ---------------------------------------------------------------- claim
  if (path === "/auth/claim" && request.method === "POST") {
    const caller = await authenticate(env, request, nowMs);
    if (!caller) return fail("unauthorized");
    if (caller.kind !== "guest") return fail("conflict", "this account already has a username");

    const body = await readJson(request);
    if (!body) return fail("badRequest", "expected a JSON object");
    const username = str(body, "username", 64);
    const derivedKey = str(body, "derivedKey", 256);
    if (!username || !derivedKey) return fail("badRequest", "username and derivedKey required");
    const problem = validateUsername(username);
    if (problem) return fail("badRequest", `username: ${problem.detail}`);

    const code = recoveryCode();
    let changed = 0;
    try {
      // One statement, guarded on `kind = 'guest'`, and the row count is the answer:
      // this is idempotent under a retry and cannot upgrade an account twice. A
      // read-then-write would let two concurrent claims both believe they won.
      const result = await env.DB.prepare(
        `UPDATE users
            SET username_norm = ?, username = ?, pw_hash = ?, recovery_hash = ?, kind = 'full'
          WHERE id = ? AND kind = 'guest'`,
      )
        .bind(
          normaliseUsername(username),
          username.trim(),
          await storedPasswordHash(env, derivedKey),
          await storedRecoveryHash(env, normaliseRecoveryCode(code)),
          caller.userId,
        )
        .run();
      changed = result.meta.changes ?? 0;
    } catch {
      // A username collision must NOT consume the guest token: the user is still a guest
      // and can try another name.
      return fail("conflict", "that username is taken");
    }
    if (changed !== 1) return fail("conflict", "this account is no longer a guest");

    const session = await issueSession(env, caller.userId, "full", nowMs, "claim");
    return ok({
      userId: caller.userId,
      kind: "full",
      ...session,
      recoveryCode: code,
      recoveryWarning: "Save this now. It cannot be shown again and there is no email reset.",
    });
  }

  // -------------------------------------------------------------- refresh
  if (path === "/auth/refresh" && request.method === "POST") {
    const body = await readJson(request);
    const token = body ? str(body, "refreshToken", 256) : null;
    if (!token) return fail("badRequest", "refreshToken required");

    const hash = await storedTokenHash(token);
    const row = await env.DB.prepare(
      "SELECT user_id, expires_at FROM sessions WHERE token_hash = ?",
    )
      .bind(hash)
      .first<{ user_id: string; expires_at: number }>();
    if (!row || row.expires_at <= nowMs) return fail("unauthorized", "expired or unknown token");

    const user = await env.DB.prepare("SELECT kind, disabled_at FROM users WHERE id = ?")
      .bind(row.user_id)
      .first<{ kind: string; disabled_at: number | null }>();
    if (!user || user.disabled_at !== null) return fail("forbidden");

    // Rotate on use: a refresh token is single-use, so a stolen one is worth one refresh
    // and then stops working — and the legitimate holder finding themselves logged out is
    // the signal that it was stolen.
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(hash).run();
    const session = await issueSession(
      env,
      row.user_id,
      user.kind === "guest" ? "guest" : "full",
      nowMs,
      "refresh",
    );
    return ok({ userId: row.user_id, kind: user.kind, ...session });
  }

  // --------------------------------------------------------------- rotate
  if (path === "/auth/rotate" && request.method === "POST") {
    const caller = await authenticate(env, request, nowMs);
    if (!caller) return fail("unauthorized");
    // Every device, including this one. The blunt instrument, for when something has
    // gone wrong and the user wants everything holding a token to stop working.
    const result = await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?")
      .bind(caller.userId)
      .run();
    return ok({ revoked: result.meta.changes ?? 0 });
  }

  // ------------------------------------------------------------------- me
  if (path === "/me" && request.method === "GET") {
    const caller = await authenticate(env, request, nowMs);
    if (!caller) return fail("unauthorized");
    const row = await env.DB.prepare("SELECT username, kind, created_at FROM users WHERE id = ?")
      .bind(caller.userId)
      .first<{ username: string | null; kind: string; created_at: number }>();
    if (!row) return fail("notFound");
    return ok({ userId: caller.userId, username: row.username, kind: row.kind, createdAt: row.created_at });
  }

  return null;
}
