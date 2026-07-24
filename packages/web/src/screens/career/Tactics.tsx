import { useState } from "react";
import { allRoles, Formation, MarkingScheme, Mentality, Position, PositionGroup, positionGroup, RoleKey } from "@fut/domain";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Label } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Overall } from "../../components/ui/game";
import { Pitch, type PitchSpot } from "../../components/pitch";
import { cn } from "../../lib/utils";
import type { PosGroup } from "../../lib/engine/world";
import type { StoredInstructions } from "@fut/career";

const POS_SHORT: Record<string, string> = {
  goalkeeper: "GK", centreBack: "CB", fullBack: "FB", wingBack: "WB", defensiveMidfielder: "DM",
  centralMidfielder: "CM", attackingMidfielder: "AM", winger: "WG", striker: "ST",
};
const GROUP: Record<PositionGroup, PosGroup> = {
  [PositionGroup.Goalkeeper]: "GK", [PositionGroup.Defence]: "DEF", [PositionGroup.Midfield]: "MID", [PositionGroup.Attack]: "ATT",
};
const FORMATION_LABEL: Record<string, string> = {
  [Formation.F442]: "4-4-2", [Formation.F442Diamond]: "4-4-2 ◇", [Formation.F433]: "4-3-3", [Formation.F4231]: "4-2-3-1",
  [Formation.F424]: "4-2-4", [Formation.F352]: "3-5-2", [Formation.F532]: "5-3-2", [Formation.F343]: "3-4-3", [Formation.F541]: "5-4-1",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/([A-Z])/g, " $1");

const SLIDERS: { key: keyof StoredInstructions; labelKey: "tempo" | "pressing" | "lineHeight" | "widthInstr" | "directness" }[] = [
  { key: "tempo", labelKey: "tempo" },
  { key: "pressing", labelKey: "pressing" },
  { key: "lineHeight", labelKey: "lineHeight" },
  { key: "width", labelKey: "widthInstr" },
  { key: "directness", labelKey: "directness" },
];

type Held = { playerId: string; fromSlot: number | null } | null;

export function Tactics() {
  const { t } = useApp();
  const { career, setFormation, setMentality, setInstruction, setLineupSlot, setPlayerRole, autoPickLineup } = useCareer();
  const [held, setHeld] = useState<Held>(null);
  if (!career) return null;
  const v = career.tacticsView();
  if (!v) return null;

  // Tap-to-move: pick a player (pitch or bench), then tap a slot to place/swap.
  const tapSlot = (i: number) => {
    const player = v.slots[i]?.player;
    if (!held) {
      if (player) setHeld({ playerId: player.playerId, fromSlot: i });
      return;
    }
    if (held.fromSlot === i) { setHeld(null); return; } // tap the held slot again → cancel
    setLineupSlot(i, held.playerId);
    setHeld(null);
  };
  const tapBench = (playerId: string) => {
    if (!held) { setHeld({ playerId, fromSlot: null }); return; }
    if (held.playerId === playerId) { setHeld(null); return; }
    if (held.fromSlot != null) setLineupSlot(held.fromSlot, playerId); // bench the held starter, promote this one
    setHeld(null);
  };

  const spots: PitchSpot[] = v.slots.map((s) => ({
    id: s.slot,
    x: s.width * 100,
    y: 100 - s.depth * 100,
    pos: POS_SHORT[s.position] ?? s.position,
    group: GROUP[positionGroup(s.position as Position)],
    name: s.player?.name ?? "—",
    title: s.player ? `${s.player.name} · ${s.player.overall}` : undefined,
  }));

  const heldSlot = held?.fromSlot != null ? v.slots[held.fromSlot] : undefined;
  const roleOptions = heldSlot ? allRoles().filter((r) => r.positions.includes(positionGroup(heldSlot.position as Position))) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.tacticsTitle}</h1>
          <p className="text-sm text-fg-muted">{held ? t.selectPlayerHint : t.tacticsSubtitle}</p>
        </div>
        <Button variant="secondary" onClick={() => { autoPickLineup(); setHeld(null); }}>{t.autoPick}</Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="mx-auto max-w-md">
              <Pitch spots={spots} editable selectedId={held?.fromSlot ?? null} onSelect={(id) => tapSlot(Number(id))} />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>{t.matchSetup}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>{t.formation}</Label>
                <Select value={v.formation} onValueChange={(x) => setFormation(x as Formation)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.values(Formation).map((f) => <SelectItem key={f} value={f}>{FORMATION_LABEL[f] ?? f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t.mentality}</Label>
                <Select value={v.mentality} onValueChange={(x) => setMentality(x as Mentality)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.values(Mentality).map((m) => <SelectItem key={m} value={m}>{cap(m)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {heldSlot?.player && (
            <Card>
              <CardHeader><CardTitle>{POS_SHORT[heldSlot.position] ?? heldSlot.position} · {heldSlot.player.name}</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Overall value={heldSlot.player.overall} />
                  <span className="text-fg-muted">{cap(heldSlot.player.position)}</span>
                  {heldSlot.player.injured && <Badge variant="gold">{t.out}</Badge>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t.role}</Label>
                  <Select value={heldSlot.role} onValueChange={(x) => heldSlot.player && setPlayerRole(heldSlot.player.playerId, x as RoleKey)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{roleOptions.map((r) => <SelectItem key={r.key} value={r.key}>{cap(r.key)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>{t.bench} · {v.bench.length}</CardTitle></CardHeader>
            <CardContent className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {v.bench.map((p) => (
                <button
                  key={p.playerId}
                  onClick={() => tapBench(p.playerId)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2",
                    held?.playerId === p.playerId && "bg-primary-soft ring-1 ring-primary",
                  )}
                >
                  <span className="w-8 text-2xs uppercase text-fg-faint">{POS_SHORT[p.position] ?? p.position}</span>
                  <span className={p.injured ? "text-fg-faint line-through" : "text-fg"}>{p.name}</span>
                  <span className="ml-auto tabular-nums text-fg-muted">{p.overall}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t.teamInstructions}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {SLIDERS.map((s) => (
                <div key={s.key} className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-fg-muted"><span>{t[s.labelKey]}</span><span className="tabular-nums">{Math.round((v.instructions[s.key] as number) * 100)}</span></div>
                  <input type="range" min={0} max={1} step={0.05} value={v.instructions[s.key] as number} onChange={(e) => setInstruction({ [s.key]: Number(e.target.value) } as Partial<StoredInstructions>)} className="accent-[var(--primary)]" />
                </div>
              ))}
              <div className="flex flex-col gap-1.5">
                <Label>{t.marking}</Label>
                <Select value={v.instructions.markingScheme} onValueChange={(x) => setInstruction({ markingScheme: x as MarkingScheme })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.values(MarkingScheme).map((m) => <SelectItem key={m} value={m}>{cap(m)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
