import { useState } from "react";
import { ArrowLeft, Plus, Check, Star } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { MoneyInput } from "../../components/ui/money-input";
import { NumberInput } from "../../components/ui/number-input";
import { Label } from "../../components/ui/input";
import { Meter } from "../../components/ui/progress";
import { Overall, Stat } from "../../components/ui/game";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { PlayerRadar } from "../../components/player-radar";
import { useFormat } from "../../lib/format";
import { cn } from "../../lib/utils";
import { tierColor } from "../../lib/ratings";
import type { ScreenId } from "../../layout/Shell";
import type { SixAttrs } from "@fut/career";
import type { UIStrings } from "../../i18n/strings";

const POS: Record<string, string> = { goalkeeper: "GK", centreBack: "CB", fullBack: "FB", wingBack: "WB", defensiveMidfielder: "DM", centralMidfielder: "CM", attackingMidfielder: "AM", winger: "WG", striker: "ST" };
const STATUS_KEY: Record<string, keyof UIStrings> = { key: "statusKey", firstTeam: "statusFirstTeam", rotation: "statusRotation", backup: "statusBackup", prospect: "statusProspect", surplus: "statusSurplus" };
const ATTR_ROWS: { key: keyof SixAttrs; labelKey: keyof UIStrings; axis: string }[] = [
  { key: "fin", labelKey: "attrFin", axis: "FIN" },
  { key: "tec", labelKey: "attrTec", axis: "TEC" },
  { key: "pas", labelKey: "attrPas", axis: "PAS" },
  { key: "des", labelKey: "attrDes", axis: "DES" },
  { key: "fis", labelKey: "attrFis", axis: "FIS" },
  { key: "vel", labelKey: "attrVel", axis: "VEL" },
];

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={i < n ? "size-3.5 fill-gold text-gold" : "size-3.5 text-fg-faint"} />
      ))}
    </span>
  );
}

