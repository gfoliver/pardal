import { canonicalJson, deriveSeed, ENGINE_VERSION, engineFor, lineupHash, MatchProtocol, type MatchRecord, type TeamInput } from "@fut/protocol";
import { authenticate } from "../auth/routes.js";
import { randomToken } from "../crypto.js";
import type { Env } from "../env.js";
import { fail, ok, readJson, str } from "../http.js";
import { identifiedIp, ipAllows, isolateAllows } from "../ratelimit.js";
import { lineupProblem } from "./lineup.js";

/**
 * A friendly 1v1: one player opens a challenge, another joins it by code, both seal a lineup, and the
 * fixture locks.
 *
 * THE SERVER NEVER SIMULATES. It draws the seed and publishes the inputs; the clients do the arithmetic
 * and report back. So everything here is bookkeeping with two rules that carry the whole model:
 *
 *  - A LINEUP IS ONE-SHOT. Sealed on submission and never editable, because the seed is derived from the
 *    lineups: if a lineup could change afterwards, tying the seed to it would open a mining channel
 *    rather than close one (see `deriveSeed`).
 *  - NOTHING IS REVEALED BEFORE THE LOCK. Both submissions are held and published together with the
 *    seed, atomically. Before that a caller learns only whether the other side has submitted — knowing
 *    the opponent's eleven while yours is still open is the whole thing an envelope prevents.
 */

/**
 * Six characters a person can read off a screen and type into a phone.
 *
 * The alphabet excludes O/0, I/1/L and U (which is `V` in some hands) — a code that is retyped wrongly
 * is a support conversation, and 32^6 is still 10^9 possibilities. Uppercase because that is how a code
 * gets written down.
 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
function challengeCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = "";
  // Rejection-free: 30 does not divide 256, so the low letters are very slightly likelier. That bias is
  // irrelevant for an invitation code nobody is trying to predict, and saying so is cheaper than a
  // rejection loop that would need its own test.
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

/** A match row, in the columns these routes read. */
interface MatchRow {
  id: string;
  engine: string;
  engine_version: string;
  protocol_version: number;
  seed: number | null;
  roster_snapshot_hash: string | null;
  home_club_id: string;
  away_club_id: string | null;
  home_user_id: string | null;
  away_user_id: string | null;
  home_input: string | null;
  away_input: string | null;
  home_lineup_hash: string | null;
  away_lineup_hash: string | null;
  join_code: string | null;
  state: string;
}

const COLUMNS = `id, engine, engine_version, protocol_version, seed, roster_snapshot_hash,
  home_club_id, away_club_id, home_user_id, away_user_id, home_input, away_input,
  home_lineup_hash, away_lineup_hash, join_code, state`;

const load = (env: Env, id: string): Promise<MatchRow | null> =>
  env.DB.prepare(`SELECT ${COLUMNS} FROM matches WHERE id = ?`).bind(id).first<MatchRow>();

/** Which side this caller is, or null if the fixture is not theirs. */
function sideOf(row: MatchRow, userId: string): "home" | "away" | null {
  if (row.home_user_id === userId) return "home";
  if (row.away_user_id === userId) return "away";
  return null;
}

/**
 * What a caller may see, which depends on whether the fixture has locked.
 *
 * Before the lock: who is in it, which clubs, and who has submitted — never a lineup, not even your
 * opponent's hash, since a hash of a lineup is a thing you can test guesses against.
 */
function publicView(row: MatchRow): Record<string, unknown> {
  const open = row.state === "awaiting_lineups";
  return {
    matchId: row.id,
    state: row.state,
    engine: row.engine,
    engineVersion: row.engine_version,
    protocolVersion: row.protocol_version,
    rosterSnapshotHash: row.roster_snapshot_hash,
    homeClubId: row.home_club_id,
    awayClubId: row.away_club_id,
    joinCode: open ? row.join_code : null,
    homeSubmitted: row.home_input !== null,
    awaySubmitted: row.away_input !== null,
    ...(open
      ? {}
      : {
          seed: row.seed,
          regulationMinutes: MatchProtocol.regulationMinutes,
          homeLineupHash: row.home_lineup_hash,
          awayLineupHash: row.away_lineup_hash,
          home: JSON.parse(row.home_input ?? "null") as unknown,
          away: JSON.parse(row.away_input ?? "null") as unknown,
        }),
  };
}

/**
 * The record, in the exact shape `MatchRecord` names, for a locked fixture.
 *
 * Built rather than stored: the row IS the record, and keeping a second serialised copy would be two
 * things to keep in step. The type annotation is the point — if the protocol grows a field, this fails
 * to compile instead of quietly publishing a record missing it.
 */
