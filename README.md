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

A real-world dataset is assembled on demand by **independent** commands, each
owning one file. No command writes another's, so re-scraping squads can't discard
enrichment, re-enriching can't stale the squads, and neither touches the ratings.

| Command | Writes | Reads | Network |
|---|---|---|---|
| `dataset:build` | `raw.json` + artifact | the other layers if present | Transfermarkt |
| `dataset:build --from-raw=…` | artifact | all layers | none |
| `dataset:enrich` | `enrichment.json` + artifact | all layers | TheSportsDB |
| `dataset:ratings` | `ratings.json` + artifact | `raw.json` + a scrape dump | none |
| `scrapeCoaches.ts` | `coaches.json` | `raw.json` | Transfermarkt |

```bash
# squads, market values, stats
npm run dataset:build -- --competition=BRA1 --season=2025 --out=./packages/dataset/data

# identity: photos, club colours, stadium, ISO birthdates — incremental and resumable
npm run dataset:enrich -- --dataset=packages/dataset/data/brasileirao-serie-a --no-emit

# attributes: match a scraped FMInside dump onto our players
npm run dataset:ratings -- --dataset=packages/dataset/data/brasileirao-serie-a --from=<dump.json>

# head coaches, from Transfermarkt's staff pages — resumable, one request per club
npm run dataset:coaches -- --dataset=packages/dataset/data/brasileirao-serie-a
```

The coach is not on the club profile page: that carries squad size, average age and stadium, and no
manager at all. `/mitarbeiter/verein/{id}` is where the staff live, and the role is read from the row
rather than assumed from the order, because every club also lists two or three assistants.

`enrich` only queries what is still missing: a player already matched is skipped,
and one the source genuinely doesn't have is remembered as a miss. Re-run it
freely. Useful flags: `--max=<n>` to work in chunks, `--deep` to follow name
matches up with height/weight, `--retry-misses`, `--no-emit`.

A per-division command writes that division's own layers; only the pyramid
rebuild emits what the app ships, because the artifact spans both divisions —
its backfill is calibrated against every rated player in the world, so emitting
one division alone would place its unrated players against the wrong population.
That is why `--no-emit` is right above.

```bash
# recompute the shipped artifact offline from every layer, both divisions
npm run dataset:rebuild
```

### Player attributes

Where a player is in the ratings layer, his 24 attributes come from a community
Football Manager database (FMInside) via a **1:1 label map** — FM's `Pace` is our
`pace`, and so on — so there is no blending and no blending bias to correct.
Where he isn't (~19%, mostly teenagers and late signings) the inferred guess
stands, rescaled onto the rated population and capped at its mean: being absent
from a ratings database is not a claim to be elite.

Both halves are then placed on **our** scale, not the source's. FM's 1–20 is
global — its 20 is the best player in the world — so a straight stretch puts a
mid-tier league near 54 and reads it as a league of reserves. `SCALE_ANCHORS` in
`ratings/attributes.ts` maps it through three anchors (FM 11 → 65, the engine's
operating point; 15 → 85, as good as a mid-tier league gets; 20 → 95, leaving the
top of the scale unspent). The curve BENDS at the middle anchor because one slope
cannot serve both ends: the slope that gets the league's best striker past 80 also
puts its one former-world-best at 96.

The map is fixed, not fitted to each league's own mean. Fitting would force every
competition to the same centre, so the Brasileirão and the Premier League would
come out equally strong and a move between them would mean nothing.

```bash
# what the dataset actually plays like — a full season on the real squads
npm run dataset:season
# how much independent information the attributes carry
npm run dataset:independence -- <league.json>
# top-20 spread per position — the axis a scale change moves most
npm run dataset:spread -- <a.json> <b.json>
```

`measure` and `balance:*` use synthetic even teams, so they are blind to the
dataset; `datasetSeason` is the one that isn't. Run it when ratings change.

Data comes from Transfermarkt (community API), TheSportsDB and FMInside; all
three are credited in the artifact's `manifest.attribution`. Personal,
non-commercial use.

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
