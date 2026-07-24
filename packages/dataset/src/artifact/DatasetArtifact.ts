import type { DatasetWorld, LeagueData } from "@fut/competition";
import type { RawSnapshot } from "../raw/RawSnapshot.js";
import type { EvidenceSidecar } from "../emit/Emit.js";

/** Provenance/attribution for one source that fed a snapshot. */
export interface SourceRef {
  readonly id: string;
  readonly version: string;
  /** ISO timestamp of when the snapshot was fetched (set by the CLI). */
  readonly fetchedAt: string;
}

export interface DatasetManifest {
  readonly id: string; // stable dataset id (== league id)
  readonly name: string;
  readonly slug: string;
  readonly competition: string; // source competition code, e.g. "BRA1"
  readonly datasetVersion: string;
  readonly sources: readonly SourceRef[];
  readonly counts: { readonly competitions: number; readonly clubs: number; readonly players: number };
  readonly attribution: string;
  readonly note?: string;
}

/** The full in-memory artifact (what `writeArtifact` persists as a directory). */
export interface DatasetArtifact {
  readonly manifest: DatasetManifest;
  readonly raw: RawSnapshot;
  readonly league: LeagueData;
  readonly world: DatasetWorld;
  readonly evidence: EvidenceSidecar;
}

export const ARTIFACT_FILES = {
  manifest: "manifest.json",
  raw: "raw.json",
  league: "league.json",
  world: "world.json",
  evidence: "evidence.json",
} as const;
