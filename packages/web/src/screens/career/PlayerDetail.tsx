import { useState } from "react";
import { Plus, Check, Star } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Flag } from "../../components/ui/flag";
import { MoneyInput } from "../../components/ui/money-input";
import { NumberInput } from "../../components/ui/number-input";
import { Label } from "../../components/ui/input";
import { PlayerPhoto } from "../../components/ui/player-photo";
import { AttributePanel } from "../../components/career/AttributePanel";
import { EstimateText } from "../../components/career/Estimate";
import { DevelopmentChart } from "../../components/career/DevelopmentChart";
import { useLabels } from "../../lib/labels";
import { Meter } from "../../components/ui/progress";
import { Overall, Stat } from "../../components/ui/game";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { PlayerRadar } from "../../components/player-radar";
import { useFormat } from "../../lib/format";
import { cn } from "../../lib/utils";
import { tierColor } from "../../lib/ratings";
import type { ScreenId } from "../../layout/Shell";
import type { SixAttrs } from "@fut/career";
import type { UIStringKey } from "../../i18n/strings";

const ATTR_ROWS: { key: keyof SixAttrs; labelKey: UIStringKey; axis: string }[] = [
  { key: "fin", labelKey: "attrFin", axis: "FIN" },
  { key: "tec", labelKey: "attrTec", axis: "TEC" },
  { key: "pas", labelKey: "attrPas", axis: "PAS" },
  { key: "des", labelKey: "attrDes", axis: "DES" },
  { key: "fis", labelKey: "attrFis", axis: "FIS" },
  { key: "vel", labelKey: "attrVel", axis: "VEL" },
];

/**
 * The overall, at whatever fidelity we've earned: the exact number, a letter
 * grade, or nothing. Shown in two places on this screen, so the three-way
 * ladder lives in one component rather than being spelled out at each.
 */
function KnownOverall({ exact, grade, size = "md" }: { exact?: number; grade?: string; size?: "md" | "lg" }) {
  if (exact !== undefined) return <Overall value={exact} />;
  const box = size === "lg" ? "size-12 text-2xl" : "size-9 text-lg";
  return (
    <span className={cn("grid place-items-center rounded-md bg-surface-2 font-bold", box, grade ? "text-fg-muted" : "text-fg-faint")}>
      {grade ?? "?"}
    </span>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={i < n ? "size-3.5 fill-gold text-gold" : "size-3.5 text-fg-faint"} />
      ))}
    </span>
  );
}

