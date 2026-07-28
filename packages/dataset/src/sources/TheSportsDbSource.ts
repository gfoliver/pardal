import type { RawSnapshot } from "../raw/RawSnapshot.js";
import { birthYearOf, isoBirthDate } from "../normalize/Normalize.js";
import type { ClubEnrichment, PlayerEnrichment } from "../enrich/Enrichment.js";
import type { WorkPlan } from "../enrich/plan.js";
import { clubOverride, playerOverride } from "../resolve/overrides.js";
import {
  accepted,
  clubSearchTerms,
  isAmbiguous,
  matchClub,
  matchPlayer,
  type ClubCandidate,
  type PlayerCandidate,
} from "../resolve/matchEntities.js";
import type { Enricher, EnrichOutcome, EnrichSink } from "./Enricher.js";

/**
 * Enrich a snapshot from TheSportsDB's free v1 API — identity data our squad
 * source doesn't carry: player portraits, real club colours, stadium/city, ISO
 * birthdates, height and weight.
 *
 * What the free tier actually allows (measured against the live API, because
 * the docs imply otherwise):
 *  - every LIST endpoint is truncated to ~10 results, so a club's squad listing
 *    returns 10 players alphabetically. This API cannot build a squad; it can
 *    only enrich one we already have.
 *  - `searchplayers.php?t=…` is unsupported and answers 200 with an EMPTY BODY,
 *    so team-scoped search is out. Searching by full name works and hits the
 *    alternate-name index.
 *  - a by-name search returns a reduced record: identity + photos, but no
 *    height/weight. Those need a follow-up single-player lookup (the deep pass).
 *  - ~30 requests/minute.
 *
 * Everything here is best-effort per entity: one 404 club must not sink a
 * 20-club run, so failures become reported misses rather than exceptions.
 */
export class TheSportsDbSource implements Enricher {
  readonly id = "thesportsdb";
  readonly version = "v1-1";

  private requests = 0;
  private lastCallAt = 0;

  constructor(
    private readonly opts: {
      readonly key?: string;
      /** Minimum gap between calls; 2200ms keeps us under the 30/min free cap. */
      readonly delayMs?: number;
      /** Resolve still-unmatched players by name search (the slow, thorough pass). */
      readonly nameSearch?: boolean;
      readonly fetchImpl?: typeof fetch;
    } = {},
  ) {}

  private get base(): string {
    return `https://www.thesportsdb.com/api/v1/json/${this.opts.key ?? "123"}`;
  }

