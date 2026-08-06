import { Star } from "lucide-react";
import { useApp } from "../../app/AppProviders";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Crest } from "../../components/ui/crest";
import { Flag } from "../../components/ui/flag";
import { Pitch } from "../../components/pitch";
import { cn } from "../../lib/utils";
import { TeamShirt } from "../../components/ui/team-shirt";
import { Overall } from "../../components/ui/game";
import type { ClubPreview } from "../../lib/career/preview";
import { lineupSpots } from "../../lib/lineup";
import { useFormat } from "../../lib/format";
import { useLabels } from "../../lib/labels";

/**
 * What you would inherit, beside the club list.
 *
 * Deliberately the same shape as the in-career club page: identity strip across the top, a narrow
 * column of cards, and the pitch paired with a second card in its own row so the pitch sets the
 * height. Someone choosing a club and someone inspecting a rival are reading the same facts, and a
 * second visual language for them would be a second thing to keep consistent for no gain.
 *
 * The XI is drawn rather than listed because the thing a manager wants here is the SHAPE of the team
 * he is taking on, and eleven names in a table do not carry shape. It is the club's persisted
 * lineup — the same one the first match will field.
 */
function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex" aria-label={`${n}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={i < n ? "size-3.5 fill-gold text-gold" : "size-3.5 text-fg-faint"} />
      ))}
    </span>
  );
}

export function ClubPreviewPanel({ preview }: { preview: ClubPreview }) {
  const { t } = useApp();
  const fmt = useFormat();
  const { shortPos } = useLabels();
  const { detail: c, finances: fin, tactics, squad, kit, xiRating } = preview;

  const spots = tactics ? lineupSpots(tactics, squad, shortPos, (pos, k) => <TeamShirt kit={k} size={36} label={pos} />, kit) : [];

  /*
   * `c.level`, `c.totalValue` and `c.avgValue` are optional on the view because a club whose players
   * you have not watched has no such figures. This panel asks for the UNFOGGED detail — nothing is
   * observed yet, and picking a club to manage is exactly when everything should be visible — so they
   * are present. A row is dropped rather than printed as a zero if that ever changes.
   */
  const money = (v: number | undefined) => (v === undefined ? undefined : fmt.money(v, { compact: true }));
  /** A row, or no row at all — spread in, so an absent figure leaves nothing behind. */
  type Row = [string, string, string?];
  const row = (label: string, value: string | undefined, hint?: string): Row[] =>
    value === undefined ? [] : [[label, value, hint]];

  /** Money, in the order the questions get asked: what have I got, what is committed, what is left. */
  const moneyRows: Row[] = [
    ...row(t.annualBudget, money(fin.annualBudget), t.seasonBudgetHint),
    ...row(t.wageBill, money(fin.monthlyWageBill), t.perMonth),
    ...row(t.availableForWages, money(Math.max(0, fin.wageRoomPerMonth)), t.perMonth),
    ...row(t.totalValue, money(c.totalValue)),
  ];
  const squadRows: Row[] = [
    ...row(t.playersLabel, String(c.squadCount)),
    ...row(t.avgLevel, c.level === undefined ? undefined : String(c.level)),
    ...row(t.avgAge, String(c.avgAge)),
    ...row(t.u21, String(c.u21)),
    ...row(t.foreigners, String(c.foreigners)),
    ...row(t.avgValueLabel, money(c.avgValue)),
  ];

  const Rows = ({ rows }: { rows: readonly [string, string, string?][] }) => (
    <CardContent className="flex flex-col gap-1.5 text-sm">
      {rows.map(([label, value, note]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 border-b border-hairline pb-1 last:border-0 last:pb-0">
          <span className="min-w-0 truncate text-fg-muted">
            {label}
            {note && <span className="ml-1 text-2xs text-fg-faint">{note}</span>}
          </span>
          <span className="shrink-0 font-medium tabular-nums text-fg">{value}</span>
        </div>
      ))}
    </CardContent>
  );

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Identity strip */}
      <div className="flex flex-wrap items-center gap-4">
        <Crest src={c.crest} code={c.shortName} size={56} className="rounded-lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-semibold tracking-tight">{c.nickname}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <span>{c.leagueName}</span>
            <Stars n={c.reputationStars} />
          </div>
          {(c.city || c.stadium || c.founded) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-fg-faint">
              {c.city && <span>{c.city}</span>}
              {c.stadium && <span>· {c.stadium}{c.capacity ? ` (${fmt.number(c.capacity)})` : ""}</span>}
              {c.founded && <span>· {c.founded}</span>}
            </div>
          )}
        </div>
        {/* The XI's rating, which is the same number the list showed for this club. */}
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <Overall value={xiRating} />
          <span className="text-2xs uppercase tracking-wide text-fg-faint">{t.squadStrength}</span>
        </div>
      </div>

      {/*
        Three columns of comparable width rather than a narrow column beside a wide one. The first
        attempt nested the pitch in a `1fr` track, which made its card 740px around a 304px pitch —
        400px of empty card while the money card was squeezed into 224px. Equal columns let the pitch
        fill its own and give every card a share worth reading.
      */}
      <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader><CardTitle>{t.coach}</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold text-fg-muted">
                {c.coach.name ? c.coach.name.split(" ").map((s) => s[0]).slice(0, 2).join("") : "—"}
              </div>
              <div className="min-w-0 flex-1">
                <div className={cn("truncate font-medium", c.coach.name ? "text-fg" : "italic text-fg-muted")}>{c.coach.name ?? t.coachUnknown}</div>
                {(c.coach.nationality || c.coach.age !== undefined) && (
                  <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                    {c.coach.nationality && <Flag nationality={c.coach.nationality} size={12} />}
                    {c.coach.nationality && c.coach.age !== undefined ? " · " : ""}
                    {c.coach.age}
                  </div>
                )}
              </div>
              <Stars n={c.coach.stars} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.squadOverview}</CardTitle></CardHeader>
            <Rows rows={squadRows} />
          </Card>
        </div>

        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>{t.startingXi}</CardTitle>
            <Badge variant="muted">{c.formation}</Badge>
          </CardHeader>
          <CardContent className="p-3 sm:p-4">
            {/* Fills its column now, capped only so it cannot dominate a very wide screen. */}
            <div className="mx-auto max-w-[22rem]"><Pitch spots={spots} /></div>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader><CardTitle>{t.finances}</CardTitle></CardHeader>
            <Rows rows={moneyRows} />
          </Card>
          {c.best && (
            <Card>
              <CardHeader><CardTitle>{t.bestPlayer}</CardTitle></CardHeader>
              <CardContent className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-fg">{c.best.name}</div>
                  <div className="text-xs text-fg-muted">{shortPos(c.best.position)}</div>
                </div>
                <span className="shrink-0 text-lg font-semibold tabular-nums text-fg">{c.best.figure}</span>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
