import { Star } from "lucide-react";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Overall } from "../../components/ui/game";
import { Pitch, type PitchSpot } from "../../components/pitch";
import { Crest } from "../../components/ui/crest";
import { Flag } from "../../components/ui/flag";
import { TeamShirt } from "../../components/ui/team-shirt";
import { useFormat } from "../../lib/format";
import { lineupSpots } from "../../lib/lineup";
import { useLabels } from "../../lib/labels";
import { cn } from "../../lib/utils";
import type { UIStringKey } from "../../i18n/strings";
import type { ScreenId } from "../../layout/Shell";
import type { ClubHighlight, SquadEntry, TacticsView } from "@fut/career";
import type { ClubKit } from "@fut/competition";

const FORM_TONE: Record<string, string> = { W: "bg-[var(--pos-mid)] text-white", D: "bg-surface-3 text-fg-muted", L: "bg-danger text-white" };

function Stars({ n }: { n: number }) {
  return <span className="inline-flex">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={i < n ? "size-3.5 fill-gold text-gold" : "size-3.5 text-fg-faint"} />)}</span>;
}

export function Club({ clubId, onNavigate }: { clubId: string; onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { career } = useCareer();
  const fmt = useFormat();
  const { shortPos } = useLabels();
  if (!career) return null;
  const c = career.clubDetail(clubId);
  if (!c) {
    return (
      <div className="flex flex-col gap-4">
        <Button size="sm" variant="ghost" className="self-start" onClick={() => onNavigate("league")}>{t.league}</Button>
        <p className="text-sm text-fg-muted">—</p>
      </div>
    );
  }
  const kit = career.snapshot().clubs[clubId]?.kits?.home;
  const squad = career.squad(clubId);
  const tactics = career.tacticsView(clubId);
  const spots = tactics ? lineupSpots(tactics, squad, shortPos, (pos, k) => <TeamShirt kit={k} size={38} label={pos} />, kit) : [];
  const table = career.table("league");

  const highlight = (labelKey: UIStringKey, h: ClubHighlight | undefined, suffix?: string) =>
    h ? (
      <button className="flex w-full items-center gap-3 rounded-md px-1 py-1.5 text-left hover:bg-surface-2" onClick={() => onNavigate("player", h.playerId)}>
        <div className="flex-1">
          <div className="text-2xs uppercase tracking-wide text-fg-faint">{t[labelKey]}</div>
          <div className="text-sm font-medium text-fg">{h.name}</div>
        </div>
        <Badge variant="muted">{shortPos(h.position)}</Badge>
        <span className="w-10 text-right text-sm font-semibold tabular-nums text-fg">{h.figure}{suffix ?? ""}</span>
      </button>
    ) : null;

  const statRows: [string, string][] = [
    [t.playersLabel, String(c.squadCount)],
    [t.avgLevel, String(c.level)],
    [t.avgAge, String(c.avgAge)],
    [t.totalValue, fmt.money(c.totalValue, { compact: true })],
    [t.avgValueLabel, fmt.money(c.avgValue, { compact: true })],
    [t.wageBill, fmt.money(c.wageBill, { compact: true })],
    [t.avgWage, fmt.money(c.avgWage, { compact: true })],
    [t.foreigners, String(c.foreigners)],
    [t.u21, String(c.u21)],
    [t.injuredCount, String(c.injured)],
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <Crest src={c.crest} code={c.shortName} size={64} className="rounded-lg" />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
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
          <div className="mt-1 flex flex-wrap items-center gap-4 text-sm">
            <span className="text-fg-muted">{t.annualBudget}: <span className="font-medium text-fg">{fmt.money(c.annualBudget, { compact: true })}</span></span>
            <span className="text-fg-muted">{t.campaign}: <span className="font-medium text-fg tabular-nums">{c.record.won}{t.won} {c.record.drawn}{t.drawn} {c.record.lost}{t.lost}</span></span>
            <span className="inline-flex items-center gap-1">
              {c.form.map((f, i) => <span key={i} className={cn("grid size-5 place-items-center rounded text-2xs font-bold", FORM_TONE[f])}>{f}</span>)}
            </span>
          </div>
        </div>
        <Overall value={c.level} />
      </div>

      {/* Identity/details column, then a nested grid pairing the lineup with the
          standings — nesting keeps the left column out of their row, so the
          pitch alone sets the height the standings matches (and scrolls in). */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        {/* Coach + highlights + squad details */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>{t.coach}</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-full bg-surface-2 text-sm font-bold text-fg-muted">{c.coach.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}</div>
              <div className="flex-1">
                <div className="font-medium text-fg">{c.coach.name}</div>
                <div className="flex items-center gap-1.5 text-xs text-fg-muted"><Flag nationality={c.coach.nationality} size={12} /> · {c.coach.age}</div>
              </div>
              <Stars n={c.coach.stars} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.highlights}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-1">
              {highlight("bestPlayer", c.best)}
              {highlight("highestPotential", c.potential, "★")}
              {highlight("topScorer", c.scorer)}
              {highlight("topAssister", c.assister)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.squadOverview}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              {statRows.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 border-b border-hairline pb-1 last:border-0 last:pb-0">
                  <span className="truncate text-fg-muted">{label}</span>
                  <span className="shrink-0 font-medium tabular-nums text-fg">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Lineup + standings share a row: the pitch sets the height */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
        {/* Squad pitch */}
        <Card className="self-start">
          <CardHeader><CardTitle>{t.squad}</CardTitle></CardHeader>
          <CardContent className="p-3 sm:p-4"><div className="mx-auto max-w-md"><Pitch spots={spots} /></div></CardContent>
        </Card>

        {/* Standings — the wrapper adds no height of its own, so the row is sized
            by the pitch; the card fills it and the table scrolls inside. */}
        <div className="relative min-h-0">
        <Card className="flex h-full min-h-0 flex-col lg:absolute lg:inset-0">
          <CardHeader><CardTitle>{t.standings}</CardTitle></CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>{t.league}</TableHead>
                  <TableHead className="text-right">{t.points}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.map((r, i) => (
                  <TableRow key={r.teamId} data-active={r.teamId === clubId}>
                    <TableCell className="tabular-nums text-fg-faint">{i + 1}</TableCell>
                    <TableCell>
                      <button className="flex items-center gap-2 hover:text-primary" onClick={() => onNavigate("club", r.teamId)}>
                        <Crest src={career.clubCrest(r.teamId)} code={career.clubShort(r.teamId)} size={18} />
                        {career.clubShort(r.teamId)}
                      </button>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{r.points}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </div>
        </div>
      </div>
    </div>
  );
}
