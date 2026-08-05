import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import config from "../tailwind.config.js";

/**
 * The guard for a failure that has now happened three times, silently, in shipped code.
 *
 * Every colour in the palette is a `var(--token)` reference, which is what makes the theme
 * switchable at runtime. The cost is that Tailwind's opacity modifier CANNOT work on them: it needs
 * the three channels to build an `rgb(… / alpha)` from, a `var()` gives it none, and rather than
 * failing it emits NO RULE AT ALL. `bg-primary/10` is not a faint green — it is a class name that
 * matches nothing, and the element keeps whatever it had.
 *
 * Nothing complains at build time, nothing complains at runtime, and the design looks *nearly*
 * right, which is why it survived three reviews. Measured on the built stylesheet: no rule is
 * generated for `border-primary/40`, `bg-primary/10` or `bg-surface-2/60`.
 *
 * The fix is always the same: add a `--x-soft`/`--x-line`/`--x-wash` token per theme and write
 * `bg-[var(--x-soft)]`. An arbitrary value is generated from the source scan, so it cannot go
 * missing, and a variable can be themed where a baked alpha cannot.
 *
 * This guard derives the banned keys FROM the config, so a colour added tomorrow is covered without
 * anyone remembering to come back here.
 */

/** Utility prefixes that take a colour. `border` covers `border-x`/`border-t` via the boundary below. */
const COLOUR_UTILITIES = [
  "bg",
  "text",
  "border",
  "ring",
  "ring-offset",
  "divide",
  "outline",
  "decoration",
  "shadow",
  "accent",
  "caret",
  "fill",
  "stroke",
  "from",
  "via",
  "to",
  "placeholder",
];

/**
 * Every palette key that resolves to a `var()`, in the dashed form Tailwind builds class names from:
 * `primary.DEFAULT` → `primary`, `primary.soft` → `primary-soft`, `surface.2` → `surface-2`.
 */
function varBackedKeys(): string[] {
  const out: string[] = [];
  const walk = (node: unknown, path: readonly string[]): void => {
    if (typeof node === "string") {
      if (!node.includes("var(")) return;
      const parts = path[path.length - 1] === "DEFAULT" ? path.slice(0, -1) : path;
      out.push(parts.join("-"));
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) walk(v, [...path, k]);
    }
  };
  walk(config.theme?.extend?.colors ?? {}, []);
  return out;
}

/**
 * One pattern matching "a colour utility, one of our var-backed keys, then a slash".
 *
 * Keys are sorted LONGEST FIRST so `border-border-strong/50` is read as the `border-strong` key and
 * not as `border` followed by junk. The leading boundary is a class separator rather than `\b`,
 * because `hover:`, `sm:` and `data-[x]:` all prefix the utility.
 */
function bannedPattern(keys: readonly string[]): RegExp {
  const byLength = [...keys].sort((a, b) => b.length - a.length);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[\\s"'\`:\\[])(${COLOUR_UTILITIES.join("|")})-(${byLength.map(esc).join("|")})\\/\\d`);
}

/**
 * Strip comments only. Unlike the simulation packages' portability guard, string literals have to be
 * KEPT: a class name lives in a string, so stripping them would leave nothing to check.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let mode: "code" | "line" | "block" = "code";
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
      } else {
        out += ch;
        i++;
      }
    } else if (mode === "line") {
      if (ch === "\n") {
        mode = "code";
        out += "\n";
      }
      i++;
    } else {
      if (two === "*/") {
        mode = "code";
        i += 2;
      } else {
        if (ch === "\n") out += "\n"; // keep line numbers aligned
        i++;
      }
    }
  }
  return out;
}

function sourceFiles(): string[] {
  // Resolved from THIS FILE, not from `process.cwd()`. Building it out of the working directory meant
  // the guard only ran from the repo root: invoked inside `packages/web` it looked for
  // `packages/web/packages/web/src` and failed with ENOENT, which reads like a broken guard rather than
  // a broken invocation.
  const root = fileURLToPath(new URL("../src", import.meta.url));
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
    }
  };
  walk(root);
  return out;
}

describe("palette token guard", () => {
  const keys = varBackedKeys();
  const pattern = bannedPattern(keys);

  it("reads the palette from the config", () => {
    // If this ever comes back empty the guard below passes vacuously, which is worse than no guard.
    expect(keys.length).toBeGreaterThan(20);
    expect(keys).toContain("primary");
    expect(keys).toContain("primary-soft");
    expect(keys).toContain("surface-2");
  });

  it("no opacity modifier is applied to a var-backed colour", () => {
    const offences: string[] = [];
    for (const file of sourceFiles()) {
      stripComments(readFileSync(file, "utf8"))
        .split("\n")
        .forEach((line, n) => {
          const hit = pattern.exec(line);
          if (!hit) return;
          const rel = file.slice(file.indexOf(join("packages", "web")));
          offences.push(
            `${rel}:${n + 1}  ${hit[2]}-${hit[3]}/…\n` +
              `    -> "${hit[2]}-${hit[3]}" is a var() reference, so the modifier emits no CSS at all.` +
              ` Add a --${hit[3]}-soft token to BOTH themes and write ${hit[2]}-[var(--${hit[3]}-soft)].`,
          );
        });
    }
    expect(offences, `\n${offences.join("\n\n")}\n`).toEqual([]);
  });

  it("actually catches what it is looking for", () => {
    // A guard nobody has seen fail is a guard nobody knows works.
    expect(pattern.test('className="bg-primary/10"')).toBe(true);
    expect(pattern.test('cn("rounded border border-primary/40 px-2")')).toBe(true);
    expect(pattern.test('"hover:bg-surface-2/60"')).toBe(true);
    expect(pattern.test('"sm:border-border-strong/50"')).toBe(true);

    // ...and leaves alone the fix, the un-modified token, and a real hex colour that CAN take alpha
    expect(pattern.test('className="bg-[var(--primary-soft)]"')).toBe(false);
    expect(pattern.test('className="bg-primary-soft"')).toBe(false);
    expect(pattern.test('className="bg-black/50 ring-white/10"')).toBe(false);
    // Not a colour utility: an aspect ratio, a fraction width, a leading value.
    expect(pattern.test('className="w-1/2 aspect-3/4"')).toBe(false);
  });
});
