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
  home_club_id: string | null;
  away_club_id: string | null;
  home_user_id: string | null;
  away_user_id: string | null;
  home_input: string | null;
  away_input: string | null;
  home_lineup_hash: string | null;
  away_lineup_hash: string | null;
  join_code: string | null;
  started_at: number | null;
  state: string;
}

const COLUMNS = `id, engine, engine_version, protocol_version, seed, roster_snapshot_hash,
  home_club_id, away_club_id, home_user_id, away_user_id, home_input, away_input,
  home_lineup_hash, away_lineup_hash, join_code, started_at, state`;

const load = (env: Env, id: string): Promise<MatchRow | null> =>
  env.DB.prepare(`SELECT ${COLUMNS} FROM matches WHERE id = ?`).bind(id).first<MatchRow>();

/** Which side this caller is, or null if the fixture is not theirs. */
function sideOf(row: MatchRow, userId: string): "home" | "away" | null {
  if (row.home_user_id === userId) return "home";
  if (row.away_user_id === userId) return "away";
  return null;
}

/**
 * The room, as both people in it see it.
 *
 * A room is a shared thing, so this is deliberately generous about STATUS — who is in it, which club
 * each has chosen, whether each is ready — and just as deliberately silent about CONTENT until the
 * fixture locks. Seeing your opponent pick Palmeiras is the point of a room; seeing his eleven while
 * yours is still open is the thing an envelope exists to prevent, and not even his lineup's hash is
 * shown, because a hash is something you can test guesses against.
 *
 * READY IS SEALED. There is no separate flag: a side is ready exactly when its lineup is sealed, which
 * is the only meaning that keeps its promise — the seed is derived from the two lineups, so "ready"
 * has to be the moment yours stops being editable.
 */