  async run(snapshot: RawSnapshot, plan: WorkPlan, sink: EnrichSink, log: (m: string) => void = () => {}): Promise<EnrichOutcome> {
    const fetchedAt = new Date().toISOString();
    const errors: string[] = [];
    const ambiguous: string[] = [];
    let clubsMatched = 0;
    let clubsMissed = 0;
    let playersMatched = 0;
    let playersMissed = 0;

    const clubById = new Map(snapshot.clubs.map((c) => [c.id, c]));
    const playerById = new Map(snapshot.players.map((p) => [p.id, p]));

    /** Our club id → TheSportsDB team id, needed as the guard for name matches. */
    const sourceClubId = new Map<string, string>();
    for (const [ourId, rec] of Object.entries(sink.current().clubs)) {
      if (rec.status === "matched" && rec.sourceId) sourceClubId.set(ourId, rec.sourceId);
    }

    // --- clubs, and the squad listing each one unlocks ----------------------
    for (const clubId of plan.clubs) {
      const club = clubById.get(clubId);
      if (!club) continue;
      try {
        const { teams, outcome } = await this.findTeam(club);
        const hit = accepted(outcome);
        if (!hit) {
          if (isAmbiguous(outcome)) ambiguous.push(`club ${club.id} (${club.name})`);
          sink.club(club.id, { status: "notFound", fetchedAt });
          clubsMissed++;
          log(`  · ${club.name}: no match`);
          continue;
        }
        const team = teams.find((t) => String(t.idTeam) === hit.candidate.sourceId)!;
        sink.club(club.id, { status: "matched", sourceId: hit.candidate.sourceId, data: toClubEnrichment(team), fetchedAt });
        sourceClubId.set(club.id, hit.candidate.sourceId);
        clubsMatched++;
        log(`  ✓ ${club.name} → ${team.strTeam} (${hit.method})`);
      } catch (e) {
        errors.push(`club ${club.id}: ${String(e)}`);
      }
    }

    // The roster listing is 20 calls for ~10 FULL records per club — by far the
    // cheapest way to get physicals, so it runs before any per-name searching.
    const rosterByClub = new Map<string, TsdbPlayer[]>();
    const wantRoster = new Set(plan.players.filter((p) => p.depth === "roster").map((p) => playerById.get(p.id)?.clubId));
    for (const ourClubId of [...wantRoster].filter((c): c is string => Boolean(c)).sort()) {
      const teamId = sourceClubId.get(ourClubId);
      if (!teamId) continue;
      try {
        rosterByClub.set(ourClubId, await this.lookupAllPlayers(teamId));
      } catch (e) {
        errors.push(`roster ${ourClubId}: ${String(e)}`);
      }
    }

    // --- players ------------------------------------------------------------
    for (const planned of plan.players) {
      const player = playerById.get(planned.id);
      if (!player) continue;
      const expected = sourceClubId.get(player.clubId);
      try {
        if (planned.depth === "deep") {
          const known = sink.current().players[player.id];
          if (!known?.sourceId) continue;
          const full = await this.lookupPlayer(known.sourceId);
          if (full) sink.player(player.id, { status: "matched", sourceId: known.sourceId, data: toPlayerEnrichment(full), depth: "deep", fetchedAt });
          continue;
        }

        const input = {
          id: player.id,
          name: player.name,
          expectedSourceClubId: expected,
          birthYear: birthYearOf(player.dob),
          birthDate: isoBirthDate(player.dob),
        };
        const override = playerOverride(this.id, player.id);

        // 1. the roster we already paid for
        const roster = rosterByClub.get(player.clubId) ?? [];
        let outcome = matchPlayer(input, roster.map(toPlayerCandidate), override);
        const fromRoster = accepted(outcome);
        let record: TsdbPlayer | undefined = fromRoster ? roster.find((r) => String(r.idPlayer) === fromRoster.candidate.sourceId) : undefined;
        let depth: "roster" | "name" = "roster";

        // 2. otherwise a by-name search, still guarded by the club
        if (!record && this.opts.nameSearch !== false && expected) {
          const found = await this.searchPlayers(player.name);
          outcome = matchPlayer(input, found.map(toPlayerCandidate), override);
          const fromName = accepted(outcome);
          if (fromName) {
            record = found.find((r) => String(r.idPlayer) === fromName.candidate.sourceId);
            depth = "name";
          }
        }

        if (isAmbiguous(outcome)) ambiguous.push(`player ${player.id} (${player.name})`);
        if (!record) {
          sink.player(player.id, { status: "notFound", depth: "name", fetchedAt });
          playersMissed++;
          continue;
        }
        sink.player(player.id, { status: "matched", sourceId: String(record.idPlayer), data: toPlayerEnrichment(record), depth, fetchedAt });
        playersMatched++;
      } catch (e) {
        errors.push(`player ${planned.id}: ${String(e)}`);
      }
    }

    return { requests: this.requests, clubsMatched, clubsMissed, playersMatched, playersMissed, ambiguous, errors };
  }

