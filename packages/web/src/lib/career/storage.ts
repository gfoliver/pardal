import type { CareerSnapshot, CareerStore } from "@fut/career";

/**
 * Hand-rolled IndexedDB persistence (no new dep). One object store `saves`
 * keyed by slotId holds { slotId, name, updatedAt, seasonLabel, snapshot }; a
 * `meta` store remembers WHERE the player was, so a refresh puts them back.
 * CareerSnapshot is plain data, so it structured-clones straight in.
 */
/**
 * Still "onze" after the rename to Pardal, deliberately: the database name is
 * the address of every save on a player's machine. Renaming it wouldn't migrate
 * anything — it would open a new, empty database and their careers would simply
 * be gone. If it ever has to change, it needs a copy-across on first boot.
 */
const DB_NAME = "onze-career";
const DB_VERSION = 1;
const SAVES = "saves";
const META = "meta";

export interface SaveSlot {
  slotId: string;
  name: string;
  updatedAt: number;
  seasonLabel: string;
  snapshot: CareerSnapshot;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SAVES)) db.createObjectStore(SAVES, { keyPath: "slotId" });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

/** CareerStore impl for the browser (snapshots only — the façade's save spine). */
export class IndexedDbCareerStore implements CareerStore {
  async save(key: string, snapshot: CareerSnapshot): Promise<void> {
    const slot: SaveSlot = {
      slotId: key,
      name: snapshot.clubs[snapshot.managedClubId]?.name ?? key,
      updatedAt: Date.now(),
      seasonLabel: `S${snapshot.currentDate.season + 1}`,
      snapshot,
    };
    await tx(SAVES, "readwrite", (s) => s.put(slot));
  }
  async load(key: string): Promise<CareerSnapshot | null> {
    const slot = await tx<SaveSlot | undefined>(SAVES, "readonly", (s) => s.get(key));
    return slot?.snapshot ?? null;
  }
  async list(): Promise<string[]> {
    const keys = await tx<IDBValidKey[]>(SAVES, "readonly", (s) => s.getAllKeys());
    return keys.map(String).sort();
  }
  async delete(key: string): Promise<void> {
    await tx(SAVES, "readwrite", (s) => s.delete(key));
  }
}

/** All save slots with metadata (for the load/continue screen). */
export async function listSlots(): Promise<SaveSlot[]> {
  const all = await tx<SaveSlot[]>(SAVES, "readonly", (s) => s.getAll());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Where the player was when the tab last closed.
 *
 * Recorded EXPLICITLY, on entering a career and on leaving one, rather than inferred from "there is
 * a most-recent save". That inference is what made a refresh at the menu drop you straight back into
 * your last career: having played a save is not the same fact as currently being in it, and only the
 * app knows the difference.
 *
 * Written when the player moves between the menu and a career, not on every autosave — a career they
 * entered stays the answer even if the tab dies before the next save.
 */
export type SessionLocation = { readonly at: "menu" } | { readonly at: "career"; readonly slotId: string };

const SESSION_KEY = "session";

/** The menu whenever nothing readable is stored: it is the one place that always works. */
export async function readSession(): Promise<SessionLocation> {
  try {
    const v = await tx<SessionLocation | undefined>(META, "readonly", (s) => s.get(SESSION_KEY));
    if (v?.at === "career" && typeof v.slotId === "string") return { at: "career", slotId: v.slotId };
    return { at: "menu" };
  } catch {
    return { at: "menu" };
  }
}

export async function writeSession(location: SessionLocation): Promise<void> {
  try {
    await tx(META, "readwrite", (s) => s.put(location, SESSION_KEY));
  } catch {
    // Losing the bookmark is not worth failing a navigation over; the menu is a safe default.
  }
}