export function PlayerDetail({ playerId, onNavigate }: { playerId: string; onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { career, addTarget, offerContract } = useCareer();
  const fmt = useFormat();
  const { shortPos, statusName } = useLabels();
  const [renewing, setRenewing] = useState(false);
  const [wage, setWage] = useState(0);
  const [years, setYears] = useState(3);
  /** What the player said when he turned the last offer down. */
  const [refusal, setRefusal] = useState<string | null>(null);
  if (!career) return null;
  const p = career.playerDetail(playerId);
  if (!p) {
    return (
      <div className="flex flex-col gap-4">
        <Button size="sm" variant="ghost" className="self-start" onClick={() => onNavigate("squad")}>{t.squad}</Button>
        <p className="text-sm text-fg-muted">—</p>
      </div>
    );
  }
  const stats = career.playerStats(playerId);
  const isTarget = career.isTarget(playerId);
  const demands = p.isMine ? career.contractDemands(playerId) : undefined;
  const daysLeft = p.isMine ? career.daysUntilContractEnd(playerId) : undefined;
  const openRenew = () => {
    // Open at what he's asking, not at what he's on — the current wage is
    // exactly the number he has already decided isn't enough.
    setWage(demands?.wage ?? p.contract?.wage ?? 0);
    setYears(demands?.years ?? 3);
    setRefusal(null);
    setRenewing(true);
  };
  const submitRenew = () => {
    const outcome = offerContract(playerId, wage, years);
    if (outcome.kind === "accepted") {
      setRenewing(false);
      setRefusal(null);
      toast(fmt.t(t.playerSigns, { name: p.name }));
      return;
    }
    // He stays put and says why, so the dialog is worth keeping open.
    setRefusal(outcome.kind === "countered" ? fmt.t(t.heHoldsOut, { wage: fmt.money(outcome.demands.minimumWage, { compact: true }) }) : t.offerInsulting);
  };
  const radarData = ATTR_ROWS.map((r) => ({ axis: r.axis, value: p.attrs[r.key] }));

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <PlayerPhoto src={p.photo} alt={p.name} size={64} />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <Badge variant="muted">{shortPos(p.position)}</Badge>
            <span>{p.age}</span>
            <span>·</span>
            <Flag nationality={p.nationality} size={15} />
            <span>·</span>
            <span>{p.clubName}</span>
            {p.injured && <Badge variant="gold">{t.out}</Badge>}
          </div>
          <div className="mt-1 flex items-center gap-3 text-sm">
            <Stars n={p.reputationStars} />
            <EstimateText e={p.value} format={(n) => fmt.money(n, { compact: true })} className="text-fg-muted" />
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
          <KnownOverall exact={p.overall} grade={p.overallGrade} />
        </div>
      </div>

      {/* Row 1: attributes + club/status */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* One card: the radar is the shape, the bars are the detail behind it.
            Splitting them left a chart floating alone with nothing to read it
            against — and they answer the same question at two zoom levels. */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t.attributes}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-5 xl:flex-row xl:items-start">
            <div className="flex shrink-0 flex-col items-center gap-3 xl:w-56">
              {/* The headline number the radar shape is a picture of. */}
              <div className="flex items-center gap-2">
                <KnownOverall exact={p.overall} grade={p.overallGrade} size="lg" />
                <span className="text-2xs uppercase tracking-caps text-fg-faint">{t.overall}</span>
              </div>
              <PlayerRadar data={radarData} />
              {p.known && p.currentAbility !== undefined && (
                <div className="w-full border-t border-hairline pt-3">
                  <div className="mb-1 flex justify-between text-xs text-fg-muted"><span>{t.currentAbility}</span><span className="tabular-nums">{p.currentAbility} / {p.potentialAbility}</span></div>
                  <Meter value={p.currentAbility} max={200} tone="neutral" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 xl:border-l xl:border-hairline xl:pl-5">
              <AttributePanel attributes={career.playerAttributes(playerId)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>{t.currentClub}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between"><span className="text-fg-muted">{p.clubName}</span><Flag nationality={p.nationality} /></div>
              {p.contract && (
                <>
                  <div className="flex justify-between border-t border-hairline pt-2"><span className="text-fg-muted">{t.salary}</span><span className="tabular-nums">{fmt.money(p.contract.wage, { compact: true })}</span></div>
                  <div className="flex justify-between"><span className="text-fg-muted">{t.expires}</span><span className="tabular-nums">{fmt.civil(career.civilDate(p.contract.expiry))}</span></div>
                  {p.isMine && <div className="flex justify-between"><span className="text-fg-muted">{t.role}</span><span>{statusName(p.contract.squadStatus)}</span></div>}
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
          <CardHeader><CardTitle>{t.developmentTitle}</CardTitle></CardHeader>
          <CardContent>
            <DevelopmentChart history={career.playerHistory(playerId)} />
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

      {/* Renew dialog — a negotiation, so it shows what he wants and answers back. */}
      <Dialog open={renewing} onOpenChange={setRenewing}>
        <DialogContent>
          <DialogHeader><DialogTitle>{p.name}</DialogTitle></DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            {demands && (
              <div className="flex flex-col gap-1 rounded-md bg-surface-2 px-3 py-2 text-xs text-fg-muted">
                <span>{fmt.t(t.heWants, { wage: fmt.money(demands.wage, { compact: true }), years: demands.years })}</span>
                {daysLeft !== undefined && daysLeft <= 180 && (
                  <span className="text-gold">{fmt.t(t.contractRunsOut, { n: Math.max(0, daysLeft) })}</span>
                )}
              </div>
            )}
            <div className="flex flex-col gap-1.5"><Label>{t.wagePerWeek}</Label><MoneyInput value={wage} onValue={setWage} step={5000} /></div>
            <div className="flex flex-col gap-1.5"><Label>{t.years}</Label><NumberInput value={years} onValue={setYears} min={1} max={5} step={1} /></div>
            {refusal && <p className="text-xs text-danger">{refusal}</p>}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenewing(false)}>{t.cancel}</Button>
            {/* Meeting his number is one click; the manager can still lowball. */}
            {demands && <Button variant="secondary" onClick={() => { setWage(demands.wage); setYears(demands.years); }}>{t.matchDemands}</Button>}
            <Button variant="primary" onClick={submitRenew}>{t.renewContract}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