function recordOf(row: MatchRow): MatchRecord {
  return {
    protocolVersion: row.protocol_version,
    engineVersion: row.engine_version,
    matchId: row.id,
    engine: row.engine as MatchRecord["engine"],
    seed: row.seed!,
    regulationMinutes: MatchProtocol.regulationMinutes,
    rosterSnapshotHash: row.roster_snapshot_hash!,
    home: JSON.parse(row.home_input!) as TeamInput,
    away: JSON.parse(row.away_input!) as TeamInput,
  };
}

export async function handleMatch(request: Request, env: Env, nowMs: number, path: string): Promise<Response | null> {
  if (!path.startsWith("/match")) return null;

  const ip = identifiedIp(request);
  const callerAllows = async (bucket: string, limit: number): Promise<boolean> => {
    if (ip === null) return true;
    if (!isolateAllows(`${bucket}:${ip}`, limit, 60_000, nowMs)) return false;
    return ipAllows(env, ip);
  };

  const caller = await authenticate(env, request, nowMs);
  if (!caller) return fail("unauthorized");

  // ------------------------------------------------------------- challenge
  if (path === "/match/challenge" && request.method === "POST") {
    if (!(await callerAllows("challenge", 20))) return fail("rateLimited");
    const body = await readJson(request);
    if (!body) return fail("badRequest", "expected a JSON object");
    const clubId = str(body, "clubId", 64);
    const rosterSnapshotHash = str(body, "rosterSnapshotHash", 128);
    if (!clubId || !rosterSnapshotHash) return fail("badRequest", "clubId and rosterSnapshotHash required");

    /*
     * An existing open challenge is RETURNED, not refused.
     *
     * It makes the route idempotent without an Idempotency-Key: a retry after a dropped response gets
     * the same code rather than a second challenge, and a player who forgot he had one open gets it back
     * instead of an error he cannot act on. One open challenge each is also what stops a bored caller
     * filling the table.
     */
    const open = await env.DB.prepare(
      `SELECT ${COLUMNS} FROM matches
        WHERE home_user_id = ? AND away_user_id IS NULL AND join_code IS NOT NULL AND state = 'awaiting_lineups'`,
    )
      .bind(caller.userId)
      .first<MatchRow>();
    if (open) return ok({ ...publicView(open), reused: true });

    const id = `m-${randomToken(16)}`;
    const code = challengeCode();
    // Both human, so the engine is the one they can watch. The RULE decides, never the caller: a client
    // that could name the engine could name the cheaper one and diverge from everybody else.
    const engine = engineFor({ homeIsHuman: true, awayIsHuman: true });
    await env.DB.prepare(
      `INSERT INTO matches (id, engine, engine_version, protocol_version, roster_snapshot_hash,
                            home_club_id, home_user_id, join_code, state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_lineups', ?)`,
    )
      .bind(id, engine, ENGINE_VERSION, MatchProtocol.version, rosterSnapshotHash, clubId, caller.userId, code, nowMs)
      .run();
    const row = await load(env, id);
    return ok(publicView(row!));
  }

  // ------------------------------------------------------------------ join
  if (path === "/match/join" && request.method === "POST") {
    if (!(await callerAllows("join", 30))) return fail("rateLimited");
    const body = await readJson(request);
    if (!body) return fail("badRequest", "expected a JSON object");
    const code = str(body, "code", 16)?.trim().toUpperCase();
    const clubId = str(body, "clubId", 64);
    const rosterSnapshotHash = str(body, "rosterSnapshotHash", 128);
    if (!code || !clubId || !rosterSnapshotHash) return fail("badRequest", "code, clubId and rosterSnapshotHash required");

    const found = await env.DB.prepare(`SELECT ${COLUMNS} FROM matches WHERE join_code = ?`).bind(code).first<MatchRow>();
    if (!found) return fail("notFound", "no challenge with that code");
    if (found.home_user_id === caller.userId) return fail("forbidden", "that is your own challenge");
    if (found.away_user_id !== null) return fail("conflict", "somebody has already joined that challenge");
    /*
     * The dataset has to match, and this is the reason it has a content hash at all. Two clients holding
     * different squads under the same version string would produce different matches from the same
     * record and read as a divergence with nothing in the data to explain it. Refused here, where it can
     * still be explained, rather than after a fixture has locked.
     */
    if (found.roster_snapshot_hash !== rosterSnapshotHash) {
      return fail("conflict", "you and the host are on different dataset builds");
    }

    // One conditional UPDATE, so two people racing for the same code cannot both join: the second sees
    // no rows changed. A read-then-write here would let both believe they won.
    const claimed = await env.DB.prepare(
      `UPDATE matches SET away_user_id = ?, away_club_id = ?
        WHERE join_code = ? AND away_user_id IS NULL AND home_user_id != ?`,
    )
      .bind(caller.userId, clubId, code, caller.userId)
      .run();
    if ((claimed.meta.changes ?? 0) !== 1) return fail("conflict", "somebody has already joined that challenge");
    return ok(publicView((await load(env, found.id))!));
  }

  // ---------------------------------------------------------------- lineup
  if (path === "/match/lineup" && request.method === "POST") {
    if (!(await callerAllows("lineup", 60))) return fail("rateLimited");
    const body = await readJson(request);
    if (!body) return fail("badRequest", "expected a JSON object");
    const matchId = str(body, "matchId", 128);
    if (!matchId) return fail("badRequest", "matchId required");
    const row = await load(env, matchId);
    if (!row) return fail("notFound", "no such match");

    const side = sideOf(row, caller.userId);
    if (!side) return fail("forbidden", "you are not in that match");
    if (row.away_user_id === null) return fail("conflict", "nobody has joined yet");
    if (row.state !== "awaiting_lineups") return fail("conflict", `lineups closed: the match is ${row.state}`);

    const clubId = side === "home" ? row.home_club_id : row.away_club_id!;
    const problem = lineupProblem(body.input, clubId);
    if (problem) return fail("badRequest", problem);
    const input = body.input as TeamInput;

    const sealed = await lineupHash({ matchId: row.id, teamId: clubId, engineVersion: row.engine_version, input });
    const existing = side === "home" ? row.home_lineup_hash : row.away_lineup_hash;
    if (existing !== null) {
      /*
       * A lineup is one-shot, but a RETRY is not a second lineup. An identical resubmission answers with
       * the same seal — otherwise a dropped response would cost a player his only submission, which is
       * a worse failure than the one the rule is preventing.
       */
      if (existing === sealed) return ok({ ...publicView((await load(env, row.id))!), sealed });
      return fail("conflict", "your lineup is already sealed and cannot be changed");
    }

    const column = side === "home" ? "home" : "away";
    const stored = await env.DB.prepare(
      `UPDATE matches SET ${column}_input = ?, ${column}_lineup_hash = ?
        WHERE id = ? AND ${column}_lineup_hash IS NULL AND state = 'awaiting_lineups'`,
    )
      .bind(canonicalJson(input), sealed, row.id)
      .run();
    if ((stored.meta.changes ?? 0) !== 1) return fail("conflict", "your lineup is already sealed and cannot be changed");

    const after = (await load(env, row.id))!;
    if (after.home_lineup_hash !== null && after.away_lineup_hash !== null) await lock(env, after, nowMs);
    return ok({ ...publicView((await load(env, row.id))!), sealed });
  }

  // ---------------------------------------------------------------- record
  const one = /^\/match\/([A-Za-z0-9-]{1,128})$/.exec(path);
  if (one && request.method === "GET") {
    const row = await load(env, one[1]!);
    if (!row) return fail("notFound", "no such match");
    // Participants only, for now: a spectator would need the same view a verifier gets, and that arrives
    // with verification rather than being guessed at here.
    if (!sideOf(row, caller.userId)) return fail("forbidden", "you are not in that match");

    const view = publicView(row);
    /*
     * A LOCKED fixture is immutable, so its record can be cached hard; an open one changes the moment the
     * other side submits. The plan's request arithmetic depends on this: polling two endpoints every ten
     * seconds is 72,000 requests a day against a 100,000 free daily allowance, so the client fetches on
     * `visibilitychange` with a floor and this tag turns the unchanged case into a 304.
     */
    const etag = `"${row.state}-${row.home_lineup_hash ?? ""}-${row.away_lineup_hash ?? ""}"`;
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });
    return ok(row.state === "awaiting_lineups" ? view : { ...view, record: recordOf(row) }, { headers: { etag } });
  }

  return fail("notFound", `no route for ${request.method} ${path}`);
}

/**
 * The lock: the moment a fixture stops being an invitation and becomes a determined match.
 *
 * Everything is published at once — the seed and both lineup hashes — because that atomicity IS the
 * guarantee. A player cannot check whether the opponent's submission changed after the seed was drawn if
 * the two arrived separately.
 *
 * Guarded on the state it expects, so a second caller arriving at the same instant cannot draw a second
 * seed: the row is already `determined` and its update changes nothing.
 */
async function lock(env: Env, row: MatchRow, nowMs: number): Promise<void> {
  const seed = await deriveSeed(env.SERVER_SEED, {
    matchId: row.id,
    engineVersion: row.engine_version,
    homeLineupHash: row.home_lineup_hash!,
    awayLineupHash: row.away_lineup_hash!,
  });
  await env.DB.prepare(
    `UPDATE matches SET seed = ?, state = 'determined', join_code = NULL, kickoff_at = ?
      WHERE id = ? AND state = 'awaiting_lineups'`,
  )
    .bind(seed, nowMs, row.id)
    .run();
}
