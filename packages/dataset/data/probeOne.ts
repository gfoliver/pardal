/**
 * Authoring-time probe: run the enricher against ONE player and print what the
 * matcher decided. Used to diagnose a miss without paying for a full pass.
 *
 * Run: npx tsx packages/dataset/data/probeOne.ts "Maripán"
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RawSnapshot } from "../src/raw/RawSnapshot.js";
import { readEnrichment, enrichmentPath } from "../src/enrich/EnrichmentStore.js";
import { TheSportsDbSource } from "../src/sources/TheSportsDbSource.js";

const needle = (process.argv[2] ?? "").toLowerCase();
const dir = resolve(dirname(fileURLToPath(import.meta.url)), "brasileirao-serie-a");
const snapshot: RawSnapshot = JSON.parse(readFileSync(resolve(dir, "raw.json"), "utf8"));
const cached = readEnrichment(enrichmentPath(dir));

const player = snapshot.players.find((p) => p.name.toLowerCase().includes(needle));
if (!player) throw new Error(`No player matching "${needle}"`);
console.log(`Probing ${player.name} (${player.id}) — dob "${player.dob}"`);

const src = new TheSportsDbSource({ delayMs: 2200 });
const out = await src.run(
  snapshot,
  { clubs: [], players: [{ id: player.id, depth: "roster" }], skipped: { alreadyDone: 0, knownMisses: 0 }, deferred: 0 },
  {
    club: () => {},
    player: (id, rec) => console.log(`  → ${id}: ${rec.status} ${rec.sourceId ?? ""} photo=${rec.data?.photo ?? "—"}`),
    current: () => cached ?? { source: src.id, version: src.version, clubs: {}, players: {} },
  },
  (m) => console.log(m),
);
console.log(`${out.requests} requests · matched ${out.playersMatched} · missed ${out.playersMissed}`);
if (out.ambiguous.length) console.log("ambiguous:", out.ambiguous);
