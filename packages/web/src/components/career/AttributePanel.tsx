import type { AttrGroup, AttrKnowledge } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { EstimateBar, EstimateText } from "./Estimate";
import { tierColor } from "../../lib/ratings";
import { cn } from "../../lib/utils";
import type { UIStringKey } from "../../i18n/strings";

/**
 * Every attribute the player has — physical, mental, technical, and the four
 * goalkeeping ones for keepers.
 *
 * The screen used to show six averaged categories, which hid the model the
 * match engine actually runs on: a striker and a winger both came out as "TEC
 * 78" when what separates them is dribbling versus finishing.
 *
 * Showing twenty numbers only works if they aren't all shouting, so each row is
 * weighted by `relevance` — taken from the engine's own per-position weights.
 * Finishing is bold for a striker and greyed for a centre-back because that is
 * literally how `positionOverall` scores them, not a display choice.
 */

const GROUP_KEY: Record<AttrGroup, UIStringKey> = {
  physical: "attrGroupPhysical",
  mental: "attrGroupMental",
  technical: "attrGroupTechnical",
  goalkeeping: "attrGroupGoalkeeping",
};

export function AttributePanel({ attributes }: { attributes: readonly AttrKnowledge[] }) {
  const { t } = useApp();
  if (attributes.length === 0) {
    return <p className="py-6 text-center text-sm text-fg-muted">{t.attributesUnknown}</p>;
  }

  const groups = [...new Set(attributes.map((a) => a.group))];
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {groups.map((group) => (
        <div key={group} className="flex flex-col gap-1.5">
          <h3 className="text-2xs font-bold uppercase tracking-caps text-fg-faint">{t[GROUP_KEY[group]]}</h3>
          {attributes
            .filter((a) => a.group === group)
            // Most relevant first: the eye should land on what decides his games.
            .sort((a, b) => b.relevance - a.relevance || a.name.localeCompare(b.name))
            .map((a) => (
              <div key={a.name} className="flex items-center gap-2 text-xs">
                <span className={cn("w-24 shrink-0 truncate", a.relevance >= 0.66 ? "font-semibold text-fg" : "text-fg-muted")}>
                  {t.attrNames[a.name] ?? a.name}
                </span>
                <span className="flex-1"><EstimateBar e={a.estimate} relevance={a.relevance} color={tierColor(a.estimate.mid)} /></span>
                <span className="w-16 shrink-0 text-right"><EstimateText e={a.estimate} /></span>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
