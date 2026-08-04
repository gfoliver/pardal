import { useMemo } from "react";
import { Career, type ClubDetailView, type FinanceSummary, type SquadEntry, type TacticsView } from "@fut/career";
import type { ClubKit } from "@fut/competition";
import type { Dataset } from "./dataset";

/**
 * Every club in a dataset as it would be on day one, for the new-career screen.
 *
 * Built by creating ONE real career and reading it, rather than by computing summaries here. That is
 * the whole design: a club's budget is `seasonBudget(careerSeed, clubId, payroll)` and its XI is
 * whatever `autoPickLineup` chose at career creation, so any second implementation would be a
 * different set of numbers shown under the same labels — a preview that lies about the save it is
 * previewing.
 *
 * One career for all twenty clubs, not one per club. `annualBudget` depends on the career seed and
 * the club id but not on who you manage, `autoPickLineup` runs for every club at creation, and
 * `squad()` reads exact overalls for any club rather than fogging rivals — so a single build answers
 * for the whole league, and browsing the list costs nothing.
 *
 * The SEED is threaded in for the same reason: the board's appetite is derived from it, so a preview
 * built on a throwaway seed would show a budget the career then contradicts. `Start` draws it once
 * and hands it to both this and `newGame`, which makes these the actual opening figures of the save.
 */
export interface ClubPreview {
  readonly clubId: string;
  readonly shortName: string;
  readonly crest?: string;
  /**
   * Mean overall of the ELEVEN who would start, which is the number that belongs beside a club in
   * a "who do I want to manage" list.
   *
   * Not `detail.level`: that averages the whole squad, so a club with a deep bench of teenagers
   * reads worse than a thin one with the same first team. Both were on screen at once — the list
   * said Flamengo 80 and the panel said 76 — which is how this came to be one number.
   */
  readonly xiRating: number;
  readonly detail: ClubDetailView;
  readonly finances: FinanceSummary;
  readonly tactics: TacticsView | null;
  readonly squad: readonly SquadEntry[];
  readonly kit?: ClubKit;
}

/** Every club, strongest first. */
export function useDatasetPreview(dataset: Dataset, seed: number): readonly ClubPreview[] {
  return useMemo(() => {
    const league = dataset.league();
    // `managedClubId` has to be someone; it changes only `detail.isMine`, which nothing here reads.
    const first = league.teams[0]!.id;
    const career = Career.create(league, { leagueId: dataset.id, managedClubId: first, seed, world: dataset.world() });
    const snapshot = career.snapshot();

    const out: ClubPreview[] = [];
    for (const team of league.teams) {
      // Explicitly unfogged: you are picking a club to manage from outside the world, so there is
      // nothing observed yet and nothing to withhold. Every other caller gets the scouting rules.
      const detail = career.clubDetail(team.id, { fog: false });
      const finances = career.finances(team.id);
      if (!detail || !finances) continue;
      const tactics = career.tacticsView(team.id);
      const xi = (tactics?.slots ?? []).map((s) => s.player?.overall).filter((v): v is number => v !== undefined);
      const squad = career.squad(team.id);
      // Averaged from the squad we already hold rather than from `detail.level`, which is now absent
      // for a club whose players we have not watched. It cannot be absent HERE — this asks for the
      // unfogged view — but reading it would make the fallback depend on that, and a mean over the
      // real squad is the same number anyway.
      const mean = (xs: readonly number[]) => (xs.length > 0 ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
      out.push({
        clubId: team.id,
        shortName: detail.shortName,
        crest: detail.crest,
        xiRating: xi.length > 0 ? mean(xi) : mean(squad.map((e) => e.overall)),
        detail,
        finances,
        tactics,
        squad,
        kit: snapshot.clubs[team.id]?.kits?.home,
      });
    }
    return out.sort((a, b) => b.xiRating - a.xiRating || (a.shortName < b.shortName ? -1 : 1));
  }, [dataset, seed]);
}
