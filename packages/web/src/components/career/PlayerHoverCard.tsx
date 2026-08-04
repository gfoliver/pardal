import type { ReactNode } from "react";
import type { SquadEntry } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { Badge } from "../ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { Overall } from "../ui/game";
import { PlayerPhoto } from "../ui/player-photo";
import { SIX_ATTRS, groupBadge, useLabels } from "../../lib/labels";
import { tierColor } from "../../lib/ratings";

/**
 * The six attributes, on hover, without leaving the list.
 *
 * They are the reason this exists. The squad table ships them HIDDEN — the default layout is the one a
 * manager wants on opening the screen, not every fact we hold — so answering "is he quick?" meant either
 * turning on six columns he does not usually want or opening the profile and coming back. A card on the
 * name answers it and puts the list back the moment the pointer leaves.
 *
 * Our own squad only, and that is why there is no fog anywhere in here: confidence in our own players is
 * total, so every number is exact. Pointed at a rival it would need the estimate components instead, and
 * saying so is cheaper than a `?? 0` that quietly draws a zero.
 *
 * Hover is an ENHANCEMENT: the child stays the link it was, so a tap still opens the profile.
 */
export function PlayerHoverCard({ player, children }: { player: SquadEntry; children: ReactNode }) {
  const { t } = useApp();
  const { shortPos, posName } = useLabels();

  return (
    <HoverCard>
      {/* `asChild`, so the trigger IS the name button rather than a span wrapped around it — a wrapper
          would sit between the cell's flex layout and the truncating child and break the ellipsis. */}
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent>
        <div className="flex items-center gap-2.5">
          <PlayerPhoto src={player.photo} alt={player.name} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">{player.name}</p>
            <p className="flex items-center gap-1.5 text-2xs text-fg-muted">
              <span title={posName(player.position)}>{shortPos(player.position)}</span>
              <span>·</span>
              <span className="tabular-nums">{player.age}</span>
              {player.injured && <Badge variant="gold">{t.out}</Badge>}
            </p>
          </div>
          <Overall value={player.overall} />
        </div>

        {/* Current against potential, the one number pair the row draws as a bar with no figures. */}
        <p className="mt-2.5 flex items-baseline justify-between text-2xs text-fg-muted">
          <span>{t.potential}</span>
          <span className="tabular-nums text-fg">
            {player.currentAbility} / {player.potentialAbility}
          </span>
        </p>

        <div className="mt-2 flex flex-col gap-1">
          {SIX_ATTRS.map(({ key, labelKey, axis }) => {
            const v = player.attrs[key];
            return (
              <div key={key} className="flex items-center gap-2 text-2xs" title={t[labelKey]}>
                <span className="w-7 shrink-0 font-medium text-fg-faint">{axis}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full" style={{ width: `${v}%`, background: tierColor(v) }} />
                </span>
                <span className="w-6 shrink-0 text-right font-semibold tabular-nums" style={{ color: tierColor(v) }}>
                  {v}
                </span>
              </div>
            );
          })}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
