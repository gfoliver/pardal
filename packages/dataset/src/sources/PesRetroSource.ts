import type { PesRatings } from "../pes/ratings.js";
import type { PlayerCandidate } from "../resolve/matchEntities.js";

/**
 * Extract adapter over the pesretrostats Supabase REST API — a community
 * database of PES-style ratings. IMPURE (network); runs only when the user asks,
 * never at game time.
 *
 * The whole reason it exists: our attributes were inferred from market value and
 * appearances, which is a weak proxy. This source has actually rated the players.
 * The endpoint contract lives here alone, so a source move touches one file.
 */

const DEFAULT_BASE = "https://supabase.pesretrostats.com/rest/v1";

/** The columns we ask for. Anything not listed is not read. */
const COLUMNS = [
  "id", "name", "overall", "position", "shirt_number", "birth_date", "is_classic",
  "attack", "defense", "balance", "stamina", "top_speed", "acceleration", "response", "agility",
  "dribble_accuracy", "dribble_speed", "short_pass_accuracy", "short_pass_speed",
  "long_pass_accuracy", "long_pass_speed", "shot_accuracy", "shot_power", "shot_technique",
  "free_kick_accuracy", "swerve", "heading", "jump", "technique", "aggression", "mentality",
  "goal_keeping", "team_work", "total_stats",
  "team:teams!players_team_id_fkey(id,name,league_id)",
].join(",");

export interface PesTeam {
  readonly sourceId: string;
  readonly name: string;
}

/** One player as the source describes him, in OUR vocabulary. */
export interface PesPlayer {
  readonly sourceId: string;
  readonly name: string;
  readonly birthDate?: string;
  readonly position?: string;
  readonly shirtNumber?: number;
  readonly overall?: number;
  readonly team?: PesTeam;
  readonly ratings: PesRatings;
}

const num = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};

interface RawRow {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly overall?: unknown;
  readonly position?: unknown;
  readonly shirt_number?: unknown;
  readonly birth_date?: unknown;
  readonly team?: { readonly id?: unknown; readonly name?: unknown } | null;
  readonly [key: string]: unknown;
}

/** Map one API row onto our shape. Defensive: real rows have holes. */
export function toPesPlayer(row: RawRow): PesPlayer | undefined {
  const sourceId = typeof row.id === "string" ? row.id : undefined;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!sourceId || !name) return undefined;
  const team =
    row.team && typeof row.team.id === "string" && typeof row.team.name === "string"
      ? { sourceId: row.team.id, name: row.team.name }
      : undefined;
  return {
    sourceId,
    name,
    // Already ISO in this source; sliced so a timestamp can't sneak in.
    birthDate: typeof row.birth_date === "string" ? row.birth_date.slice(0, 10) : undefined,
    position: typeof row.position === "string" ? row.position : undefined,
    shirtNumber: num(row.shirt_number),
    overall: num(row.overall),
    team,
    ratings: {
      attack: num(row.attack), defense: num(row.defense), balance: num(row.balance), stamina: num(row.stamina),
      topSpeed: num(row.top_speed), acceleration: num(row.acceleration), response: num(row.response),
      agility: num(row.agility), dribbleAccuracy: num(row.dribble_accuracy), dribbleSpeed: num(row.dribble_speed),
      shortPassAccuracy: num(row.short_pass_accuracy), shortPassSpeed: num(row.short_pass_speed),
      longPassAccuracy: num(row.long_pass_accuracy), longPassSpeed: num(row.long_pass_speed),
      shotAccuracy: num(row.shot_accuracy), shotPower: num(row.shot_power), shotTechnique: num(row.shot_technique),
      freeKickAccuracy: num(row.free_kick_accuracy), swerve: num(row.swerve), heading: num(row.heading),
      jump: num(row.jump), technique: num(row.technique), aggression: num(row.aggression),
      mentality: num(row.mentality), goalKeeping: num(row.goal_keeping), teamWork: num(row.team_work),
      overall: num(row.overall),
    },
  };
}

