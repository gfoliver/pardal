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
import { PlayerRadar } from "../../components/player-radar";
import { useFormat } from "../../lib/format";
import type { ScreenId } from "../../layout/Shell";
import type { UIStrings } from "../../i18n/strings";

const POS: Record<string, string> = { goalkeeper: "GK", centreBack: "CB", fullBack: "FB", wingBack: "WB", defensiveMidfielder: "DM", centralMidfielder: "CM", attackingMidfielder: "AM", winger: "WG", striker: "ST" };
const STATUS_KEY: Record<string, keyof UIStrings> = { key: "statusKey", firstTeam: "statusFirstTeam", rotation: "statusRotation", backup: "statusBackup", prospect: "statusProspect", surplus: "statusSurplus" };

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={i < n ? "size-4 fill-gold text-gold" : "size-4 text-fg-faint"} />
      ))}
    </span>
  );
}

export function PlayerDetail({ playerId, onNavigate }: { playerId: string; onNavigate: (s: ScreenId) => void }) {
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
  const isTarget = career.isTarget(playerId);
  const openRenew = () => { setWage(p.contract?.wage ?? 0); setYears(3); setRenewing(true); };
  const submitRenew = () => { renewContract(playerId, wage, years); setRenewing(false); toast(`${p.name} ✓`); };

  return (
    <div className="flex flex-col gap-6">
      <Button size="sm" variant="ghost" className="self-start" onClick={() => onNavigate(p.isMine ? "squad" : "scouting")}><ArrowLeft /> {t.back}</Button>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Overall value={p.overall} />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <div className="flex items-center gap-2 text-sm text-fg-muted">
            <Badge variant="muted">{POS[p.position] ?? p.position}</Badge>
            <span>{p.age}</span>
            <span>·</span>
            <span>{p.nationality}</span>
            <span>·</span>
            <span>{p.clubName}</span>
            {p.injured && <Badge variant="gold">{t.out}</Badge>}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Attributes */}
        <Card>
          <CardHeader><CardTitle>{t.attributes}</CardTitle></CardHeader>
          <CardContent>
            <PlayerRadar attrs={p.attrs} />
            <div className="mt-2 grid grid-cols-5 gap-2 text-center">
              {(["pace", "shooting", "passing", "defending", "physical"] as const).map((k) => (
                <div key={k} className="flex flex-col">
                  <span className="text-sm font-semibold tabular-nums text-fg">{p.attrs[k]}</span>
                  <span className="text-2xs uppercase text-fg-faint">{k.slice(0, 3)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Development + value */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>{t.development}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {p.known ? (
                <>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-fg-muted"><span>{t.currentAbility}</span><span className="tabular-nums">{p.currentAbility} / {p.potentialAbility}</span></div>
                    <Meter value={p.currentAbility} max={200} tone="neutral" />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-fg-muted">{t.potential}</span>
                    <Stars n={p.potentialStars} />
                  </div>
                </>
              ) : (
                <p className="text-sm text-fg-muted">{t.potentialUnknown}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid grid-cols-2 gap-4 py-4">
              <Stat value={fmt.money(p.value, { compact: true })} label={t.marketValue} />
              {p.contract && <Stat value={fmt.money(p.contract.wage, { compact: true })} label={t.wage} />}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Contract (own) or shortlist action (others) */}
      {p.isMine && p.contract ? (
        <Card>
          <CardHeader action={<Button size="sm" variant="secondary" onClick={openRenew}>{t.renewContract}</Button>}>
            <CardTitle>{t.role}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between"><span className="text-fg-muted">{t.role}</span><span>{t[STATUS_KEY[p.contract.squadStatus] ?? "role"]}</span></div>
            <div className="flex justify-between"><span className="text-fg-muted">{t.contractUntil}</span><span className="tabular-nums">{fmt.civil(career.civilDate(p.contract.expiry))}</span></div>
          </CardContent>
        </Card>
      ) : !p.isMine ? (
        <div>
          {isTarget ? (
            <Button variant="ghost" disabled><Check /> {t.alreadyTarget}</Button>
          ) : (
            <Button variant="secondary" onClick={() => { addTarget(playerId); toast(fmt.t(t.addedToTargets, { name: p.name })); }}><Plus /> {t.addToTargets}</Button>
          )}
        </div>
      ) : null}

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
