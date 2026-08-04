# Refreshing the FMInside attribute dump

`brasileirao-serie-a/fminside.json` is the input to `dataset:ratings`. Unlike `raw.json`, which
`scrapeBrasileirao.ts` regenerates, **this file has no committed scraper** — it was collected
through a browser session, because the site's filter is server-side session state and not a URL.
This note is what makes it reproducible. Writing the scraper is still open work.

## Shape of the file

A flat array, one entry per player. `tm` is OUR club id, carried through so the resolver can do a
club-scoped name join instead of guessing between namesakes:

```json
[{ "tm": "221", "uid": "76053940", "name": "Johan Carbonero",
   "attrs": { "Pace": 15, "Passing": 12, "Decisions": 11, "...": 0 } }]
```

`attrs` holds FM's **native 1–20**, keyed by the source's own English labels, exactly as published.
No mapping or scaling happens here — `ratings/attributes.ts` owns that, so a change of mapping never
requires re-scraping.

## The two things that are not obvious

**1. The filter ignores query parameters.** Setting `?club=326` or `?page=2` on `/players` does
nothing; the list is driven by session state. Discovered by monkey-patching `window.fetch` and
`XMLHttpRequest` on the players page and watching what the UI actually sent:

```
POST /resources/inc/ajax/update_filter.php
     page=clubs&database_version=7&gender=-1&<filter fields>
GET  /resources/inc/ajax/generate-player-table.php?ajax_request=1
```

So: POST the filter to set session state, then GET the table. `page=1` and `gender=male` are both
wrong and silently return the defaults.

**2. Every club truncates at 50 rows without `loadmore`.** Append `&loadmore=true` to the table GET
and page through. This one silently cost 111 players — coverage read 64% until it was found, and
each squad simply stopped at 50 with no error.

Also worth knowing: `/players?search=` and `/clubs?search=` do **not** search. They return the
default top-50 list, so grepping the response for a name gives a false positive whenever that name
happens to be in the default list. Club ids were found by probing the id range instead (the
Brazilian block is roughly 311–340, with strays: Coritiba 104776, Chapecoense 301304, Mirassol
301344, Athletico 107206).

## Collecting it

Per club: POST the filter for that club, then GET the table with `&loadmore=true` until a page comes
back short. Parse each row for the player id, the name, and the attribute cells — the raw 1–20 is in
the element's `value_NN` class (`value_12` = 12), while the cell TEXT is the site's own 0–99
normalisation, which is not what we want. Accumulate and write the array above.

Two practical limits: a browser `javascript_tool` call times out at 30 s, so batch 100–110 parallel
fetches per call and accumulate in `localStorage` between calls; and a batch that times out may
still have landed its writes, so make the accumulation idempotent by player id.

## After refreshing

```bash
npm run dataset:ratings -- --dataset=packages/dataset/data/brasileirao-serie-a \
  --from=packages/dataset/data/brasileirao-serie-a/fminside.json
npm run dataset:rebuild
npm run dataset:season          # the aggregates a ratings change actually moves
```

Goalkeepers carry a different label set from outfielders (no Crossing/Finishing/Tackling/Marking;
they have Reflexes/Handling/Command of Area/One on Ones instead) — `REQUIRED_LABELS` in
`ratings/attributes.ts` encodes both, so a complete keeper page is not mistaken for a bad scrape.
