import { useMemo } from "react";
import type { PlayerGameLine } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { Badge } from "../ui/badge";
import { DataGrid, FilterBar, runQuery, useGridState, type FieldSpec } from "../data";
import { useFormat, type Formatter } from "../../lib/format";
import { tierColor } from "../../lib/ratings";
import type { UIStrings } from "../../i18n/strings";

/**
 * Every game a player has played, as a list you can ask questions of.
 *
 * A season is thirty-eight games. This used to be the last FIVE, three columns wide, in whatever order
 * the season happened — which answers "how is he doing right now" and nothing else. "How does he play
 * away from home", "has he been over seven since October", "which games did he score in" are ordinary
 * questions about a player, and every one of them was unanswerable from a screen whose view model had
 * already thrown the data away.
 *
 * Its own file, and its own exported spec list, because the two rules worth getting right here are pure
 * and belong under test: a date must sort as a date, and won/drawn/lost must be filterable.
 */

/**
 * The columns, given the strings and the formatter.
 *
 * Takes them as arguments rather than reading the hooks, so the field logic can be tested without
 * mounting anything.
 */
export function matchLogSpecs(t: UIStrings, fmt: Formatter): FieldSpec<PlayerGameLine>[] {
  return [
    {
      id: "opponent",
      label: t.opponent,
      kind: "text",
      required: true,
      width: 110,
      value: (g) => g.opponentShort,
      search: (g) => g.competitionName,
      // The "@" carries the venue at a glance, so the venue column can stay off by default and still be
      // there to filter on.
      cell: (g) => (
        <span className="font-medium text-fg">
          {g.home ? "" : <span className="text-fg-faint">@</span>}
          {g.opponentShort}
        </span>
      ),
    },
    {
      id: "date",
      label: t.matchDate,
      kind: "number",
      width: 92,
      /*
       * Sorted on a packed y/m/d number, not on the printed string.
       *
       * "08 de ago." sorts before "12 de jul." alphabetically, which would put August before July — the
       * exact class of bug the `value`/`cell` split exists to prevent. A game whose fixture cannot be
       * resolved has no date and sinks at both ends rather than pretending to be day zero.
       */
      value: (g) => (g.date ? g.date.year * 10000 + g.date.month * 100 + g.date.day : undefined),
      cell: (g) => (g.date ? <span className="tabular-nums text-fg-muted">{fmt.civil(g.date)}</span> : <span className="text-fg-faint">—</span>),
    },
    {
      id: "venue",
      label: t.venue,
      kind: "enum",
      hiddenByDefault: true,
      width: 76,
      value: (g) => (g.home ? "home" : "away"),
      options: () => [
        { value: "home", label: t.home },
        { value: "away", label: t.away },
      ],
      cell: (g) => <span className="text-xs text-fg-muted">{g.home ? t.home : t.away}</span>,
    },
    {
      id: "result",
      label: t.result,
      kind: "text",
      align: "center",
      width: 72,
      value: (g) => `${g.goalsFor}–${g.goalsAgainst}`,
      cell: (g) => <span className="tabular-nums">{g.goalsFor}–{g.goalsAgainst}</span>,
    },
    {
      id: "outcome",
      label: t.outcome,
      kind: "enum",
      align: "center",
      width: 72,
      // Won/drawn/lost as its own field, because "his defeats" is a question and a score string is not
      // something anyone can filter for.
      value: (g) => (g.goalsFor > g.goalsAgainst ? "W" : g.goalsFor === g.goalsAgainst ? "D" : "L"),
      options: () => [
        { value: "W", label: t.won },
        { value: "D", label: t.drawn },
        { value: "L", label: t.lost },
      ],
      cell: (g) => {
        const w = g.goalsFor > g.goalsAgainst;
        const d = g.goalsFor === g.goalsAgainst;
        return <Badge variant={w ? "primary" : d ? "muted" : "danger"}>{w ? t.won : d ? t.drawn : t.lost}</Badge>;
      },
    },
    {
      id: "goals",
      label: t.goals[0]!,
      longLabel: t.goals,
      kind: "number",
      align: "center",
      width: 56,
      better: "higher",
      value: (g) => g.goals,
    },
    {
      id: "assists",
      label: t.assists[0]!,
      longLabel: t.assists,
      kind: "number",
      align: "center",
      width: 56,
      better: "higher",
      value: (g) => g.assists,
    },
    {
      id: "rating",
      label: t.rating,
      kind: "number",
      align: "center",
      width: 72,
      better: "higher",
      value: (g) => g.rating,
      // Tier-coloured on the same scale as everywhere else — a 7.8 should read as the same colour of
      // good whether it is a match rating here or an attribute on the radar.
      cell: (g) => <span className="font-semibold tabular-nums" style={{ color: tierColor(g.rating * 10) }}>{g.rating.toFixed(1)}</span>,
    },
    {
      id: "competition",
      label: t.league,
      kind: "enum",
      hiddenByDefault: true,
      width: 130,
      value: (g) => g.competitionName,
    },
  ];
}

export function MatchLog({ games }: { games: readonly PlayerGameLine[] }) {
  const { t } = useApp();
  const fmt = useFormat();
  const specs = useMemo(() => matchLogSpecs(t, fmt), [t, fmt]);

  // No default sort: the façade hands them over newest first, which is the order a form question is
  // asked in, and a stored sort would be one nobody chose.
  const state = useGridState("player.games", specs);
  const shown = useMemo(() => runQuery(games, specs, state.query), [games, specs, state.query]);

  return (
    <>
      <FilterBar specs={specs} rows={games} state={state} shown={shown.length} total={games.length} />
      {/* Capped so a full season does not push the rest of the profile off the screen; the grid scrolls
          inside its own box. Keyed by date, opponent and venue, since a game carries no id of its own. */}
      <DataGrid
        rows={shown}
        state={state}
        rowKey={(g) => `${g.date?.year ?? 0}-${g.date?.month ?? 0}-${g.date?.day ?? 0}-${g.opponentShort}-${g.home ? "h" : "a"}`}
        className="max-h-[22rem]"
      />
    </>
  );
}
