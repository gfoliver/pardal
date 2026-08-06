import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SourceAttributes } from "./attributes.js";

/**
 * The RATINGS layer: a third independently-cached body of facts beside `raw.json` (squads) and
 * `enrichment.json` (identity).
 *
 * Its own file for the same reason the second one has its own: re-scraping squads must not
 * discard ratings, and re-fetching ratings must not stale the squads. Each command owns exactly
 * one file and reads the others.
 *
 * Records carry a STATUS. A player the source genuinely hasn't rated is remembered as a miss, so
 * a re-run doesn't ask again forever — and, more importantly, so "we looked and he isn't there"
 * is distinguishable from "we never looked", which is the difference between a backfill and a
 * bug.
 */

export const RATINGS_FILE = "ratings.json";

export interface RatedPlayerRecord {
  readonly status: "matched" | "notFound";
  /** The source's own labels, on ITS scale — mapping happens at read time, not write time. */
  readonly attributes?: SourceAttributes;
  /** The source's id, so a row can be traced back to the page it came from. */
  readonly sourceId?: string;
  /** How the resolver decided, so a bad match is traceable to its rule. */
  readonly method?: string;
  readonly fetchedAt: string;
}

export interface RatingsFile {
  readonly source: string;
  readonly version: string;
  /** Our clubId → the source's club id, once resolved. */
  readonly clubs: Readonly<Record<string, string>>;
  readonly players: Readonly<Record<string, RatedPlayerRecord>>;
}

export function ratingsPath(datasetDir: string): string {
  return join(datasetDir, RATINGS_FILE);
}

/** An absent or unreadable file is "nothing cached yet", never fatal. */
export function readRatingsFile(path: string): RatingsFile | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<RatingsFile>;
    if (!parsed || typeof parsed !== "object") return undefined;
    return {
      source: parsed.source ?? "unknown",
      version: parsed.version ?? "0",
      clubs: parsed.clubs ?? {},
      players: parsed.players ?? {},
    };
  } catch {
    return undefined;
  }
}

export function writeRatingsFile(path: string, file: RatingsFile): void {
  mkdirSync(dirname(path), { recursive: true });
  const sorted = <T>(rec: Readonly<Record<string, T>>): Record<string, T> =>
    Object.fromEntries(Object.entries(rec).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  // Stable key order so a re-run produces a diffable file, not a reshuffled one.
  const out: RatingsFile = { source: file.source, version: file.version, clubs: sorted(file.clubs), players: sorted(file.players) };
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
}

export function loadRatingsFor(datasetDir: string): RatingsFile | undefined {
  return readRatingsFile(ratingsPath(datasetDir));
}

/** Only the matched records, as the pipeline's ratings map. */
export function ratingsMapOf(file: RatingsFile | undefined): Map<string, { attributes: SourceAttributes }> {
  const out = new Map<string, { attributes: SourceAttributes }>();
  for (const [id, rec] of Object.entries(file?.players ?? {})) {
    if (rec.status !== "matched" || !rec.attributes) continue;
    out.set(id, { attributes: rec.attributes });
  }
  return out;
}

/**
 * A mutable view that never downgrades what it already holds.
 *
 * The rule that matters: a failed lookup must not overwrite a matched record. A miss is the
 * absence of evidence, not evidence of absence — the same guard the identity layer needed after
 * a re-query nearly wiped good data.
 */
export class RatingsStore {
  private readonly clubs: Record<string, string>;
  private readonly players: Record<string, RatedPlayerRecord>;

  constructor(
    private readonly path: string,
    private readonly source: string,
    private readonly version: string,
    existing?: RatingsFile,
  ) {
    this.clubs = { ...(existing?.clubs ?? {}) };
    this.players = { ...(existing?.players ?? {}) };
  }

  club(ourId: string, sourceId: string): void {
    this.clubs[ourId] = sourceId;
  }

  match(id: string, rec: Omit<RatedPlayerRecord, "status">): void {
    this.players[id] = { status: "matched", ...rec };
  }

  /**
   * This dump does not have him — keep whatever a previous, better dump found.
   *
   * Absence of evidence, not evidence of absence: a partial scrape must not delete a match that a fuller
   * one established. Use `reject` when the dump DOES have a row and the resolver has decided it is the
   * wrong person; that is a judgement, and it has to be able to overwrite.
   */
  miss(id: string, fetchedAt: string): void {
    const prev = this.players[id];
    this.players[id] = prev?.status === "matched" ? { ...prev, fetchedAt } : { status: "notFound", fetchedAt };
  }

  /**
   * Withdraw a match: the row exists and the resolver has refused it.
   *
   * Without this the store could only ever become more matched, never less wrong — so an improvement to
   * resolution was unable to correct its own past mistakes. Measured when the keeper/outfielder check
   * went in: twenty-seven bad matches were refused and every one of them stayed in `ratings.json`,
   * because `miss` preserves a previous match on purpose and this case is not a miss.
   */
  reject(id: string, fetchedAt: string): void {
    this.players[id] = { status: "notFound", fetchedAt };
  }

  snapshot(): RatingsFile {
    return { source: this.source, version: this.version, clubs: this.clubs, players: this.players };
  }

  flush(): void {
    writeRatingsFile(this.path, this.snapshot());
  }
}
