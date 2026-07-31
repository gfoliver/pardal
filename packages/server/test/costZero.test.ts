import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The guard on the hard requirement: nothing about this project can ever escalate into a
 * paid bill, however much traffic or abuse it receives.
 *
 * That property does not come from watching the dashboard. It comes from staying on the
 * Cloudflare FREE plan, where exceeding a quota REFUSES the operation ("further
 * operations of that type will fail with an error") rather than metering it, and where
 * there is no documented path from traffic to a subscription. Volume produces an outage
 * until 00:00 UTC, not an invoice — the trade this project accepted deliberately.
 *
 * There is no platform switch for "never allow paid usage": budget alerts are explicitly
 * informational and cap nothing. So the enforcement has to be here, on the two things
 * that could actually open the door:
 *
 *  1. A binding to a product with no free tier, or one that requires a subscription
 *     checkout (R2 asks for a payment method even for its free tier).
 *  2. Subscribing to Workers Paid, which converts the hard cap into an unbounded bill —
 *     requests at $0.30/million with no spend limit anywhere. A test cannot detect that,
 *     so it is documented in the plan and NOT what this file checks.
 *
 * A build failure is the right severity: the failure mode is a bill, and the person who
 * adds the binding is not the person who reads the invoice.
 */

const configPath = join(import.meta.dirname, "..", "wrangler.jsonc");

/** Top-level keys that may appear. Everything else needs a conscious decision here. */
const ALLOWED_KEYS = new Set([
  "$schema",
  "name",
  "main",
  "compatibility_date",
  "compatibility_flags",
  "durable_objects",
  "migrations",
  "d1_databases",
  "ratelimits",
  "observability",
  "vars",
  "routes",
  "workers_dev",
  "triggers", // cron, free on this plan
]);

/**
 * Bindings that would or could cost money. Each is here because it either has no free
 * tier, or requires adding a payment method to enable at all.
 */
const FORBIDDEN_KEYS: Record<string, string> = {
  r2_buckets: "R2 requires a subscription checkout with a payment method, even for its free tier",
  ai: "Workers AI is billed per Neuron beyond a small daily allowance",
  vectorize: "Vectorize is billed per queried dimension",
  browser: "Browser Rendering is billed per hour beyond 10 minutes a day",
  hyperdrive: "Hyperdrive needs an origin database, which is not free",
  queues: "not needed, and it adds a quota to exhaust for no benefit here",
  images: "Images storage is Paid-only, and cf.image transforms could not be confirmed free",
  send_email: "sending email requires Workers Paid",
  logpush: "Logpush requires Workers Paid",
  analytics_engine_datasets: "not needed; observability already covers what is wanted",
  mtls_certificates: "not needed",
  dispatch_namespaces: "Workers for Platforms is an enterprise product",
  pipelines: "not free",
  vpc_services: "not free",
};

function readConfig(): Record<string, unknown> {
  const raw = readFileSync(configPath, "utf8");
  // Strip // comments and trailing commas: wrangler.jsonc allows both, JSON.parse does
  // not. Block comments are not used in the file.
  const stripped = raw
    .split("\n")
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ""))
    .join("\n")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(stripped) as Record<string, unknown>;
}

describe("cost-zero guard", () => {
  const config = readConfig();

  it("declares no binding that could cost money", () => {
    const offences = Object.keys(config)
      .filter((key) => key in FORBIDDEN_KEYS)
      .map((key) => `${key}: ${FORBIDDEN_KEYS[key]}`);
    expect(offences, `\n${offences.join("\n")}\n`).toEqual([]);
  });

  it("declares nothing unrecognised, so a new binding cannot slip in unexamined", () => {
    // A whitelist rather than a blacklist, because the blacklist can only ever cover the
    // products that existed when it was written.
    const unknown = Object.keys(config).filter((key) => !ALLOWED_KEYS.has(key));
    expect(
      unknown,
      `\nUnrecognised wrangler keys: ${unknown.join(", ")}.\nIf it is free and needed, add it to ALLOWED_KEYS with a note saying why.\n`,
    ).toEqual([]);
  });

  it("uses SQLite-backed Durable Objects, the only kind on the free plan", () => {
    const migrations = config.migrations as { new_sqlite_classes?: string[]; new_classes?: string[] }[];
    const classes = (config.durable_objects as { bindings: { class_name: string }[] }).bindings.map(
      (b) => b.class_name,
    );
    const sqliteClasses = migrations.flatMap((m) => m.new_sqlite_classes ?? []);
    // `new_classes` would create a KV-backed object: Paid-only, and since July 2026
    // unavailable for new namespaces on any plan.
    expect(migrations.flatMap((m) => m.new_classes ?? [])).toEqual([]);
    for (const className of classes) expect(sqliteClasses).toContain(className);
  });

  it("keeps rate limiting inside the Worker rather than on a zone", () => {
    // The WAF's free allowance is one rule and needs a custom domain. The binding needs
    // neither, costs nothing, and — because it runs inside the Worker — protects the D1
    // and Durable Object quotas instead of merely the origin.
    expect(config.ratelimits).toBeDefined();
  });

  it("leaves observability on, which cannot bill on the free plan", () => {
    // 200k log events a day, and exceeding it applies 1% sampling rather than a charge.
    expect((config.observability as { enabled: boolean }).enabled).toBe(true);
  });

  it("keeps no secret in the config file", () => {
    const vars = (config.vars ?? {}) as Record<string, string>;
    for (const key of Object.keys(vars)) {
      expect(key, `${key} looks like a secret; use \`wrangler secret put\``).not.toMatch(
        /KEY|SECRET|PEPPER|TOKEN|SEED|PASSWORD/i,
      );
    }
  });

  it("catches a forbidden binding when one is added", () => {
    // A guard nobody has seen fail is a guard nobody knows works.
    const tampered = { ...config, r2_buckets: [{ binding: "BUCKET" }] };
    const offences = Object.keys(tampered).filter((key) => key in FORBIDDEN_KEYS);
    expect(offences).toEqual(["r2_buckets"]);
  });
});
