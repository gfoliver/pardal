import type { RawClub, RawCompetition, RawPlayer, RawSnapshot, RawStatLine } from "../raw/RawSnapshot.js";
import type { Source } from "./Source.js";

/**
 * Extract adapter over the community Transfermarkt API (`felipeall/transfermarkt-api`,
 * self-hostable FastAPI). IMPURE — network I/O; runs ONLY when the user invokes
 * the assemble command, never at game runtime. Best-effort/defensive parsing:
 * the API only exposes bio + market value + BASIC stats, which is all this
 * adapter maps. Endpoints and fields per the project's shape at build time; the
 * exact source contract is encapsulated here so a source move touches one file.
 *
 * Prefer a self-hosted instance (`--tm-api=http://localhost:8000`) and polite
 * pacing — the public demo rate-limits and is shared/best-effort.
 */
export class TransfermarktSource implements Source {
  readonly id = "transfermarkt";
  readonly version = "community-api-1";

  constructor(
    private readonly baseUrl: string,
    private readonly opts: { delayMs?: number } = {},
  ) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`Transfermarkt API ${res.status} for ${path}`);
    if (this.opts.delayMs) await new Promise((r) => setTimeout(r, this.opts.delayMs));
    return (await res.json()) as T;
  }

  async fetchCompetition(key: string, seasonId?: string): Promise<Partial<RawSnapshot>> {
    const season = seasonId ? `?season_id=${seasonId}` : "";
    const clubsRes = await this.get<{ id: string; clubs: { id: string; name: string }[] }>(`/competitions/${key}/clubs${season}`);

    const clubs: RawClub[] = [];
    const players: RawPlayer[] = [];

    for (const c of clubsRes.clubs ?? []) {
      const profile = await this.get<TmClubProfile>(`/clubs/${c.id}/profile`).catch(() => ({}) as TmClubProfile);
      clubs.push({
        id: c.id,
        name: c.name,
        shortName: undefined,
        country: profile.addressLine3 ? undefined : undefined,
        city: profile.address?.city,
        stadium: profile.stadiumName,
        capacity: numeric(profile.stadiumSeats),
        foundedYear: numeric(profile.foundedOn?.slice(0, 4)),
        marketValueEur: numeric(profile.currentMarketValue),
        competitionIds: [key],
      });

      const squad = await this.get<{ players: TmSquadPlayer[] }>(`/clubs/${c.id}/players${season}`).catch(() => ({ players: [] }));
      for (const p of squad.players ?? []) {
        const stats = await this.get<{ stats: TmStatLine[] }>(`/players/${p.id}/stats`).catch(() => ({ stats: [] }));
        const line = (stats.stats ?? []).find((s) => s.competition_id === key);
        players.push({
          id: p.id,
          name: p.name,
          clubId: c.id,
          position: p.position ?? "Central Midfield",
          dob: p.date_of_birth,
          age: numeric(p.age),
          nationality: p.nationality ?? [],
          foot: p.foot,
          heightCm: parseHeight(p.height),
          marketValueEur: numeric(p.market_value),
          contractExpires: p.contract,
          stats: line
            ? [statLine(this.id, key, seasonId, line)]
            : [{ source: this.id, competitionId: key, seasonId, appearances: 0, minutes: 0, goals: 0, assists: 0 }],
        });
      }
    }

    const competitions: RawCompetition[] = [
      { id: key, name: clubsRes.id ?? key, type: "league", seasonId, entrantClubIds: clubs.map((c) => c.id) },
    ];
    return { primaryCompetitionId: key, competitions, clubs, players };
  }
}

// --- source-shaped response fragments (only the fields we read) -------------
interface TmClubProfile {
  stadiumName?: string;
  stadiumSeats?: string | number;
  foundedOn?: string;
  currentMarketValue?: string | number;
  addressLine3?: string;
  address?: { city?: string };
}
interface TmSquadPlayer {
  id: string;
  name: string;
  position?: string;
  date_of_birth?: string;
  age?: string | number;
  nationality?: string[];
  foot?: string;
  height?: string | number;
  market_value?: string | number;
  contract?: string;
}
interface TmStatLine {
  competition_id: string;
  season_id?: string;
  appearances?: string | number;
  goals?: string | number;
  assists?: string | number;
  minutes_played?: string | number;
  yellow_cards?: string | number;
  red_cards?: string | number;
}

function statLine(source: string, competitionId: string, seasonId: string | undefined, s: TmStatLine): RawStatLine {
  return {
    source,
    competitionId,
    seasonId,
    appearances: numeric(s.appearances) ?? 0,
    minutes: numeric(String(s.minutes_played).replace(/[.']/g, "")) ?? 0,
    goals: numeric(s.goals) ?? 0,
    assists: numeric(s.assists) ?? 0,
    yellow: numeric(s.yellow_cards) ?? 0,
    red: numeric(s.red_cards) ?? 0,
  };
}

function numeric(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** "1,89 m" / "189 cm" → 189. */
function parseHeight(v: string | number | undefined): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return v > 100 ? v : Math.round(v * 100);
  const m = v.replace(",", ".").match(/([0-9.]+)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n < 3 ? Math.round(n * 100) : Math.round(n);
}
