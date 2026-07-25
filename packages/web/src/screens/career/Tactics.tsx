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
import { groupColorVar } from "../../util/pos";
import { TeamShirt } from "../../components/ui/team-shirt";
import { cn } from "../../lib/utils";
import { shortNamesFor } from "../../lib/names";
import type { PosGroup } from "../../lib/engine/world";
import type { StoredInstructions, TacticsPlayer } from "@fut/career";
import type { ClubKit } from "@fut/competition";

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
  const { career, setFormation, setMentality, setInstruction, setLineupSlot, setPlayerRole, setSlotPosition, autoPickLineup } = useCareer();
  const [held, setHeld] = useState<Held>(null);
  const [moveMode, setMoveMode] = useState(false);
  if (!career) return null;
  const v = career.tacticsView();
  if (!v) return null;
  // Lineups read better with common names ("Bernabei", not "Alexandro Bernabei").
  const short = shortNamesFor([...v.slots.map((s) => s.player).filter((p): p is NonNullable<typeof p> => Boolean(p)), ...v.bench]);
  const nameOf = (p?: { playerId: string; name: string }) => (p ? short.get(p.playerId) ?? p.name : undefined);

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

  const kits = career.snapshot().clubs[v.clubId]?.kits;
  const kit = kits?.home;

  const spots: PitchSpot[] = v.slots.map((s) => ({
    id: s.slot,
    x: s.width * 100,
    y: 100 - s.depth * 100,
    pos: POS_SHORT[s.position] ?? s.position,
    group: GROUP[positionGroup(s.position as Position)],
    name: nameOf(s.player) ?? "—",
    title: s.player ? `${s.player.name} · ${s.player.overall}` : undefined,
    marker: <TeamShirt kit={kit} size={38} label={POS_SHORT[s.position] ?? s.position} />,
  }));

  // Drag a shirt onto another slot (swap), or a bench player onto a slot (promote).
  const dropOnSlot = (from: string, to: number | string) => {
    const toSlot = Number(to);
    const fromSlot = Number(from);
    if (from.startsWith("bench:")) setLineupSlot(toSlot, from.slice(6));
    else if (Number.isFinite(fromSlot)) {
      const mover = v.slots[fromSlot]?.player;
      if (mover) setLineupSlot(toSlot, mover.playerId);
    }
    setHeld(null);
  };

  const heldSlot = held?.fromSlot != null ? v.slots[held.fromSlot] : undefined;
  const roleOptions = heldSlot ? allRoles().filter((r) => r.positions.includes(positionGroup(heldSlot.position as Position))) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.tacticsTitle}</h1>
          <p className="text-sm text-fg-muted">{moveMode ? t.movePositionsHint : held ? t.selectPlayerHint : t.tacticsSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={moveMode ? "primary" : "ghost"} onClick={() => { setMoveMode((m) => !m); setHeld(null); }}>{t.movePositions}</Button>
          <Button variant="secondary" onClick={() => { autoPickLineup(); setHeld(null); }}>{t.autoPick}</Button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="mx-auto max-w-md">
              <Pitch
                spots={spots}
                editable
                selectedId={held?.fromSlot ?? null}
                onSelect={(id) => tapSlot(Number(id))}
                onDropOnSpot={dropOnSlot}
                moveMode={moveMode}
                onMoveSpot={(id, x, y) => setSlotPosition(Number(id), (100 - y) / 100, x / 100)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-start-1 lg:row-start-2">
          <CardHeader><CardTitle>{t.bench} · {v.bench.length}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {v.bench.map((p) => (
              <BenchCard
                key={p.playerId}
                player={p}
                name={short.get(p.playerId) ?? p.name}
                kit={kit}
                selected={held?.playerId === p.playerId}
                onSelect={() => tapBench(p.playerId)}
              />
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
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

          {kits && (
            <Card>
              <CardHeader><CardTitle>{t.kits}</CardTitle></CardHeader>
              <CardContent className="flex items-center gap-6">
                <div className="flex flex-col items-center gap-1">
                  <TeamShirt kit={kits.home} size={56} />
                  <span className="text-2xs uppercase text-fg-faint">{t.kitHome}</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <TeamShirt kit={kits.away} size={56} />
                  <span className="text-2xs uppercase text-fg-faint">{t.kitAway}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {heldSlot?.player && (
            <Card>
              <CardHeader><CardTitle>{POS_SHORT[heldSlot.position] ?? heldSlot.position} · {nameOf(heldSlot.player)}</CardTitle></CardHeader>
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

/** A FIFA-style bench card: kit, position chip, name, rating and condition. */
function BenchCard({
  player,
  name,
  kit,
  selected,
  onSelect,
}: {
  player: TacticsPlayer;
  name: string;
  kit?: ClubKit;
  selected: boolean;
  onSelect: () => void;
}) {
  const pos = POS_SHORT[player.position] ?? player.position;
  const fit = Math.max(0, Math.min(100, player.fitness));
  return (
    <button
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", `bench:${player.playerId}`)}
      onClick={onSelect}
      title={`${player.name} · ${player.overall}`}
      className={cn(
        "group flex flex-col gap-1.5 rounded-lg border bg-surface-2/60 p-2 text-left transition-colors hover:bg-surface-2",
        selected ? "border-primary ring-1 ring-primary" : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <TeamShirt kit={kit} size={26} />
        <span
          className="rounded px-1 py-0.5 text-2xs font-bold uppercase leading-none"
          style={{ background: groupColorVar(GROUP[positionGroup(player.position as Position)]), color: "#04140e" }}
        >
          {pos}
        </span>
        <span className="ml-auto text-sm font-bold tabular-nums text-fg">{player.overall}</span>
      </div>
      <span className={cn("truncate text-xs font-medium", player.injured ? "text-fg-faint line-through" : "text-fg")}>{name}</span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
        <span
          className="block h-full rounded-full"
          style={{ width: `${fit}%`, background: fit > 66 ? "var(--pos-mid)" : fit > 33 ? "var(--gold)" : "var(--danger)" }}
        />
      </span>
    </button>
  );
}
