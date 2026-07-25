import { useState } from "react";
import { Formation, Mentality, type Position, RoleKey } from "@fut/domain";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Label } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Overall } from "../../components/ui/game";
import { Pitch, type PitchSpot } from "../../components/pitch";
import {
  BenchCard,
  cap,
  FORMATION_LABEL,
  groupOf,
  InstructionsCard,
  PositionAndRole,
  shortPos,
  SlotMarker,
} from "../../components/tactics/pieces";
import { TeamShirt } from "../../components/ui/team-shirt";
import { shortNamesFor } from "../../lib/names";

type Held = { playerId: string; fromSlot: number | null } | null;

export function Tactics() {
  const { t } = useApp();
  const { career, setFormation, setMentality, setInstruction, setLineupSlot, setPlayerRole, setSlotFielded, setSlotPosition, autoPickLineup } = useCareer();
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
    pos: shortPos(s.position),
    group: groupOf(s.position),
    name: nameOf(s.player) ?? "—",
    title: s.player ? `${s.player.name} · ${s.player.overall}` : undefined,
    marker: <SlotMarker kit={kit} pos={shortPos(s.position)} overall={s.player?.overall} fitness={s.player ? s.player.fitness : undefined} />,
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
                kit={kit}
                position={p.position}
                name={short.get(p.playerId) ?? p.name}
                overall={p.overall}
                fitness={p.fitness}
                injured={p.injured}
                selected={held?.playerId === p.playerId}
                dragId={`bench:${p.playerId}`}
                title={`${p.name} · ${p.overall}`}
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
              <CardHeader><CardTitle>{shortPos(heldSlot.position)} · {nameOf(heldSlot.player)}</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Overall value={heldSlot.player.overall} />
                  <span className="text-fg-muted">{cap(heldSlot.player.position)}</span>
                  {heldSlot.player.injured && <Badge variant="gold">{t.out}</Badge>}
                </div>
                <PositionAndRole
                  fielded={heldSlot.position as Position}
                  role={heldSlot.role}
                  isGoalkeeper={heldSlot.player.position === "goalkeeper"}
                  onPosition={(p) => setSlotFielded(heldSlot.slot, p)}
                  onRole={(r) => heldSlot.player && setPlayerRole(heldSlot.player.playerId, r as RoleKey)}
                />
              </CardContent>
            </Card>
          )}

          <InstructionsCard values={v.instructions} onChange={setInstruction} />
        </div>
      </div>
    </div>
  );
}
