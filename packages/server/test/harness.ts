import { readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

/**
 * Runs the Worker in workerd — the real Cloudflare runtime — rather than against mocks.
 *
 * Worth the setup cost: the things most likely to be wrong here are D1's exact semantics
 * (what `meta.changes` reports, how a UNIQUE violation surfaces), Durable Object
 * single-threading, and WebCrypto's availability. A mock would agree with whatever I
 * assumed and prove nothing.
 */

const here = import.meta.dirname;
const repoRoot = join(here, "..", "..", "..");

let bundled: string | null = null;

async function bundle(): Promise<string> {
  if (bundled) return bundled;
  const result = await build({
    entryPoints: [join(here, "..", "src", "index.ts")],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    write: false,
    // This repo writes `.js` in specifiers that resolve to `.ts` sources (see the Vite
    // plugin that does the same for the web app); esbuild needs telling.
    resolveExtensions: [".ts", ".js"],
    plugins: [
      {
        name: "ts-source-resolver",
        setup(b) {
          b.onResolve({ filter: /^\.{1,2}\/.*\.js$/ }, (args) => ({
            path: join(args.resolveDir, args.path.replace(/\.js$/, ".ts")),
          }));
        },
      },
    ],
  });
  bundled = result.outputFiles[0]!.text;
  return bundled;
}

/**
 * The init type Miniflare itself accepts, read off `dispatchFetch`.
 *
 * Spelling it `RequestInit` was wrong in a way that only a typecheck could see: Miniflare wants its
 * own init carrying Cloudflare's `cf` properties, not the DOM one, and the mismatch then made both
 * callback parameters implicitly `any`. Deriving it means the harness cannot disagree with what it
 * calls.
 */
type DispatchInit = Parameters<Miniflare["dispatchFetch"]>[1];

export interface TestServer {
  fetch(path: string, init?: DispatchInit): Promise<Response>;
  json<T>(path: string, init?: DispatchInit): Promise<{ status: number; body: T }>;
  dispose(): Promise<void>;
  mf: Miniflare;
}

export async function startServer(): Promise<TestServer> {
  const script = await bundle();
  const schema = readFileSync(join(here, "..", "migrations", "0001_init.sql"), "utf8");

  const mf = new Miniflare({
    modules: true,
    script,
    modulesRoot: "/",
    compatibilityDate: "2026-07-01",
    d1Databases: { DB: "fut-test" },
    durableObjects: { RATE_LIMITER: { className: "RateLimiter", useSQLite: true } },
    bindings: {
      SALT_KEY: "test-salt-key",
      PEPPER: "test-pepper",
      TOKEN_KEY: "test-token-key",
      SERVER_SEED: "test-server-seed",
      ENVIRONMENT: "test",
    },
  });

  // Apply the migration by hand: this test drives Miniflare directly rather than through
  // wrangler, so nothing else is going to run it.
  const db = await mf.getD1Database("DB");
  for (const statement of splitStatements(schema)) {
    await db.exec(statement);
  }

  const base = "http://api.local";
  const server: TestServer = {
    fetch: (path, init) => mf.dispatchFetch(base + path, init) as unknown as Promise<Response>,
    async json<T>(path: string, init?: DispatchInit) {
      const response = await server.fetch(path, init);
      return { status: response.status, body: (await response.json()) as T };
    },
    dispose: () => mf.dispose(),
    mf,
  };
  return server;
}

/**
 * Split the schema into statements D1's `exec` will accept.
 *
 * Two constraints, and the second one is not obvious: `exec` is LINE-ORIENTED — it
 * splits its input on newlines and runs each line as a statement — so a multi-line
 * `CREATE TABLE` fails with "incomplete input" on its first line. Each statement is
 * therefore collapsed onto one line. Comments are dropped first, since a `--` comment
 * would swallow the rest of the collapsed line.
 *
 * Good enough because this schema has no semicolons or `--` inside string literals. A
 * real SQL parser would be a worse thing to own than that constraint.
 */
function splitStatements(sql: string): string[] {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0)
    .map((s) => `${s};`);
}

export function jsonPost(body: unknown, token?: string): DispatchInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  };
}

export { repoRoot };