/** Two-tone attribute bar: solid current, lighter extension to potential. */
function RangeBar({ value, potential }: { value: number; potential: number }) {
  const color = tierColor(value);
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="absolute inset-y-0 left-0 rounded-full opacity-30" style={{ width: `${potential}%`, background: color }} />
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

export function PlayerDetail({ playerId, onNavigate }: { playerId: string; onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { career, addTarget, renewContract } = useCareer();
  const fmt = useFormat();
  const [renewing, setRenewing] = useState(false);
  const [wage, setWage] = useState(0);
  const [years, setYears] = useState(3);
  if (!career) return null;
  const p = career.playerDetail(playerId);
  if (!p) {
    return (
      <div className="flex flex-col gap-4">
        <Button size="sm" variant="ghost" onClick={() => onNavigate("squad")}><ArrowLeft /> {t.back}</Button>
        <p className="text-sm text-fg-muted">—</p>
      </div>
    );
  }
  const stats = career.playerStats(playerId);
  const isTarget = career.isTarget(playerId);
  const initials = p.name.split(" ").map((s) => s[0]).slice(0, 2).join("");
  const openRenew = () => { setWage(p.contract?.wage ?? 0); setYears(3); setRenewing(true); };
  const submitRenew = () => { renewContract(playerId, wage, years); setRenewing(false); toast(`${p.name} ✓`); };
  const radarData = ATTR_ROWS.map((r) => ({ axis: r.axis, value: p.attrs[r.key] }));

  return (
    <div className="flex flex-col gap-6">
      <Button size="sm" variant="ghost" className="self-start" onClick={() => onNavigate(p.isMine ? "squad" : "scouting")}><ArrowLeft /> {t.back}</Button>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid size-16 place-items-center rounded-full bg-surface-2 text-xl font-bold text-fg-muted">{initials}</div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <Badge variant="muted">{POS[p.position] ?? p.position}</Badge>
            <span>{p.age}</span>
            <span>·</span>
            <span>{p.nationality}</span>
            <span>·</span>
            <span>{p.clubName}</span>
            {p.injured && <Badge variant="gold">{t.out}</Badge>}
          </div>
          <div className="mt-1 flex items-center gap-3 text-sm">
            <Stars n={p.reputationStars} />
            <span className="text-fg-muted">{fmt.money(p.value, { compact: true })}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {p.isMine ? (
            <Button variant="secondary" onClick={openRenew}>{t.renewContract}</Button>
          ) : isTarget ? (
            <Button variant="ghost" disabled><Check /> {t.alreadyTarget}</Button>
          ) : (
            <Button variant="secondary" onClick={() => { addTarget(playerId); toast(fmt.t(t.addedToTargets, { name: p.name })); }}><Plus /> {t.addToTargets}</Button>
          )}
          <Overall value={p.overall} />
        </div>
      </div>

      {/* Row 1: attributes + club/status */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t.attributes}</CardTitle></CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              {ATTR_ROWS.map((row) => {
                const v = p.attrs[row.key];
                const pot = p.attrsPotential[row.key];
                return (
                  <div key={row.key} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-sm text-fg-muted">{t[row.labelKey]}</span>
                    <RangeBar value={v} potential={pot} />
                    <span className="w-14 shrink-0 text-right text-xs tabular-nums text-fg-muted">{p.known && pot > v ? `${v}–${pot}` : v}</span>
                  </div>
                );
              })}
              {p.known && (
                <div className="mt-1 border-t border-hairline pt-3">
                  <div className="mb-1 flex justify-between text-xs text-fg-muted"><span>{t.currentAbility}</span><span className="tabular-nums">{p.currentAbility} / {p.potentialAbility}</span></div>
                  <Meter value={p.currentAbility} max={200} tone="neutral" />
                </div>
              )}
            </div>
            <div className="flex items-center justify-center">
              <PlayerRadar data={radarData} />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>{t.currentClub}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between"><span className="text-fg-muted">{p.clubName}</span><span>{p.nationality}</span></div>
              {p.contract && (
                <>
                  <div className="flex justify-between border-t border-hairline pt-2"><span className="text-fg-muted">{t.salary}</span><span className="tabular-nums">{fmt.money(p.contract.wage, { compact: true })}</span></div>
                  <div className="flex justify-between"><span className="text-fg-muted">{t.expires}</span><span className="tabular-nums">{fmt.civil(career.civilDate(p.contract.expiry))}</span></div>
                  {p.isMine && <div className="flex justify-between"><span className="text-fg-muted">{t.role}</span><span>{t[STATUS_KEY[p.contract.squadStatus] ?? "role"]}</span></div>}
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.status}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between"><span className="text-fg-muted">{t.condition}</span><span className="text-fg-faint">?</span></div>
              <div className="flex justify-between"><span className="text-fg-muted">{t.morale}</span><span className="text-fg-faint">?</span></div>
              <div className="flex justify-between"><span className="text-fg-muted">{t.injuredLabel}</span><span>{p.injured ? t.out : t.no}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Row 2: positions + statistics + recent games */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t.positions}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <Badge variant="primary">{POS[p.position] ?? p.position}</Badge>
              <span className="tabular-nums text-fg-muted">100%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t.statistics}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              <Stat value={stats.appearances} label={t.games} />
              <Stat value={stats.goals} label={t.goals} />
              <Stat value={stats.assists} label={t.assists} />
              <Stat value={stats.avgRating ? stats.avgRating.toFixed(1) : "—"} label={t.average} />
            </div>
            {stats.byCompetition.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.league}</TableHead>
                    <TableHead className="text-right">{t.games}</TableHead>
                    <TableHead className="text-right">{t.goals[0]}</TableHead>
                    <TableHead className="text-right">{t.assists[0]}</TableHead>
                    <TableHead className="text-right">{t.average}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.byCompetition.map((c) => (
                    <TableRow key={c.competitionId}>
                      <TableCell className="text-fg">{c.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.appearances}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.goals}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.assists}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.avgRating.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t.lastGames}</CardTitle></CardHeader>
          <CardContent>
            {stats.lastGames.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-muted">—</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.opponent}</TableHead>
                    <TableHead className="text-right">{t.result}</TableHead>
                    <TableHead className="text-right">{t.rating}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.lastGames.map((g, i) => (
                    <TableRow key={i}>
                      <TableCell>{g.home ? "" : "@"}{g.opponentShort}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.goalsFor}–{g.goalsAgainst}</TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex h-6 min-w-[32px] items-center justify-center rounded-sm px-1 text-xs font-semibold tabular-nums" style={{ color: tierColor(g.rating * 10) }}>{g.rating.toFixed(1)}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Renew dialog */}
      <Dialog open={renewing} onOpenChange={setRenewing}>
        <DialogContent>
          <DialogHeader><DialogTitle>{p.name}</DialogTitle></DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5"><Label>{t.wagePerWeek}</Label><MoneyInput value={wage} onValue={setWage} step={5000} /></div>
            <div className="flex flex-col gap-1.5"><Label>{t.years}</Label><NumberInput value={years} onValue={setYears} min={1} max={5} step={1} /></div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenewing(false)}>{t.cancel}</Button>
            <Button variant="primary" onClick={submitRenew}>{t.renewContract}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
