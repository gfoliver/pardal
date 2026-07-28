import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PesRatings } from "./ratings.js";

/**
 * The RATINGS layer: a third independently-cached body of facts beside
 * `raw.json` (squads) and `enrichment.json` (identity).
 *
 * Its own file for the same reason the second one has its own: re-scraping
 * squads must not discard ratings, and re-fetching ratings must not stale the
 * squads. Each command owns exactly one file and reads the others.
 *
 * Records carry a STATUS. A player the source genuinely hasn't rated is
 * remembered as a miss, so a re-run doesn't ask again forever — and, more
 * importantly, so "we looked and he isn't there" is distinguishable from "we
 * never looked", which is the difference between a backfill and a bug.
 */

export const PES_FILE = "pes.json";

export interface PesPlayerRecord {
  readonly status: "matched" | "notFound";
  readonly ratings?: PesRatings;
  readonly overall?: number;
  /** The source's position code — a second opinion, never overrides ours. */
  readonly position?: string;
  readonly shirtNumber?: number;
  readonly sourceId?: string;
  /** How the resolver decided, so a bad match is traceable to its rule. */
  readonly method?: string;
  readonly fetchedAt: string;
}

export interface PesFile {
  readonly source: string;
  readonly version: string;
  /** Our clubId → the source's club id, once resolved. */
  readonly clubs: Readonly<Record<string, string>>;
  readonly players: Readonly<Record<string, PesPlayerRecord>>;
}

export function pesPath(datasetDir: string): string {
  return join(datasetDir, PES_FILE);
}

/** An absent or unreadable file is "nothing cached yet", never fatal. */
export function readPesFile(path: string): PesFile | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<PesFile>;
    if (!parsed || typeof parsed !== "object") return undefined;
    return {
      source: parsed.source ?? "pesretrostats",
      version: parsed.version ?? "0",
      clubs: parsed.clubs ?? {},
      players: parsed.players ?? {},
    };
  } catch {
    return undefined;
  }
}

export function writePesFile(path: string, file: PesFile): void {
  mkdirSync(dirname(path), { recursive: true });
  const sorted = <T>(rec: Readonly<Record<string, T>>): Record<string, T> =>
    Object.fromEntries(Object.entries(rec).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  // Stable key order so a re-run produces a diffable file, not a reshuffled one.
  const out: PesFile = { source: file.source, version: file.version, clubs: sorted(file.clubs), players: sorted(file.players) };
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
}

export function loadPesFor(datasetDir: string): PesFile | undefined {
  return readPesFile(pesPath(datasetDir));
}

/** Only the matched records, as the pipeline's ratings map. */
export function ratingsMapOf(file: PesFile | undefined): Map<string, { ratings: PesRatings; overall?: number; position?: string }> {
  const out = new Map<string, { ratings: PesRatings; overall?: number; position?: string }>();
  for (const [id, rec] of Object.entries(file?.players ?? {})) {
    if (rec.status !== "matched" || !rec.ratings) continue;
    out.set(id, { ratings: rec.ratings, overall: rec.overall, position: rec.position });
  }
  return out;
}

/**
 * A mutable view that never downgrades what it already holds.
 *
 * The rule that matters: a failed lookup must not overwrite a matched record. A
 * miss is the absence of evidence, not evidence of absence — the same guard the
 * identity layer needed after a re-query nearly wiped good data.
 */
export class PesStore {
  private readonly clubs: Record<string, string>;
  private readonly players: Record<string, PesPlayerRecord>;

  constructor(
    private readonly path: string,
    private readonly source: string,
    private readonly version: string,
    existing?: PesFile,
  ) {
    this.clubs = { ...(existing?.clubs ?? {}) };
    this.players = { ...(existing?.players ?? {}) };
  }

  club(ourId: string, sourceId: string): void {
    this.clubs[ourId] = sourceId;
  }

  match(id: string, rec: Omit<PesPlayerRecord, "status">): void {
    this.players[id] = { status: "matched", ...rec };
  }

  miss(id: string, fetchedAt: string): void {
    const prev = this.players[id];
    this.players[id] = prev?.status === "matched" ? { ...prev, fetchedAt } : { status: "notFound", fetchedAt };
  }

  snapshot(): PesFile {
    return { source: this.source, version: this.version, clubs: this.clubs, players: this.players };
  }

  flush(): void {
    writePesFile(this.path, this.snapshot());
  }
}
