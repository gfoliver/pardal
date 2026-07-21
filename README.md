# fut — Football Simulation

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
npm run sim              # simulate a single match (English, seed 42)
npm run league           # simulate a full league season and print the table

# CLI options
npx tsx packages/app-cli/src/main.ts --locale=pt-BR --seed=7
npx tsx packages/app-cli/src/main.ts --locale=en --seed=11 --knockout
npx tsx packages/app-cli/src/leagueMain.ts --locale=pt-BR --seed=1
```

Same seed → identical match; `--locale` only changes the narration, never the result.