  /**
   * Find a club, widening the query until something resolves.
   *
   * The source indexes clubs under their common name, so a legal name like
   * "Clube de Regatas Vasco da Gama" can return literally nothing while "Vasco
   * da Gama" resolves first try. Each term costs a request, so the loop stops
   * at the first accepted match — and never at a merely non-empty response.
   */
  private async findTeam(club: { id: string; name: string; shortName?: string }) {
    const override = clubOverride(this.id, club.id);
    let last: { teams: TsdbTeam[]; outcome: ReturnType<typeof matchClub> } = { teams: [], outcome: undefined };
    for (const term of clubSearchTerms(club)) {
      const teams = await this.searchTeams(term);
      const outcome = matchClub(club, teams.map(toClubCandidate), override);
      if (accepted(outcome)) return { teams, outcome };
      if (isAmbiguous(outcome)) last = { teams, outcome }; // report it if nothing better turns up
    }
    return last;
  }

  // --- endpoints ------------------------------------------------------------

  private async searchTeams(name: string): Promise<TsdbTeam[]> {
    const body = await this.get<{ teams?: TsdbTeam[] }>(`/searchteams.php?t=${encodeURIComponent(name)}`);
    return (body?.teams ?? []).filter((t) => t.strSport === "Soccer" && !isSentinel(t.strTeam));
  }

  private async lookupAllPlayers(teamId: string): Promise<TsdbPlayer[]> {
    const body = await this.get<{ player?: TsdbPlayer[] }>(`/lookup_all_players.php?id=${encodeURIComponent(teamId)}`);
    return body?.player ?? [];
  }

  private async searchPlayers(name: string): Promise<TsdbPlayer[]> {
    const body = await this.get<{ player?: TsdbPlayer[] }>(`/searchplayers.php?p=${encodeURIComponent(name)}`);
    return (body?.player ?? []).filter((p) => p.strSport === "Soccer" && !isSentinel(p.strTeam));
  }

  /** Single-player lookup — note the response key is `players`, not `player`. */
  private async lookupPlayer(playerId: string): Promise<TsdbPlayer | undefined> {
    const body = await this.get<{ players?: TsdbPlayer[] }>(`/lookupplayer.php?id=${encodeURIComponent(playerId)}`);
    return body?.players?.[0];
  }

