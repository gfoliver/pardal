import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Formation, MarkingScheme, Mentality, Position } from "@fut/domain";
import type { MatchRecord, TeamInput } from "@fut/protocol";
import { jsonPost, startServer, type TestServer } from "./harness.js";

/**
 * A friendly 1v1, end to end against the real runtime.
 *
 * The interesting half is not the happy path — it is everything a caller can try instead: joining your
 * own code, submitting twice, submitting after the lock, reading a record you are not in, and reading one
 * BEFORE the lock, which must reveal neither lineup. Those are the rules the model rests on, and none of
 * them is enforced by a type.
 */

const ROSTER = "f".repeat(64);

let server: TestServer;
let host: string;
let guest: string;
let outsider: string;

beforeAll(async () => {
  server = await startServer();
  host = await signUp("host");
  guest = await signUp("guest");
  outsider = await signUp("outsider");
}, 60_000);
afterAll(async () => {
  await server.dispose();
});

async function signUp(name: string): Promise<string> {
  const { body } = await server.json<{ accessToken: string }>(
    "/auth/register",
    jsonPost({ username: name, derivedKey: name.padEnd(64, "0").slice(0, 64) }),
  );
  return body.accessToken;
}

/** A structurally valid submission. The server holds no squads, so the ids are its own business. */
function lineup(clubId: string, over: Partial<TeamInput> = {}): TeamInput {
  const xi = Array.from({ length: 11 }, (_, i) => `${clubId}-p${i + 1}`);
  const at: Position[] = [
    Position.Goalkeeper,
    Position.CentreBack,
    Position.CentreBack,
    Position.FullBack,
    Position.FullBack,
    Position.CentralMidfielder,
    Position.CentralMidfielder,
    Position.DefensiveMidfielder,
    Position.Winger,
    Position.Winger,
    Position.Striker,
  ];
  return {
    clubId,
    startingXi: xi,
    bench: Array.from({ length: 5 }, (_, i) => `${clubId}-b${i + 1}`),
    instructions: {
      formation: Formation.F442,
      mentality: Mentality.Balanced,
      tempo: 0.5,
      pressing: 0.5,
      lineHeight: 0.5,
      width: 0.5,
      directness: 0.5,
      markingScheme: MarkingScheme.Zonal,
    },
    roles: Object.fromEntries(xi.map((id) => [id, "role"])),
    fieldedPositions: Object.fromEntries(xi.map((id, i) => [id, at[i]!])),
    coachId: `${clubId}-coach`,
    ...over,
  };
}

interface View {
  matchId: string;
  state: string;
  you: "home" | "away";
  owner: "home" | "away";
  joinCode: string | null;
  homeClubId: string | null;
  awayClubId: string | null;
  homeJoined: boolean;
  awayJoined: boolean;
  homeReady: boolean;
  awayReady: boolean;
  startedAt: number | null;
  seed?: number;
  homeLineupHash?: string;
  awayLineupHash?: string;
  home?: unknown;
  away?: unknown;
  record?: MatchRecord;
  reused?: boolean;
  sealed?: string;
}

const openRoom = (token: string, roster = ROSTER) =>
  server.json<View>("/match/room", jsonPost({ rosterSnapshotHash: roster }, token));
const join = (token: string, code: string, roster = ROSTER) =>
  server.json<View & { detail?: string }>("/match/join", jsonPost({ code, rosterSnapshotHash: roster }, token));
const pickClub = (token: string, matchId: string, clubId: string) =>
  server.json<View & { detail?: string }>("/match/club", jsonPost({ matchId, clubId }, token));
const submit = (token: string, matchId: string, input: TeamInput) =>
  server.json<View & { error?: string; detail?: string }>("/match/lineup", jsonPost({ matchId, input }, token));
const start = (token: string, matchId: string) =>
  server.json<View & { detail?: string }>("/match/start", jsonPost({ matchId }, token));

/** A room with both people in it and both clubs chosen — the state most rules are about. */
async function opened(clubs: [string, string] = ["flamengo", "palmeiras"]): Promise<string> {
  const made = await openRoom(host);
  const id = made.body.matchId;
  await join(guest, made.body.joinCode!);
  await pickClub(host, id, clubs[0]);
  await pickClub(guest, id, clubs[1]);
  return id;
}

