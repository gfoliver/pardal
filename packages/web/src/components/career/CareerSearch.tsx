import { useMemo } from "react";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../ui/badge";
import { CommandPalette, type CommandItem } from "../ui/command";
import { Crest } from "../ui/crest";
import { PlayerPhoto } from "../ui/player-photo";
import { buildIndex, searchIndex } from "../../lib/career/search";
import { groupBadge, useLabels } from "../../lib/labels";
import type { ScreenId } from "../../layout/Shell";

/**
 * Find anyone in the save by name, from anywhere.
 *
 * Six hundred and seventy players across twenty clubs, and reaching one used to mean knowing which
 * screen listed him and filtering there — fine for your own squad, useless for "what was that Grêmio
 * centre-back called". Every screen's search narrows the list it is already showing; this one crosses
 * them.
 *
 * The matching rule is the SAME one the tables use: fold the accents, then every whitespace-separated
 * word must appear somewhere. So "joao gre" finds the João at Grêmio, and an ASCII "eve" still finds
 * "Éverton".
 */

/** With nothing typed: your own squad, which is the list you look up most. */
const IDLE_SHOWN = 8;

export function CareerSearch({ open, onOpenChange, text, onText, onNavigate }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Held by the caller so closing forgets it — a stale query is not a starting point. */
  text: string;
  onText: (text: string) => void;
  onNavigate: (screen: ScreenId, param?: string) => void;
}) {
  const { t } = useApp();
  const { career, version } = useCareer();
  const { shortPos, posName } = useLabels();

  /*
   * Built once per career mutation, not per keystroke. Six hundred and ninety rows of pre-folded text is
   * cheap to scan and wasteful to rebuild while somebody types.
   */
  const index = useMemo(() => {
    void version; // a signing moves a player between clubs, so the index follows mutations
    return buildIndex(career?.directory() ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [career, version]);

  const items = useMemo<CommandItem[]>(() => {
    return searchIndex(index, text, { idleShown: IDLE_SHOWN }).map(({ entry }) => ({
      id: `${entry.kind}-${entry.id}`,
      group: entry.kind === "club" ? t.clubsGroup : entry.isMine ? t.mySquadGroup : t.playersGroup,
      onSelect: () => onNavigate(entry.kind === "club" ? "club" : "player", entry.id),
      render:
        entry.kind === "club" ? (
          <>
            <Crest src={entry.crest} code={entry.clubShort ?? entry.name} size={22} />
            <span className="min-w-0 flex-1 truncate font-medium text-fg">{entry.name}</span>
            <span className="shrink-0 text-2xs text-fg-faint">{entry.clubShort}</span>
          </>
        ) : (
          <>
            <PlayerPhoto src={entry.photo} alt={entry.name} size={22} />
            <span className="min-w-0 flex-1 truncate font-medium text-fg">{entry.name}</span>
            {entry.position && (
              <Badge variant={groupBadge(entry.position)} title={posName(entry.position)}>
                {shortPos(entry.position)}
              </Badge>
            )}
            {/* The club, because two players share a name far more often than a name and a club do. */}
            <span className="w-10 shrink-0 text-right text-2xs text-fg-faint">{entry.clubShort}</span>
          </>
        ),
    }));
  }, [index, text, t, shortPos, posName, onNavigate]);

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      placeholder={t.searchEverything}
      empty={t.noMatches}
      text={text}
      onText={onText}
      items={items}
    />
  );
}