  /**
   * One paced, retrying request.
   *
   * A 200 with an EMPTY BODY is how this API reports "endpoint unavailable on
   * your key" — it is not an error and not JSON, so it maps to `undefined`
   * rather than throwing. 429/5xx back off, honouring `Retry-After`.
   */
  private async get<T>(path: string): Promise<T | undefined> {
    const doFetch = this.opts.fetchImpl ?? fetch;
    const gap = this.opts.delayMs ?? 2200;

    for (let attempt = 0; attempt < 4; attempt++) {
      const since = Date.now() - this.lastCallAt;
      if (this.lastCallAt !== 0 && since < gap) await sleep(gap - since);
      this.lastCallAt = Date.now();
      this.requests++;

      const res = await doFetch(`${this.base}${path}`);
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers?.get?.("retry-after") ?? "") || 0;
        await sleep(retryAfter > 0 ? retryAfter * 1000 : gap * (attempt + 2));
        continue;
      }
      if (!res.ok) return undefined; // 404 for an unknown entity is a miss, not a failure
      const text = await res.text();
      if (text.trim() === "") return undefined; // the "unsupported on this key" signal
      try {
        return JSON.parse(text) as T;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `_`-prefixed team names are TheSportsDB placeholders ("_Free Agent Soccer"). */
const isSentinel = (name?: string): boolean => Boolean(name?.startsWith("_"));

// --- source-shaped fragments (only the fields we read) ----------------------

interface TsdbTeam {
  idTeam?: string | number;
  strTeam?: string;
  strTeamAlternate?: string;
  strTeamShort?: string;
  strSport?: string;
  strCountry?: string;
  strLocation?: string;
  strStadium?: string;
  intStadiumCapacity?: string | number;
  intFormedYear?: string | number;
  strColour1?: string;
  strColour2?: string;
  strColour3?: string;
  strBadge?: string;
}

interface TsdbPlayer {
  idPlayer?: string | number;
  idTeam?: string | number;
  idTransferMkt?: string | number | null;
  strPlayer?: string;
  strPlayerAlternate?: string;
  strTeam?: string;
  strSport?: string;
  strNationality?: string;
  strPosition?: string;
  dateBorn?: string;
  strBirthLocation?: string;
  strNumber?: string | number;
  strHeight?: string;
  strWeight?: string;
  strCutout?: string | null;
  strThumb?: string | null;
}

function toClubCandidate(t: TsdbTeam): ClubCandidate {
  return {
    sourceId: String(t.idTeam ?? ""),
    name: t.strTeam ?? "",
    alternateNames: t.strTeamAlternate ? [t.strTeamAlternate] : undefined,
    shortName: t.strTeamShort,
  };
}

function toPlayerCandidate(p: TsdbPlayer): PlayerCandidate {
  return {
    sourceId: String(p.idPlayer ?? ""),
    name: p.strPlayer ?? "",
    alternateNames: p.strPlayerAlternate ? [p.strPlayerAlternate] : undefined,
    sourceClubId: p.idTeam != null ? String(p.idTeam) : undefined,
    birthDate: p.dateBorn ?? undefined,
    transfermarktId: p.idTransferMkt != null && p.idTransferMkt !== "" ? String(p.idTransferMkt) : undefined,
  };
}

function toClubEnrichment(t: TsdbTeam): ClubEnrichment {
  const colours = [t.strColour1, t.strColour2, t.strColour3].filter((c): c is string => Boolean(c && /^#?[0-9a-f]{6}$/i.test(c))).map(hex);
  return {
    country: t.strCountry || undefined,
    city: t.strLocation || undefined,
    stadium: t.strStadium || undefined,
    capacity: num(t.intStadiumCapacity),
    foundedYear: num(t.intFormedYear),
    colours: colours.length ? colours : undefined,
    badgeUrl: t.strBadge || undefined,
  };
}

function toPlayerEnrichment(p: TsdbPlayer): PlayerEnrichment {
  return {
    photo: p.strThumb || p.strCutout || undefined,
    photoCutout: p.strCutout || undefined,
    birthDate: isoDate(p.dateBorn),
    heightCm: parseHeightCm(p.strHeight),
    weightKg: parseWeightKg(p.strWeight),
    shirtNumber: num(p.strNumber),
    birthPlace: p.strBirthLocation || undefined,
    nationality: p.strNationality || undefined,
    position: p.strPosition || undefined,
  };
}

const hex = (c: string): string => (c.startsWith("#") ? c : `#${c}`).toUpperCase();

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * An unknown birthdate comes back as `"0000-00-00"`, which passes a shape test
 * but is not a date — so the value is round-tripped through `Date` rather than
 * merely pattern-matched.
 */
function isoDate(v?: string): string | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v;
}


/** `"178 cm"`, and occasionally `"6 ft 1 in"`. */
function parseHeightCm(v?: string): number | undefined {
  if (!v) return undefined;
  const cm = v.match(/([\d.]+)\s*cm/i);
  if (cm) return Math.round(Number(cm[1]));
  const m = v.match(/^([\d.]+)\s*m$/i);
  if (m) return Math.round(Number(m[1]) * 100);
  const ft = v.match(/([\d.]+)\s*ft(?:\s*([\d.]+)\s*in)?/i);
  if (ft) return Math.round(Number(ft[1]) * 30.48 + Number(ft[2] ?? 0) * 2.54);
  return undefined;
}

/** Units are per-RECORD, not global: `"71 kg"` and `"192 lbs"` both occur. */
function parseWeightKg(v?: string): number | undefined {
  if (!v) return undefined;
  const kg = v.match(/([\d.]+)\s*kg/i);
  if (kg) return Math.round(Number(kg[1]));
  const lbs = v.match(/([\d.]+)\s*(?:lbs?|pounds?)/i);
  if (lbs) return Math.round(Number(lbs[1]) * 0.45359237);
  return undefined;
}

export const __testables = { parseHeightCm, parseWeightKg, toClubEnrichment, toPlayerEnrichment, isSentinel };