describe("opening a room", () => {
  it("hands back a code a person could read out", async () => {
    const { status, body } = await openRoom(host);
    expect(status).toBe(200);
    expect(body.state).toBe("awaiting_lineups");
    expect(body.joinCode).toMatch(/^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{6}$/);
  });

  it("returns the challenge already open rather than making a second", async () => {
    // Idempotent without an Idempotency-Key: a retry after a dropped response must not leave two
    // invitations to the same person floating around.
    const first = await openRoom(host);
    const again = await openRoom(host);
    expect(again.body.matchId).toBe(first.body.matchId);
    expect(again.body.reused).toBe(true);
  });

  it("refuses a caller with no session", async () => {
    const { status } = await server.json("/match/room", jsonPost({ rosterSnapshotHash: ROSTER }));
    expect(status).toBe(401);
  });
});

describe("joining one", () => {
  it("puts you back in your OWN room rather than refusing you", async () => {
    // A reload, a second tab, a link you sent yourself: none of those should lock the host out of the
    // room he opened. He does not become the away side — `you` still says home.
    const made = await openRoom(host);
    const again = await join(host, made.body.joinCode!);
    expect(again.status).toBe(200);
    expect(again.body.you).toBe("home");
    expect(again.body.awayJoined).toBe(false);
  });

  it("refuses a code nobody opened", async () => {
    expect((await join(guest, "ZZZZZZ")).status).toBe(404);
  });

  it("lets only ONE person in, however many try", async () => {
    const made = await openRoom(host);
    const code = made.body.joinCode!;
    // Both racing for the same code. The conditional UPDATE decides; a read-then-write would let both
    // believe they had joined.
    const [a, b] = await Promise.all([join(guest, code), join(outsider, code)]);
    const codes = [a.status, b.status].sort();
    expect(codes).toEqual([200, 409]);
  });

  /** The reason the dataset has a content hash at all: divergence explained here, not after the lock. */
  it("refuses a guest on a different dataset build", async () => {
    const made = await openRoom(host);
    const other = await join(guest, made.body.joinCode!, "a".repeat(64));
    expect(other.status).toBe(409);
    expect(other.body.detail).toMatch(/dataset/i);
  });
});