/** A source player as a candidate the shared resolver can match against. */
export function toCandidate(p: PesPlayer): PlayerCandidate {
  return {
    sourceId: p.sourceId,
    name: p.name,
    sourceClubId: p.team?.sourceId,
    birthDate: p.birthDate,
  };
}

export class PesRetroSource {
  readonly id = "pesretrostats";
  readonly version = "supabase-rest-1";

  constructor(
    private readonly apiKey: string,
    private readonly opts: { baseUrl?: string; pageSize?: number; delayMs?: number } = {},
  ) {}

  private get base(): string {
    return this.opts.baseUrl ?? DEFAULT_BASE;
  }

  /**
   * Every current (non-classic) player in the given leagues, paged.
   *
   * Paged rather than one big request because the API caps a response and a
   * silent truncation here would look exactly like "the source doesn't have him"
   * — the failure mode that cost us 109 players in the squad scraper.
   */
  async fetchLeaguePlayers(leagueIds: readonly string[], log: (m: string) => void = () => {}): Promise<PesPlayer[]> {
    const size = this.opts.pageSize ?? 500;
    const out: PesPlayer[] = [];
    const seen = new Set<string>();
    for (let offset = 0; ; offset += size) {
      const rows = await this.page(leagueIds, offset, size);
      for (const row of rows) {
        const p = toPesPlayer(row);
        if (p && !seen.has(p.sourceId)) {
          seen.add(p.sourceId);
          out.push(p);
        }
      }
      log(`  fetched ${out.length} players (offset ${offset})`);
      // A short page means the end; a full one means there may be more.
      if (rows.length < size) break;
      if (this.opts.delayMs) await new Promise((r) => setTimeout(r, this.opts.delayMs));
    }
    return out;
  }

  private async page(leagueIds: readonly string[], offset: number, limit: number): Promise<RawRow[]> {
    const params = new URLSearchParams({
      select: COLUMNS,
      is_classic: "eq.false",
      order: "overall.desc,total_stats.desc",
      offset: String(offset),
      limit: String(limit),
    });
    // Filtering on the JOINED team's league keeps the query to the competition
    // we're building, without having to know every club id up front.
    if (leagueIds.length > 0) params.set("teams.league_id", `in.(${leagueIds.join(",")})`);
    const res = await fetch(`${this.base}/players?${params.toString()}`, {
      headers: {
        apikey: this.apiKey,
        authorization: `Bearer ${this.apiKey}`,
        "accept-profile": "public",
      },
    });
    if (!res.ok) throw new Error(`pesretrostats ${res.status} at offset ${offset}: ${await res.text()}`);
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) throw new Error("pesretrostats returned a non-array body");
    return body as RawRow[];
  }

  /** Every player of the given source club ids, paged the same way. */
  async fetchClubPlayers(clubIds: readonly string[], log: (m: string) => void = () => {}): Promise<PesPlayer[]> {
    const size = this.opts.pageSize ?? 500;
    const out: PesPlayer[] = [];
    const seen = new Set<string>();
    for (let offset = 0; ; offset += size) {
      const params = new URLSearchParams({
        select: COLUMNS,
        is_classic: "eq.false",
        team_id: `in.(${clubIds.join(",")})`,
        order: "overall.desc,total_stats.desc",
        offset: String(offset),
        limit: String(size),
      });
      const res = await fetch(`${this.base}/players?${params.toString()}`, {
        headers: { apikey: this.apiKey, authorization: `Bearer ${this.apiKey}`, "accept-profile": "public" },
      });
      if (!res.ok) throw new Error(`pesretrostats ${res.status} at offset ${offset}: ${await res.text()}`);
      const rows = (await res.json()) as RawRow[];
      for (const row of rows) {
        const p = toPesPlayer(row);
        if (p && !seen.has(p.sourceId)) {
          seen.add(p.sourceId);
          out.push(p);
        }
      }
      log(`  fetched ${out.length} players (offset ${offset})`);
      if (rows.length < size) break;
      if (this.opts.delayMs) await new Promise((r) => setTimeout(r, this.opts.delayMs));
    }
    return out;
  }
}
