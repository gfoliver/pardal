import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Derives the engine version from the CONTENT of the simulation packages.
 *
 * A hand-maintained version string is a promise nobody keeps: the first time someone
 * tweaks a constant in `spatial/src/config.ts` without remembering to bump it, every
 * stored match record silently reproduces a different match, and the multiplayer model
 * — "the seed is the authority" — is quietly false. So humans do not get to set this.
 *
 * Two deliberate choices, both of which are the safe side of a real trade:
 *
 *  - **Line endings are normalised to LF before hashing.** This repo checks out with
 *    CRLF on Windows and LF elsewhere. Hashing raw bytes would give the same code two
 *    different versions on two machines, which is the exact failure this is meant to
 *    prevent, arriving through the back door.
 *
 *  - **Comments are hashed too, not stripped.** A comment edit therefore bumps the
 *    version even though behaviour did not change. That is the cost, and it is the
 *    cheap direction to be wrong in: a spurious bump means retaining one more engine
 *    chunk for replay, while a MISSED bump means records that no longer reproduce and
 *    attesters accusing each other. Stripping comments would need a parser, and a
 *    parser with a bug in it deletes real code and produces exactly the missed bump.
 *    Do not "optimise" this.
 *
 * Note what is NOT included: `@fut/protocol` itself. The wire contract has its own
 * `MatchProtocol.version`, because a change to how a match is DESCRIBED is a different
 * event from a change to how it is PLAYED, and conflating them would invalidate
 * replays whenever a field was renamed.
 */

/** The packages whose code decides what happens in a match. */
export const SIMULATION_PACKAGES = ["domain", "engine", "spatial"] as const;

/** Hex characters kept. 64 bits is ample for telling apart dozens of builds. */
const LENGTH = 16;

function collect(repoRoot: string): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = [];
  for (const pkg of SIMULATION_PACKAGES) {
    const root = join(repoRoot, "packages", pkg, "src");
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir).sort()) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
          out.push({
            // POSIX separators, so a Windows checkout and a Linux one agree.
            path: relative(repoRoot, full).split(sep).join("/"),
            source: readFileSync(full, "utf8").replace(/\r\n/g, "\n"),
          });
        }
      }
    };
    walk(root);
  }
  // Sorted by codepoint, never localeCompare — the same reason as everywhere else.
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export async function computeEngineVersion(repoRoot: string): Promise<{
  version: string;
  files: number;
}> {
  const files = collect(repoRoot);
  // Each file contributes its path AND its content, both LENGTH-PREFIXED, so no
  // rename or concatenation can forge another file set's preimage. A separator byte
  // would have done the same job, but a literal NUL in a source file makes git treat
  // it as binary and mangles every diff of it — which is how the first version of
  // this line was written, and worth not repeating.
  const preimage = files
    .map((f) => `${f.path.length}:${f.path}${f.source.length}:${f.source}`)
    .join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(preimage));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { version: hex.slice(0, LENGTH), files: files.length };
}