describe("sealing a lineup", () => {
  it("keeps both submissions secret until the fixture locks", async () => {
    const matchId = await opened();
    const first = await submit(host, matchId, lineup("flamengo"));
    expect(first.status).toBe(200);
    expect(first.body.state).toBe("awaiting_lineups");
    // The opponent can see THAT it happened and nothing else — not the eleven, not even its hash, which
    // would be a thing to test guesses against.
    const seen = await server.json<View>(`/match/${matchId}`, { headers: { authorization: `Bearer ${guest}` } });
    // Ready is visible — that is the point of a room. The line-up behind it is not.
    expect(seen.body.homeReady).toBe(true);
    expect(seen.body.home).toBeUndefined();
    expect(seen.body.homeLineupHash).toBeUndefined();
    expect(seen.body.seed).toBeUndefined();
    expect(seen.body.record).toBeUndefined();
  });

  it("locks the fixture when the second lineup lands, publishing the seed and both hashes at once", async () => {
    const matchId = await opened();
    await submit(host, matchId, lineup("flamengo"));
    const second = await submit(guest, matchId, lineup("palmeiras"));
    expect(second.body.state).toBe("determined");
    expect(second.body.seed).toBeGreaterThanOrEqual(0);
    expect(second.body.homeLineupHash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.body.awayLineupHash).toMatch(/^[0-9a-f]{64}$/);
    // And the code is spent, so a stale invitation cannot be joined into a fixture already under way.
    expect(second.body.joinCode).toBeNull();
  });

  it("gives a locked fixture a record that is everything needed to replay it", async () => {
    const matchId = await opened(["gremio", "internacional"]);
    await submit(host, matchId, lineup("gremio"));
    await submit(guest, matchId, lineup("internacional"));

    const read = await server.json<View>(`/match/${matchId}`, { headers: { authorization: `Bearer ${host}` } });
    const record = read.body.record!;
    expect(record.engine).toBe("spatial"); // two humans; the RULE decides, not the caller
    expect(record.regulationMinutes).toBe(90);
    expect(record.rosterSnapshotHash).toBe(ROSTER);
    expect(record.home.clubId).toBe("gremio");
    expect(record.away.clubId).toBe("internacional");
    expect(record.seed).toBe(read.body.seed);
    expect(record.protocolVersion).toBe(1);
    expect(record.engineVersion).toMatch(/^[0-9a-f]{16}$/);
  });

  it("treats an identical resubmission as the same submission, not a second one", async () => {
    // A dropped response must not cost a player his only lineup — that failure is worse than the rule.
    const matchId = await opened();
    const first = await submit(host, matchId, lineup("flamengo"));
    const retry = await submit(host, matchId, lineup("flamengo"));
    expect(retry.status).toBe(200);
    expect(retry.body.sealed).toBe(first.body.sealed);
  });

  it("refuses a DIFFERENT second lineup, because the seed is derived from the first", async () => {
    const matchId = await opened();
    await submit(host, matchId, lineup("flamengo"));
    const changed = await submit(host, matchId, lineup("flamengo", { instructions: { ...lineup("flamengo").instructions, tempo: 0.9 } }));
    expect(changed.status).toBe(409);
  });

  it("refuses a lineup after the lock", async () => {
    const matchId = await opened();
    await submit(host, matchId, lineup("flamengo"));
    await submit(guest, matchId, lineup("palmeiras"));
    const late = await submit(host, matchId, lineup("flamengo", { coachId: "someone-else" }));
    expect(late.status).toBe(409);
  });

  it("refuses a lineup for a fixture you are not in", async () => {
    const matchId = await opened();
    expect((await submit(outsider, matchId, lineup("flamengo"))).status).toBe(403);
  });

  it("refuses a lineup before anybody has joined", async () => {
    const made = await openRoom(host);
    const early = await submit(host, made.body.matchId, lineup("vasco"));
    expect(early.status).toBe(409);
  });

  it("refuses a lineup for the other side's club", async () => {
    const matchId = await opened();
    const wrong = await submit(host, matchId, lineup("palmeiras"));
    expect(wrong.status).toBe(400);
  });
});

describe("what the shape check refuses", () => {
  /**
   * Each of these would strand a fixture: the lineup is one-shot, so a malformed submission accepted here
   * would burn the player's only chance and leave the opponent in a match nobody can play.
   */
  const cases: [string, TeamInput][] = [
    ["ten starters", lineup("flamengo", { startingXi: Array.from({ length: 10 }, (_, i) => `flamengo-p${i + 1}`) })],
    ["a repeated starter", lineup("flamengo", { startingXi: [...Array.from({ length: 10 }, (_, i) => `flamengo-p${i + 1}`), "flamengo-p1"] })],
    ["a starter on the bench too", lineup("flamengo", { bench: ["flamengo-p1"] })],
    ["no coach", lineup("flamengo", { coachId: "" })],
    ["a dial out of range", lineup("flamengo", { instructions: { ...lineup("flamengo").instructions, pressing: 4 } })],
    ["a formation that is not one", lineup("flamengo", { instructions: { ...lineup("flamengo").instructions, formation: "F999" as Formation } })],
    ["a fielded position that is not one", lineup("flamengo", { fieldedPositions: { "flamengo-p1": "sweeper" as Position } })],
  ];
  for (const [label, bad] of cases) {
    it(`refuses ${label}`, async () => {
      const matchId = await opened();
      const { status } = await submit(host, matchId, bad);
      expect(status).toBe(400);
    });
  }

  it("refuses a client that tries to set its own tactic familiarity", async () => {
    // A side that could set this would set it to 1. It belongs to the squad's drilling, not the submission.
    const matchId = await opened();
    const cheeky = { ...lineup("flamengo"), instructions: { ...lineup("flamengo").instructions, familiarity: 1 } };
    expect((await submit(host, matchId, cheeky as TeamInput)).status).toBe(400);
  });
});

