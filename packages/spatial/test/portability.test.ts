import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The guard that keeps the determinism work from rotting.
 *
 * Every client re-simulates a multiplayer match from its seed and the results are
 * compared, so the simulation packages may only use operations that are specified
 * to the bit. One stray `Math.hypot` reintroduces a divergence that shows two
 * players different scorelines — and it would be invisible until someone complained
 * about a match, because it is correct on whatever machine you developed it on.
 *
 * A grep is a blunt instrument, but the failure it prevents is subtle and remote,
 * which is exactly when a blunt instrument earns its place.
 */

/** Packages whose output has to be identical on every runtime. */
const GUARDED = ["spatial", "engine", "domain", "competition", "protocol"];

const BANNED: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  {
    pattern: /Math\.(hypot|exp|pow|log|log2|log10|log1p|expm1|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|cbrt|fround)\s*\(/,
    why: "implementation-approximated: engines may round differently. Use exp()/tanSmall() from spatial/src/exp.ts, or sqrt/an exact literal",
  },
  {
    pattern: /\*\*/,
    why: "the ** operator is implementation-approximated like Math.pow — write the multiplication out",
  },
  {
    pattern: /\.localeCompare\s*\(/,
    why: "ICU collation depends on the runtime locale, so two clients can order ids differently. Use byCodepoint",
  },
  {
    pattern: /\.toLocaleString\s*\(|\.toLocaleDateString\s*\(|Intl\./,
    why: "locale-dependent formatting has no place in the simulation; format in the UI layer",
  },
  { pattern: /Math\.random\s*\(/, why: "unseeded randomness is not reproducible. Take a RandomSource" },
  {
    pattern: /Date\.now\s*\(|new Date\s*\(|performance\.now\s*\(/,
    why: "wall-clock time makes a replay depend on when it ran. Pass the time in",
  },
];

/** Source files under a package, excluding tests and build output. */
function sourceFiles(pkg: string): string[] {
  const root = join(process.cwd(), "packages", pkg, "src");
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) out.push(full);
    }
  };
  walk(root);
  return out;
}

/**
 * Strip comments and string literals before matching, so the regeneration hints in
 * the source ("npx tsx -e Math.cos(...)") and prose explaining WHY these are banned
 * don't trip the guard on themselves.
 */
function stripCommentsAndStrings(src: string): string {
  let out = "";
  let i = 0;
  type Mode = "code" | "line" | "block" | "single" | "double" | "template";
  let mode: Mode = "code";
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    const ch = src[i]!;
    if (mode === "code") {
      if (two === "//") {
        mode = "line";
        i += 2;
      } else if (two === "/*") {
        mode = "block";
        i += 2;
      } else if (ch === "'") {
        mode = "single";
        i++;
      } else if (ch === '"') {
        mode = "double";
        i++;
      } else if (ch === "`") {
        mode = "template";
        i++;
      } else {
        out += ch;
        i++;
      }
      continue;
    }
    if (mode === "line") {
      if (ch === "\n") {
        mode = "code";
        out += "\n";
      }
      i++;
      continue;
    }
    if (mode === "block") {
      if (two === "*/") {
        mode = "code";
        i += 2;
      } else {
        if (ch === "\n") out += "\n"; // keep line numbers aligned
        i++;
      }
      continue;
    }
    // inside a string of some kind
    if (ch === "\\") {
      i += 2;
      continue;
    }
    const closes = mode === "single" ? "'" : mode === "double" ? '"' : "`";
    if (ch === closes) mode = "code";
    else if (ch === "\n") out += "\n";
    i++;
  }
  return out;
}

describe("portability guard", () => {
  for (const pkg of GUARDED) {
    it(`@fut/${pkg} uses only bit-exact operations`, () => {
      const offences: string[] = [];
      for (const file of sourceFiles(pkg)) {
        const lines = stripCommentsAndStrings(readFileSync(file, "utf8")).split("\n");
        lines.forEach((line, n) => {
          for (const { pattern, why } of BANNED) {
            if (pattern.test(line)) {
              const rel = file.slice(file.indexOf(join("packages", pkg)));
              offences.push(`${rel}:${n + 1}  ${line.trim()}\n    -> ${why}`);
            }
          }
        });
      }
      expect(offences, `\n${offences.join("\n")}\n`).toEqual([]);
    });
  }

  it("actually catches what it is looking for", () => {
    // A guard nobody has seen fail is a guard nobody knows works.
    const bad = "const d = Math.hypot(a, b);";
    expect(BANNED.some((b) => b.pattern.test(bad))).toBe(true);
    expect(BANNED.some((b) => b.pattern.test("const x = y ** 2;"))).toBe(true);
    expect(BANNED.some((b) => b.pattern.test("ids.sort((a, b) => a.localeCompare(b));"))).toBe(true);
    // ...and does not fire on the replacements, or on a comment mentioning them
    expect(BANNED.some((b) => b.pattern.test("const d = Math.sqrt(a * a + b * b);"))).toBe(false);
    expect(BANNED.some((b) => b.pattern.test(stripCommentsAndStrings("// use Math.cos(a) offline")))).toBe(false);
  });
});
