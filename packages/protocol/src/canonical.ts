/**
 * Canonical JSON: one value, exactly one string, on every runtime.
 *
 * Every hash in this protocol is taken over the output of this function, so it has to
 * be a total function with no room for a runtime, a version or a code path to choose
 * differently. `JSON.stringify` is not that: object key order follows insertion
 * order, so the same lineup built by two different code paths serialises differently
 * and the two sides accuse each other of cheating over a difference that does not
 * exist.
 *
 * The rules, and the failure each one prevents:
 *
 *  - **Object keys sorted by UTF-16 code unit.** Never `localeCompare`, whose ICU
 *    collation depends on the runtime's locale data (this exact bug was found
 *    deciding a league champion elsewhere in this repo).
 *  - **Arrays keep their order.** Order is DATA here: the starting XI's order and the
 *    bench's order both change a match's outcome, so sorting them would be silently
 *    destructive.
 *  - **`undefined`, functions and symbols are rejected, not skipped.** `stringify`
 *    drops them from objects and turns them into `null` inside arrays — two different
 *    silent mutations. If a field is optional, its absence must be expressed by the
 *    key being absent, and that has to be the caller's explicit decision.
 *  - **`NaN` and `Infinity` are rejected.** `stringify` writes them as `null`, which
 *    round-trips to a number that was never there.
 *  - **No `toJSON` is consulted.** A class deciding its own wire format is exactly the
 *    kind of hidden coupling that breaks when the class changes.
 *  - **Cycles are rejected** with the path, rather than throwing an opaque
 *    `TypeError` from deep inside the recursion.
 */

export class CanonicalJsonError extends Error {
  constructor(
    message: string,
    /** Where in the value the problem is, e.g. `home.startingXi[3]`. */
    readonly path: string,
  ) {
    super(`${message} at ${path || "<root>"}`);
    this.name = "CanonicalJsonError";
  }
}

/** Values this protocol is willing to hash. */
export type Canonical =
  | string
  | number
  | boolean
  | null
  | readonly Canonical[]
  | { readonly [key: string]: Canonical };

const byCodepoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function canonicalJson(value: unknown): string {
  const seen = new Set<object>();

  const write = (v: unknown, path: string): string => {
    if (v === null) return "null";

    switch (typeof v) {
      case "boolean":
        return v ? "true" : "false";
      case "number":
        if (!Number.isFinite(v)) {
          throw new CanonicalJsonError(`${String(v)} is not representable in JSON`, path);
        }
        // JSON.stringify on a finite number is the shortest round-tripping decimal
        // and is specified exactly, so it is safe to lean on here.
        return JSON.stringify(v);
      case "string":
        return JSON.stringify(v);
      case "undefined":
        throw new CanonicalJsonError("undefined would be silently dropped", path);
      case "function":
        throw new CanonicalJsonError("a function cannot be hashed", path);
      case "symbol":
        throw new CanonicalJsonError("a symbol cannot be hashed", path);
      case "bigint":
        throw new CanonicalJsonError("bigint has no JSON form; send it as a string", path);
      default:
        break;
    }

    const obj = v as object;
    if (seen.has(obj)) throw new CanonicalJsonError("cycle", path);
    seen.add(obj);
    try {
      if (Array.isArray(obj)) {
        return `[${obj.map((item, i) => write(item, `${path}[${i}]`)).join(",")}]`;
      }
      // Anything exotic (Map, Set, Date, a class instance with behaviour) is refused
      // rather than guessed at. Convert it to plain data at the boundary, where the
      // intent is visible.
      const proto = Object.getPrototypeOf(obj) as unknown;
      if (proto !== Object.prototype && proto !== null) {
        throw new CanonicalJsonError(
          `only plain objects can be hashed, got ${obj.constructor?.name ?? "an exotic object"}`,
          path,
        );
      }
      const keys = Object.keys(obj as Record<string, unknown>).sort(byCodepoint);
      const parts = keys.map((key) => {
        const child = (obj as Record<string, unknown>)[key];
        return `${JSON.stringify(key)}:${write(child, path ? `${path}.${key}` : key)}`;
      });
      return `{${parts.join(",")}}`;
    } finally {
      seen.delete(obj);
    }
  };

  return write(value, "");
}