describe("reading a record", () => {
  it("refuses somebody who is not in the fixture", async () => {
    const matchId = await opened();
    const seen = await server.json(`/match/${matchId}`, { headers: { authorization: `Bearer ${outsider}` } });
    expect(seen.status).toBe(403);
  });

  it("answers 304 to a client that already has the current version", async () => {
    // The plan's request budget depends on this: polling two endpoints every ten seconds would be 72,000
    // requests a day against a 100,000 daily allowance.
    const matchId = await opened();
    const first = await server.fetch(`/match/${matchId}`, { headers: { authorization: `Bearer ${host}` } });
    const etag = first.headers.get("etag")!;
    expect(etag).toBeTruthy();
    const again = await server.fetch(`/match/${matchId}`, {
      headers: { authorization: `Bearer ${host}`, "if-none-match": etag },
    });
    expect(again.status).toBe(304);

    // And the tag MOVES when the fixture does, or a client would cache a stale invitation forever.
    await submit(host, matchId, lineup("flamengo"));
    const third = await server.fetch(`/match/${matchId}`, {
      headers: { authorization: `Bearer ${host}`, "if-none-match": etag },
    });
    expect(third.status).toBe(200);
  });

  it("says notFound for a match that does not exist", async () => {
    const seen = await server.json("/match/m-nope", { headers: { authorization: `Bearer ${host}` } });
    expect(seen.status).toBe(404);
  });
});

describe("choosing a club inside the room", () => {
  it("shows the choice to the OTHER player, which is what makes it a room", async () => {
    const made = await openRoom(host);
    const id = made.body.matchId;
    await join(guest, made.body.joinCode!);
    await pickClub(host, id, "flamengo");
    const seen = await server.json<View>(`/match/${id}`, { headers: { authorization: `Bearer ${guest}` } });
    expect(seen.body.homeClubId).toBe("flamengo");
    expect(seen.body.you).toBe("away");
    expect(seen.body.owner).toBe("home");
  });

  it("can be changed until you are ready, and not after", async () => {
    const id = await opened();
    expect((await pickClub(host, id, "santos")).status).toBe(200);
    await submit(host, id, lineup("santos"));
    const late = await pickClub(host, id, "gremio");
    expect(late.status).toBe(409);
    // Because the club is part of what was sealed — the line-up names that club's players.
    expect(late.body.detail).toMatch(/sealed/i);
  });

  it("lets both sides pick the SAME club, which is a legal friendly", async () => {
    const made = await openRoom(host);
    const id = made.body.matchId;
    await join(guest, made.body.joinCode!);
    await pickClub(host, id, "flamengo");
    expect((await pickClub(guest, id, "flamengo")).status).toBe(200);
  });

  it("refuses a line-up from somebody who has not picked a club", async () => {
    const made = await openRoom(host);
    const id = made.body.matchId;
    await join(guest, made.body.joinCode!);
    const early = await submit(host, id, lineup("flamengo"));
    expect(early.status).toBe(409);
    expect(early.body.detail).toMatch(/club/i);
  });
});

describe("starting the match", () => {
  it("is the host's alone, and only once both are ready", async () => {
    const id = await opened();
    expect((await start(host, id)).status).toBe(409); // nobody is ready yet
    await submit(host, id, lineup("flamengo"));
    await submit(guest, id, lineup("palmeiras"));
    expect((await start(guest, id)).status).toBe(403); // the guest is not the host
    const started = await start(host, id);
    expect(started.status).toBe(200);
    expect(started.body.startedAt).toBeGreaterThan(0);
  });

  it("tells the GUEST to begin, which is the whole point of the signal", async () => {
    // The guest never presses anything: his client sees `startedAt` and kicks off. Before this existed he
    // was left holding a locked fixture with no way onto the pitch.
    const id = await opened();
    await submit(host, id, lineup("flamengo"));
    await submit(guest, id, lineup("palmeiras"));
    await start(host, id);
    const seen = await server.json<View & { record?: MatchRecord }>(`/match/${id}`, {
      headers: { authorization: `Bearer ${guest}` },
    });
    expect(seen.body.startedAt).toBeGreaterThan(0);
    expect(seen.body.record?.seed).toBeGreaterThanOrEqual(0);
  });

  it("does not move the moment when pressed twice", async () => {
    // Both clients poll for this; a start that jumped forward would restart a match already being watched.
    const id = await opened();
    await submit(host, id, lineup("flamengo"));
    await submit(guest, id, lineup("palmeiras"));
    const first = await start(host, id);
    const again = await start(host, id);
    expect(again.body.startedAt).toBe(first.body.startedAt);
  });
});
