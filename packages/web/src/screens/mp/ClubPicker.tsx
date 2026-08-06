import { useMemo, useState } from "react";
import type { TeamData } from "@fut/competition";
import { Crest } from "../../components/ui/crest";
import { cn } from "../../lib/utils";
import type { LeagueChoice } from "../../lib/career/dataset";
import { clubStrength, type ClubStrength } from "../../lib/mp/friendly";

/**
 * Choosing who to play as: the competition first, then the club.
 *
 * Two levels because the dataset is a WORLD, not a league — Série A and Série B are both in it, and a
 * flat list of forty clubs makes the second division look like the bottom of the first. Naming the
 * competition first is also how anybody who has picked a team in a football game expects to be asked.
 *
 * WHAT EACH CARD SAYS, and why those numbers: the crest, the club's short name, and the strength of the
 * ELEVEN that would actually start — overall, then attack, midfield and defence. Not the whole squad's
 * average, which reads worse for a club with a deep bench of teenagers than for a thin one with the same
 * first team, and the question here is "who do I want to play as". They come from the same auto-pick the
 * friendly opens with, so the rating on the card is the rating of the side you get.
 *
 * No stars. A five-star scale would be this same number rounded into five buckets, and with forty clubs
 * inside one league's range it would put most of the country on three stars — the two-point gaps that
 * decide a match would vanish exactly where the choice is being made.
 */
export function ClubPicker({
  leagues,
  clubs,
  crests,
  onPick,
}: {
  readonly leagues: readonly LeagueChoice[];
  readonly clubs: readonly TeamData[];
  /** Club id → crest data URI, from the dataset's world. */
  readonly crests: Readonly<Record<string, string | undefined>>;
  onPick: (club: TeamData) => void;
}) {
  const [leagueId, setLeagueId] = useState(leagues[0]?.id ?? "");
  const byId = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);

  /*
   * Strength is computed for the clubs on screen and cached per league, because it auto-picks an eleven
   * per club and there are forty of them. Ordered strongest first: a picker sorted by whatever order the
   * emitter used makes the good sides feel randomly scattered.
   */
  const rows = useMemo(() => {
    const league = leagues.find((l) => l.id === leagueId);
    const ids = league?.clubIds ?? clubs.map((c) => c.id);
    return ids
      .map((id) => byId.get(id))
      .filter((c): c is TeamData => c !== undefined)
      .map((club) => ({ club, strength: clubStrength(club) }))
      .sort((a, b) => b.strength.xi - a.strength.xi || (a.club.shortName < b.club.shortName ? -1 : 1));
  }, [leagueId, leagues, clubs, byId]);

  return (
    <div className="flex flex-col gap-3">
      {leagues.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {leagues.map((l) => (
            <button
              key={l.id}
              onClick={() => setLeagueId(l.id)}
              aria-pressed={l.id === leagueId}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                l.id === leagueId
                  // `--primary-soft` rather than `bg-primary/10`: the palette is var-backed, so an
                  // opacity modifier emits no CSS at all and the selected league would look unselected.
                  // The repo has a guard for exactly this, and it caught it here.
                  ? "border-[var(--primary-line)] bg-[var(--primary-soft)] font-semibold text-fg"
                  : "border-line text-fg-muted hover:bg-surface-2",
              )}
            >
              {l.logo ? <Crest src={l.logo} size={18} /> : null}
              {l.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid max-h-[26rem] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
        {rows.map(({ club, strength }) => (
          <button
            key={club.id}
            onClick={() => onPick(club)}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-line bg-surface p-3 text-center transition-colors hover:border-primary hover:bg-surface-2"
          >
            <Crest src={crests[club.id]} code={club.shortName} size={44} />
            <span className="line-clamp-1 text-sm font-semibold">{club.shortName}</span>
            <span className="text-lg font-bold tabular-nums leading-none">{strength.xi}</span>
            <Lines strength={strength} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Attack, midfield and defence, in the order a pitch is drawn from the front. */
function Lines({ strength }: { strength: ClubStrength }) {
  const cells: [string, number][] = [
    ["ATA", strength.attack],
    ["MEI", strength.midfield],
    ["DEF", strength.defence],
  ];
  return (
    <span className="flex gap-2 text-[0.65rem] text-fg-faint">
      {cells.map(([label, value]) => (
        <span key={label} className="flex flex-col items-center leading-tight">
          <span>{label}</span>
          <span className="font-semibold tabular-nums text-fg-muted">{value}</span>
        </span>
      ))}
    </span>
  );
}
