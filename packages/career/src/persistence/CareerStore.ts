import type { CareerSnapshot } from "../state/CareerState.js";

/**
 * CareerState is plain data (interfaces + string enums, no class instances or
 * Maps), so it serializes with JSON / structured-clone as-is. We still go
 * through explicit (de)serialize helpers to centralise version handling and
 * validation — the seam a save-file / IndexedDB record uses.
 */
export function serializeCareer(snapshot: CareerSnapshot): string {
  return JSON.stringify(snapshot);
}

export function deserializeCareer(json: string): CareerSnapshot {
  const parsed = JSON.parse(json) as CareerSnapshot;
  validateSnapshot(parsed);
  return parsed;
}

/** Cheap shape/version check; throws on an unreadable or too-new save. */
export function validateSnapshot(s: CareerSnapshot): void {
  if (!s || typeof s !== "object") throw new CareerSaveError("Save is not an object");
  if (typeof s.version !== "number") throw new CareerSaveError("Save is missing a version");
  if (s.version > SAVE_VERSION) throw new CareerSaveError(`Save version ${s.version} is newer than supported ${SAVE_VERSION}`);
  if (typeof s.careerSeed !== "number" || typeof s.managedClubId !== "string" || !Array.isArray(s.competitions)) {
    throw new CareerSaveError("Save is missing required fields");
  }
}

export const SAVE_VERSION = 1;

export class CareerSaveError extends Error {}

/** Storage-agnostic persistence. IndexedDB/fs implementations plug in at the
 *  app layer (keeps @fut/career free of DOM/Node); in-memory serves tests. */
export interface CareerStore {
  save(key: string, snapshot: CareerSnapshot): Promise<void>;
  load(key: string): Promise<CareerSnapshot | null>;
  list(): Promise<string[]>;
  delete(key: string): Promise<void>;
}

export class InMemoryCareerStore implements CareerStore {
  private readonly data = new Map<string, string>();

  async save(key: string, snapshot: CareerSnapshot): Promise<void> {
    this.data.set(key, serializeCareer(snapshot));
  }
  async load(key: string): Promise<CareerSnapshot | null> {
    const raw = this.data.get(key);
    return raw ? deserializeCareer(raw) : null;
  }
  async list(): Promise<string[]> {
    return [...this.data.keys()].sort();
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}
