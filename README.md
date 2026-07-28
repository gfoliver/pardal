# Pardal — Football Simulation

A football (soccer) simulation game inspired by **Brasfoot** (lightweight, tactical)
and **Football Manager** (deep match engine). Built to be published online for free,
grown gradually, quality over scale.

The full design study & roadmap lives in
`~/.claude/plans/fa-a-um-estudo-de-modular-stream.md`.

## MVP status (Phase 1)

A working, deterministic, isolated **match engine** that simulates one match between
two teams and returns a structured `MatchResult` (score + event timeline + stats),
narratable in **English and Brazilian Portuguese**.

Implemented:

- State-driven, tick-based, decision-based engine (no "team A × team B × rng").
- Detailed positions (centre-back, full-back, wing-back, defensive/central/attacking
  midfielder, winger, striker) over a coarse GK/DEF/MID/FWD grouping.
- Position-weighted overall (finishing matters for strikers, marking for defenders,
  reflexes for keepers) and versatile players; playing out of position applies a
  small attribute debuff.
- Per-player positioning across a zone grid; marking/pressure context.
- Two-level tactics: team instructions (mentality, tempo, pressing, line height,
  width, directness) **+ per-player roles** (target man, false 9, wing-back,
  deep-lying playmaker, winger, inside forward, wide midfielder, …), with a
  **simple mode** (auto default roles)
  and an **advanced mode** (full control).
- Fatigue, **injuries** (forced substitution, or a man down if none available),
  assists and woodwork.
- Infallible, attribute-free `Referee`: fouls, cards (2nd yellow → red), penalties,
  offside, corners.
- In-match coaching (AI): tactic changes (with an assimilation delay) and
  substitutions bounded by **injected** `SubstitutionRules` (e.g. Brasileirão 5/3).
- Injected competition rules (`MatchRules`/`TieContext`): extra time, penalty
  shootout, two-legged aggregate.
- Situational objective (chase vs protect) using the **isolated score in a league**
  but the **aggregate in a knockout tie**.
- Fully seeded → reproducible; fully locale-agnostic (i18n renders, engine doesn't).
- Data layer: load teams/players from **JSON**, run a full **league season**
  (round-robin fixtures + standings table), all deterministic, with **save/load**
  (serialization + a storage-agnostic `SeasonStore`).

## Architecture

Monorepo (npm workspaces). Dependencies point toward the pure core:

```
packages/
  domain/       # Person→Player→Goalkeeper, Coach, Staff, Referee; Tactics/Role; rules VOs
  engine/       # PURE match engine (no I/O/UI/DB): MatchSimulator + all resolvers
  competition/  # data loader (JSON→domain), league fixtures, standings, season save/load
  i18n/         # en / pt-BR catalogs — presentation only; engine never imports it
  app-cli/      # terminal runners + fictional fixtures/dataset (reused by tests)
```

The engine is the same logic in a browser (free hosting) and, later, a Cloudflare
Worker (multiplayer) — write the simulation once.

## Commands

```bash
npm install
npm test                 # 29 tests: determinism, golden, stats, rules, subs, i18n
npm run typecheck        # tsc -b across all packages
npm run dev              # the web app on :5173
npm run build            # typecheck, then the production bundle
npm run sim              # simulate a single match (English, seed 42)
npm run league           # simulate a full league season and print the table

# CLI options
npx tsx packages/app-cli/src/main.ts --locale=pt-BR --seed=7
npx tsx packages/app-cli/src/main.ts --locale=en --seed=11 --knockout
npx tsx packages/app-cli/src/leagueMain.ts --locale=pt-BR --seed=1
```

Same seed → identical match; `--locale` only changes the narration, never the result.

## Datasets

A real-world dataset is assembled on demand by two **independent** commands, each
owning one file. Neither writes the other's, so re-scraping squads can't discard
enrichment and re-enriching can't stale the squads.

| Command | Writes | Reads | Network |
|---|---|---|---|
| `dataset:build` | `raw.json` + artifact | `enrichment.json` if present | Transfermarkt |
| `dataset:build --from-raw=…` | artifact | both layers | none |
| `dataset:enrich` | `enrichment.json` + artifact | both layers | TheSportsDB |

```bash
# squads, market values, stats
npm run dataset:build -- --competition=BRA1 --season=2025 --out=./packages/dataset/data

# identity: photos, club colours, stadium, ISO birthdates — incremental and resumable
npm run dataset:enrich -- --dataset=packages/dataset/data/brasileirao-serie-a --emit-to=packages/web/src/lib/career/datasets
```

`enrich` only queries what is still missing: a player already matched is skipped,
and one the source genuinely doesn't have is remembered as a miss. Re-run it
freely. Useful flags: `--max=<n>` to work in chunks, `--deep` to follow name
matches up with height/weight, `--retry-misses`, `--no-emit`.

```bash
# recompute the artifact offline from both layers (after changing the formulas)
npm run dataset:rebuild
```

Data comes from Transfermarkt (community API) and TheSportsDB; both are credited
in the artifact's `manifest.attribution`. Personal, non-commercial use.

## Deploying

The web app is a **static site**: no backend, no environment variables, no
database. Saves live in the player's own IndexedDB and the dataset ships inside
the bundle, so the whole thing is `dist/` on a CDN.

It runs on Cloudflare Pages with the Git integration — a push to `main` builds
and deploys. Project settings:

| Setting | Value |
|---|---|
| Framework preset | None |
| Root directory | `/` (the monorepo root — npm workspaces resolve `@fut/*`) |
| Build command | `npm run build` |
| Build output directory | `packages/web/dist` |

`.node-version` pins Node 22 for the build image; the root `engines` field
requires ≥20 and the Pages default has historically lagged.

Two files in `packages/web/public/` are copied verbatim to the site root and do
the rest:

- **`_headers`** — one immutable year for `/assets/*` (Vite fingerprints those
  filenames, so a changed file always gets a changed URL) and revalidate-always
  for `index.html`, which is the unhashed entry point that names them.
- **`_redirects`** — a fallback to `index.html`. Screens are hash routes, so
  this is only there to catch a stray link rather than serve a 404 page.

Nothing else is required: the build produces ~560 files and under 7 MB, well
inside the 20,000-file and 25 MiB-per-file limits.

Known gaps, none of them blocking: the favicon is SVG-only (no `.ico`/PNG
fallback for older Safari), there is no `og:image` because social scrapers
mostly ignore SVG, and the main chunk carries the dataset JSON inline — around
390 kB gzipped on first load, which a dynamic `import()` of the dataset would
roughly halve.