function roomView(row: MatchRow, viewerId: string): Record<string, unknown> {
  const open = row.state === "awaiting_lineups";
  const you = sideOf(row, viewerId);
  return {
    matchId: row.id,
    state: row.state,
    engine: row.engine,
    engineVersion: row.engine_version,
    protocolVersion: row.protocol_version,
    rosterSnapshotHash: row.roster_snapshot_hash,
    /** Which side the CALLER is. A room is symmetric; only this tells a client which panel is his. */
    you,
    /** The room's owner is whoever opened it, and only he starts the match. */
    owner: "home" as const,
    homeClubId: row.home_club_id,
    awayClubId: row.away_club_id,
    homeJoined: row.home_user_id !== null,
    awayJoined: row.away_user_id !== null,
    homeReady: row.home_lineup_hash !== null,
    awayReady: row.away_lineup_hash !== null,
    joinCode: open ? row.join_code : null,
    startedAt: row.started_at,
    ...(open
      ? {}
      : {
          seed: row.seed,
          regulationMinutes: MatchProtocol.regulationMinutes,
          homeLineupHash: row.home_lineup_hash,
          awayLineupHash: row.away_lineup_hash,
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

  // ------------------------------------------------------------------ room
  if (path === "/match/room" && request.method === "POST") {
    if (!(await callerAllows("room", 20))) return fail("rateLimited");
    const body = await readJson(request);
    if (!body) return fail("badRequest", "expected a JSON object");
    const rosterSnapshotHash = str(body, "rosterSnapshotHash", 128);
    if (!rosterSnapshotHash) return fail("badRequest", "rosterSnapshotHash required");

    /*
     * A room OPENS EMPTY: no club, because choosing one is something the two people do inside it, in
     * front of each other. That is the difference between a room and an invitation with a team baked in.
     *
     * An existing open room is returned rather than refused, which makes this idempotent without an
     * Idempotency-Key and stops one caller filling the table with invitations.
     */
    const open = await env.DB.prepare(
      `SELECT ${COLUMNS} FROM matches
        WHERE home_user_id = ? AND away_user_id IS NULL AND join_code IS NOT NULL AND state = 'awaiting_lineups'`,
    )
      .bind(caller.userId)
      .first<MatchRow>();
    if (open) return ok({ ...roomView(open, caller.userId), reused: true });

    const id = `m-${randomToken(16)}`;
    // Both human, so the engine is the one they can watch. The RULE decides, never the caller.
    const engine = engineFor({ homeIsHuman: true, awayIsHuman: true });
    await env.DB.prepare(
      `INSERT INTO matches (id, engine, engine_version, protocol_version, roster_snapshot_hash,
                            home_user_id, join_code, state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'awaiting_lineups', ?)`,
    )
      .bind(id, engine, ENGINE_VERSION, MatchProtocol.version, rosterSnapshotHash, caller.userId, challengeCode(), nowMs)
      .run();
    return ok(roomView((await load(env, id))!, caller.userId));
  }

  // ------------------------------------------------------------------ join
  if (path === "/match/join" && request.method === "POST") {
    if (!(await callerAllows("join", 30))) return fail("rateLimited");
    const body = await readJson(request);
    if (!body) return fail("badRequest", "expected a JSON object");
    const code = str(body, "code", 16)?.trim().toUpperCase();
    const rosterSnapshotHash = str(body, "rosterSnapshotHash", 128);
    if (!code || !rosterSnapshotHash) return fail("badRequest", "code and rosterSnapshotHash required");

    const found = await env.DB.prepare(`SELECT ${COLUMNS} FROM matches WHERE join_code = ?`).bind(code).first<MatchRow>();
    if (!found) return fail("notFound", "no room with that code");
    // Rejoining a room you are already in is not an error: a reload should put you back, not lock you out.
    if (found.home_user_id === caller.userId || found.away_user_id === caller.userId) {
      return ok(roomView(found, caller.userId));
    }
    if (found.away_user_id !== null) return fail("conflict", "that room is full");
    /*
     * The dataset has to match, and this is the reason it has a content hash at all: two clients holding
     * different squads would produce different matches from the same record, and it would read as a
     * divergence with nothing in the data to explain it. Refused here, where it can still be explained.
     */
    if (found.roster_snapshot_hash !== rosterSnapshotHash) {
      return fail("conflict", "you and the host are on different dataset builds");
    }

    // One conditional UPDATE, so two people racing for the same code cannot both get in.
    const claimed = await env.DB.prepare(
      `UPDATE matches SET away_user_id = ? WHERE join_code = ? AND away_user_id IS NULL AND home_user_id != ?`,
    )
      .bind(caller.userId, code, caller.userId)
      .run();
    if ((claimed.meta.changes ?? 0) !== 1) return fail("conflict", "that room is full");
    return ok(roomView((await load(env, found.id))!, caller.userId));
  }

  // ------------------------------------------------------------------ club
  if (path === "/match/club" && request.method === "POST") {
    if (!(await callerAllows("club", 60))) return fail("rateLimited");
    const body = await readJson(request);
    if (!body) return fail("badRequest", "expected a JSON object");
    const matchId = str(body, "matchId", 128);
    const clubId = str(body, "clubId", 64);
    if (!matchId || !clubId) return fail("badRequest", "matchId and clubId required");
    const row = await load(env, matchId);
    if (!row) return fail("notFound", "no such room");
    const side = sideOf(row, caller.userId);
    if (!side) return fail("forbidden", "you are not in that room");
    // Changeable right up until you are ready, and not after: a sealed line-up names players, so the club
    // it was picked from is part of what was sealed.
    if ((side === "home" ? row.home_lineup_hash : row.away_lineup_hash) !== null) {
      return fail("conflict", "you are ready — your club is part of a sealed line-up");
    }
    if (row.state !== "awaiting_lineups") return fail("conflict", `the room is ${row.state}`);
    /*
     * BOTH MAY PICK THE SAME CLUB. Two people wanting Flamengo is a friendly between two Flamengos, which
     * the engine plays perfectly well — the away side's kit already changes when they clash. Refusing it
     * would be a rule invented here for tidiness.
     */
    await env.DB.prepare(`UPDATE matches SET ${side}_club_id = ? WHERE id = ?`).bind(clubId, row.id).run();
    return ok(roomView((await load(env, row.id))!, caller.userId));
  }

  // ---------------------------------------------------------------- lineup
  if (path === "/match/lineup" && request.method === "POST") {
    if (!(await callerAllows("lineup", 60))) return fail("rateLimited");
    const body = await readJson(request);
    if (!body) return fail("badRequest", "expected a JSON object");
    const matchId = str(body, "matchId", 128);
    if (!matchId) return fail("badRequest", "matchId required");
    const row = await load(env, matchId);
    if (!row) return fail("notFound", "no such room");

    const side = sideOf(row, caller.userId);
    if (!side) return fail("forbidden", "you are not in that room");
    if (row.away_user_id === null) return fail("conflict", "nobody has joined yet");
    if (row.state !== "awaiting_lineups") return fail("conflict", `the room is ${row.state}`);
    const clubId = side === "home" ? row.home_club_id : row.away_club_id;
    if (!clubId) return fail("conflict", "pick a club first");

    const problem = lineupProblem(body.input, clubId);
    if (problem) return fail("badRequest", problem);
    const input = body.input as TeamInput;

    const sealed = await lineupHash({ matchId: row.id, teamId: clubId, engineVersion: row.engine_version, input });
    const existing = side === "home" ? row.home_lineup_hash : row.away_lineup_hash;
    if (existing !== null) {
      /*
       * Being ready is one-shot, but a RETRY is not a second submission. An identical resend answers with
       * the same seal — a dropped response costing a player his only line-up is a worse failure than the
       * rule it enforces.
       */
      if (existing === sealed) return ok({ ...roomView((await load(env, row.id))!, caller.userId), sealed });
      return fail("conflict", "your line-up is already sealed and cannot be changed");
    }

    const stored = await env.DB.prepare(
      `UPDATE matches SET ${side}_input = ?, ${side}_lineup_hash = ?
        WHERE id = ? AND ${side}_lineup_hash IS NULL AND state = 'awaiting_lineups'`,
    )
      .bind(canonicalJson(input), sealed, row.id)
      .run();
    if ((stored.meta.changes ?? 0) !== 1) return fail("conflict", "your line-up is already sealed");

    const after = (await load(env, row.id))!;
    if (after.home_lineup_hash !== null && after.away_lineup_hash !== null) await lock(env, after, nowMs);
    return ok({ ...roomView((await load(env, row.id))!, caller.userId), sealed });
  }

  // ----------------------------------------------------------------- start
  if (path === "/match/start" && request.method === "POST") {
    const body = await readJson(request);
    const matchId = body ? str(body, "matchId", 128) : null;
    if (!matchId) return fail("badRequest", "matchId required");
    const row = await load(env, matchId);
    if (!row) return fail("notFound", "no such room");
    // The owner alone, because somebody has to decide. This does not affect the RESULT — the fixture is
    // already determined by then; it only says when the two of them watch it.
    if (row.home_user_id !== caller.userId) return fail("forbidden", "only the room's owner starts the match");
    if (row.state === "awaiting_lineups") return fail("conflict", "both sides must be ready first");
    /*
     * Guarded on being unset, so a second press does not move the moment: both clients poll for this, and
     * a start that jumped forward would restart a match somebody is already watching.
     */
    await env.DB.prepare("UPDATE matches SET started_at = ? WHERE id = ? AND started_at IS NULL")
      .bind(nowMs, row.id)
      .run();
    return ok(roomView((await load(env, row.id))!, caller.userId));
  }

  // ---------------------------------------------------------------- record
  const one = /^\/match\/([A-Za-z0-9-]{1,128})$/.exec(path);
  if (one && request.method === "GET") {
    const row = await load(env, one[1]!);
    if (!row) return fail("notFound", "no such room");
    // Participants only, for now: a spectator wants what a verifier gets, and that arrives with
    // verification rather than being guessed at here.
    if (!sideOf(row, caller.userId)) return fail("forbidden", "you are not in that room");

    const view = roomView(row, caller.userId);
    /*
     * The tag moves with everything a client WAITS for — the other side joining, his club, his readiness,
     * the lock, the start. An ETag over the state alone would leave the room looking frozen while the
     * opponent picked his team, which is exactly the moment somebody is staring at the screen.
     *
     * It matters for the quota rather than for taste: polling two endpoints every ten seconds is 72,000
     * requests a day against a 100,000 free allowance, so an unchanged room must cost a 304 with no body.
     */
    const etag = `"${row.state}-${row.home_club_id ?? ""}-${row.away_club_id ?? ""}-${row.away_user_id ?? ""}-${row.home_lineup_hash ?? ""}-${row.away_lineup_hash ?? ""}-${row.started_at ?? ""}"`;
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
