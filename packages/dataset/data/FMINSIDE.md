# The FMInside attribute dump

`<dataset>/fminside.json` is the input to `dataset:ratings`. **It has a scraper now:**
`scrapeFmInside.ts`.

```bash
# see what the site returns for one club, and stop
npx tsx packages/dataset/data/scrapeFmInside.ts --dataset=packages/dataset/data/brasileirao-serie-b --probe
# one club, for iterating on the parser
npx tsx packages/dataset/data/scrapeFmInside.ts --dataset=packages/dataset/data/brasileirao-serie-b --only=Fortaleza
# the real pass
npx tsx packages/dataset/data/scrapeFmInside.ts --dataset=packages/dataset/data/brasileirao-serie-b
```

## Shape of the file

A flat array, one entry per player. `tm` is OUR club id, carried through so the resolver can do a
club-scoped name join instead of guessing between namesakes:

```json
[{ "tm": "10870", "uid": "19237947", "name": "Matheus Pereira",
   "attrs": { "Crossing": 11, "Passing": 15, "Decisions": 13, "...": 0 } }]
```

`attrs` holds FM's **native 1–20**, keyed by the source's own English labels. No mapping or scaling
happens here — `ratings/attributes.ts` owns that, so a change of mapping never requires re-scraping.

## How the site actually works — MEASURED 5 Aug 2026

This section replaces an earlier one written from a manual browser session. The site has moved since,
and a scraper written against those notes 404'd on its first request. Every claim below was verified
against the live site; where it contradicts what this file used to say, the old version was wrong.

| | |
|---|---|
| set the filter | `POST /resources/inc/ajax/update_filter.php` with `page=players&database_version=7&gender=-1&<fields>` |
| read the table | `GET /beheer/modules/players/resources/inc/frontend/generate-player-table.php?ajax_request=1[&view=…]` |

- **`page=players`.** The old note's `page=clubs` is the value for the CLUB list; using it for players
  silently returns defaults.
- **`database_version=7`** is FM 26, per the select on `/players`.
- **The session cookie is load-bearing.** The filter POST and the table GET are two requests and the
  cookie is the only thing joining them. Without a cookie jar every GET returns the unfiltered
  547,000-player default — which looks like a successful scrape of the wrong club.
- **`club` and `league` are TEXT inputs matching on NAME.** The club ids this file used to list
  (Coritiba 104776, Chapecoense 301304, …) are not what the player filter takes: passing one registers
  the filter and returns "No players found". `club=Coritiba` returns 59. So club ids are not needed at
  all — and are not discoverable that way either, since `/players?search=` and `/clubs?search=` do not
  search.
- **Rows are `<ul class="player">`,** each attribute a `<li class="stat">`. Not a `<table>`.
- **The `value_NN` classes are GONE, and so is the reason to avoid the cell text.** A stat is now
  `<li class="stat"><span class="stat_color decent">13</span></li>` and that 13 IS the native 1–20.
  Verified against a known row (Mbappé 13/18/18/18/9/15, with `worldclass`=18 and `poor`=9 — impossible
  on a 0–99 scale). The old note's warning applied to a rendering that no longer exists.
- **The 47 attributes are split across FOUR views** — `Technical`, `Mental`, `Physical`, `Goalkeeper` —
  selected by `&view=`. The default `General` view carries no attributes; it carries the CLUB, which is
  what makes club ids unnecessary. Join the views by player uid, not by row position: their sort order
  differs.
- **Attributes exist only on a view's FIRST page.** `loadmore=true` advances a server-side cursor, but
  its appended rows always come back in the General rendering with no stat cells — measured both with
  and without `&view=` on the loadmore call, and every view gave 115 rows of which exactly the first 50
  carried attributes. **This is the real shape of the bug that once cost 111 players**; the earlier
  diagnosis ("append `&loadmore=true` and page through") produced a dump that looked complete.
- **So the unit of work is a filter matching ≤ 50 players.** The scraper narrows by age and HALVES the
  range whenever a slice overflows, which needs no per-club tuning — Fortaleza's under-21s alone come
  back as 61 — and cannot truncate silently: a slice that still overflows at a single year throws.
- `<span class="num_results" title="59">` gives the expected count, so coverage is checked rather than
  assumed.

## Two guards that must stay

The scraper aborts rather than writing a smaller dump, in both cases:

1. A club that matched no rows of that name, listing the club names it did see. Loose search, strict
   keep: `club=Fortaleza` also returns Fortaleza CEIF of Colombia, and accepting a shared token once put
   115 players into a 28-man squad, so the keep rule is containment only.
2. Any player whose four views produced no attributes.

## After refreshing

```bash
npm run dataset:ratings -- --dataset=packages/dataset/data/brasileirao-serie-b \
  --from=packages/dataset/data/brasileirao-serie-b/fminside.json
npm run dataset:rebuild:pyramid
npm run dataset:season          # the aggregates a ratings change actually moves
```

Goalkeepers carry a different label set from outfielders (no Crossing/Finishing/Tackling/Marking; they
have Reflexes/Handling/Command of Area/One on Ones instead) — `REQUIRED_LABELS` in
`ratings/attributes.ts` encodes both, so a complete keeper page is not mistaken for a bad scrape.
