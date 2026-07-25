import { ArrowLeft, Star } from "lucide-react";
import { type Position, PositionGroup, positionGroup } from "@fut/domain";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Overall } from "../../components/ui/game";
import { Pitch, type PitchSpot } from "../../components/pitch";
import { Crest } from "../../components/ui/crest";
import { TeamShirt } from "../../components/ui/team-shirt";
import { shortNamesFor } from "../../lib/names";
import { useFormat } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { PosGroup } from "../../lib/engine/world";
import type { ScreenId } from "../../layout/Shell";
import type { ClubHighlight, SquadEntry, TacticsView } from "@fut/career";
import type { ClubKit } from "@fut/competition";

const POS_SHORT: Record<string, string> = {
  goalkeeper: "GK", centreBack: "CB", fullBack: "FB", wingBack: "WB", defensiveMidfielder: "DM",
  centralMidfielder: "CM", attackingMidfielder: "AM", winger: "WG", striker: "ST",
};
const GROUP: Record<PositionGroup, PosGroup> = {
  [PositionGroup.Goalkeeper]: "GK", [PositionGroup.Defence]: "DEF", [PositionGroup.Midfield]: "MID", [PositionGroup.Attack]: "ATT",
};
const FORM_TONE: Record<string, string> = { W: "bg-[var(--pos-mid)] text-white", D: "bg-surface-3 text-fg-muted", L: "bg-danger text-white" };

/**
 * Render the club's PERSISTED tactics (the same lineup the match fields), rather
 * than recomputing one here — that duplicate used group-only matching and put
 * strikers on the wing. Read-only view, so shirts carry no rating/stamina.
 */
function lineup(view: TacticsView, squad: SquadEntry[], kit?: ClubKit): PitchSpot[] {
  const short = shortNamesFor(squad);
  return view.slots.map((s) => {
    const pos = POS_SHORT[s.position] ?? "";
    return {
      id: s.slot,
      x: s.width * 100,
      y: 100 - s.depth * 100,
      pos,
      group: GROUP[positionGroup(s.position as Position)],
      name: s.player ? short.get(s.player.playerId) ?? s.player.name : "—",
      title: s.player ? `${s.player.name} · ${s.player.overall}` : undefined,
      marker: <TeamShirt kit={kit} size={38} label={pos} />,
    };
  });
}

function Stars({ n }: { n: number }) {
  return <span className="inline-flex">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={i < n ? "size-3.5 fill-gold text-gold" : "size-3.5 text-fg-faint"} />)}</span>;
}

export function Club({ clubId, onNavigate }: { clubId: string; onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { career } = useCareer();
  const fmt = useFormat();
  if (!career) return null;
  const c = career.clubDetail(clubId);
  if (!c) {
    return (
      <div className="flex flex-col gap-4">
        <Button size="sm" variant="ghost" onClick={() => onNavigate("home")}><ArrowLeft /> {t.back}</Button>
        <p className="text-sm text-fg-muted">—</p>
      </div>
    );
  }
  const kit = career.snapshot().clubs[clubId]?.kits?.home;
  const squad = career.squad(clubId);
  const tactics = career.tacticsView(clubId);
  const spots = tactics ? lineup(tactics, squad, kit) : [];
  const table = career.table("league");

  const highlight = (labelKey: keyof typeof t, h: ClubHighlight | undefined, suffix?: string) =>
    h ? (
      <button className="flex w-full items-center gap-3 rounded-md px-1 py-1.5 text-left hover:bg-surface-2" onClick={() => onNavigate("player", h.playerId)}>
        <div className="flex-1">
          <div className="text-2xs uppercase tracking-wide text-fg-faint">{t[labelKey]}</div>
          <div className="text-sm font-medium text-fg">{h.name}</div>
        </div>
        <Badge variant="muted">{POS_SHORT[h.position] ?? h.position}</Badge>
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
      <Button size="sm" variant="ghost" className="self-start" onClick={() => onNavigate(c.isMine ? "home" : "league")}><ArrowLeft /> {t.back}</Button>

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
            <span className="text-fg-muted">{t.balance}: <span className="font-medium text-fg">{fmt.money(c.balance, { compact: true })}</span></span>
            <span className="text-fg-muted">{t.campaign}: <span className="font-medium text-fg tabular-nums">{c.record.won}{t.won} {c.record.drawn}{t.drawn} {c.record.lost}{t.lost}</span></span>
            <span className="inline-flex items-center gap-1">
              {c.form.map((f, i) => <span key={i} className={cn("grid size-5 place-items-center rounded text-2xs font-bold", FORM_TONE[f])}>{f}</span>)}
            </span>
          </div>
        </div>
        <Overall value={c.level} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Coach + highlights */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>{t.coach}</CardTitle></CardHeader>
            <CardContent className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-full bg-surface-2 text-sm font-bold text-fg-muted">{c.coach.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}</div>
              <div className="flex-1">
                <div className="font-medium text-fg">{c.coach.name}</div>
                <div className="text-xs text-fg-muted">{c.coach.nationality} · {c.coach.age}</div>
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
        </div>

        {/* Squad pitch + stats */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>{t.squad}</CardTitle></CardHeader>
            <CardContent className="p-3 sm:p-4"><div className="mx-auto max-w-md"><Pitch spots={spots} /></div></CardContent>
          </Card>
          <Card>
            <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 py-4 text-sm">
              {statRows.map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-hairline pb-1">
                  <span className="text-fg-muted">{label}</span>
                  <span className="font-medium tabular-nums text-fg">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Standings */}
        <Card>
          <CardHeader><CardTitle>{t.standings}</CardTitle></CardHeader>
          <CardContent>
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
  );
}
