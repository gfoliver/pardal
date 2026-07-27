import { useState } from "react";
import { Formation, MarkingScheme, Mentality, Position, type Team } from "@fut/domain";
import type { StoredInstructions } from "@fut/career";
import type { ClubKit } from "@fut/competition";
import type { AgentShape } from "@fut/spatial";
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
  usePosLabels,
  SlotMarker,
} from "../../components/tactics/pieces";
import { shortNamesFor } from "../../lib/names";
import type { SpatialController } from "../../hooks/useSpatialMatch";

/** A held selection: a player on the pitch, or one waiting on the bench. */
type Held = { id: string; from: "pitch" | "bench" } | null;

/**
 * The full tactics board, live. Same controls as the squad-tactics screen —
 * shape on the pitch, formation, manual cells, roles and every slider — but read
 * from and applied to the RUNNING match: fitness is what's left in the legs
 * right now, and personnel changes cost a substitution.
 *
 * Changes here last for this match only; the club's stored tactics are untouched.
 */
export function MatchTactics({
  live,
  team,
  kit,
  minute,
  score,
  onClose,
}: {
  live: SpatialController;
  team: Team;
  kit: ClubKit;
  minute: number;
  score: { home: number; away: number };
  onClose: () => void;
}) {
  const { t } = useApp();
  const { shortPos, posName } = usePosLabels();
  const { career } = useCareer();
  const [held, setHeld] = useState<Held>(null);
  const [moveMode, setMoveMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const shape = live.shape(team.id);
  const benchPlayers = live.bench(team.id);
  const subsLeft = live.subsRemaining(team.id);
  const instructions = live.instructions(team.id);

  // Bench condition/rating come from the career (the engine has no body for a
  // player who hasn't come on yet).
  const squad = career?.tacticsView(team.id);
  const squadById = new Map(
    [...(squad?.slots ?? []).map((s) => s.player).filter((p): p is NonNullable<typeof p> => Boolean(p)), ...(squad?.bench ?? [])]
      .map((p) => [p.playerId, p]),
  );
  const short = shortNamesFor([...shape.map((p) => ({ playerId: p.id, name: p.name })), ...benchPlayers.map((p) => ({ playerId: p.id, name: p.name }))]);
  const nameOf = (id: string, fallback: string) => short.get(id) ?? fallback;

  /** Place a bench player on the pitch for an on-pitch one (costs a sub). */
  const trySub = (outId: string, inId: string) => {
    if (subsLeft <= 0) return;
    live.substitute(team.id, outId, inId);
    setHeld(null);
    setSelectedId(inId);
  };

  const tapPitch = (id: string) => {
    if (!held) {
      setHeld({ id, from: "pitch" });
      setSelectedId(id);
      return;
    }
    if (held.id === id) { setHeld(null); return; } // tap again → cancel
    if (held.from === "bench") trySub(id, held.id);
    else {
      live.swapPlayers(held.id, id);
      setHeld(null);
      setSelectedId(id);
    }
  };

  const tapBench = (id: string) => {
    if (!held) { setHeld({ id, from: "bench" }); return; }
    if (held.id === id) { setHeld(null); return; }
    if (held.from === "pitch") trySub(held.id, id);
    else setHeld({ id, from: "bench" });
  };

  const spots: PitchSpot[] = shape.map((p) => ({
    id: p.id,
    x: p.width * 100,
    y: 100 - p.depth * 100,
    pos: shortPos(p.fielded),
    group: groupOf(p.fielded),
    name: nameOf(p.id, p.name),
    title: `${p.name} · ${p.overall} · ${Math.round(p.stamina * 100)}%`,
    marker: (
      <SlotMarker
        kit={kit}
        pos={shortPos(p.fielded)}
        overall={p.overall}
        fitness={p.stamina * 100}
        booked={p.booked}
      />
    ),
  }));

  /** Drop a shirt on a shirt = swap; drop a bench card on a shirt = substitution. */
  const dropOnSpot = (from: string, to: number | string) => {
    const toId = String(to);
    if (from.startsWith("bench:")) trySub(toId, from.slice(6));
    else if (from !== toId) live.swapPlayers(from, toId);
    setHeld(null);
  };

  const selected: AgentShape | undefined = shape.find((p) => p.id === selectedId);

  // The engine's instructions carry the sliders the board edits; formation and
  // mentality get their own controls above them.
  const sliderValues: StoredInstructions = {
    tempo: instructions?.tempo ?? 0.5,
    pressing: instructions?.pressing ?? 0.5,
    lineHeight: instructions?.lineHeight ?? 0.5,
    width: instructions?.width ?? 0.5,
    directness: instructions?.directness ?? 0.5,
    markingScheme: instructions?.markingScheme ?? MarkingScheme.Zonal,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.matchTactics}</h1>
          <p className="text-sm text-fg-muted">{moveMode ? t.movePositionsHint : t.matchTacticsHint}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="primary">{minute}'</Badge>
          <span className="serif text-xl font-bold tabular-nums">{score.home} : {score.away}</span>
          <Badge variant={subsLeft > 0 ? "muted" : "gold"}>{t.subsLeft}: {subsLeft}</Badge>
          <Button variant={moveMode ? "primary" : "ghost"} onClick={() => { setMoveMode((m) => !m); setHeld(null); }}>{t.movePositions}</Button>
          <Button variant="primary" onClick={onClose}>{t.resumeMatch}</Button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader><CardTitle>{t.onPitch} · {shape.length}</CardTitle></CardHeader>
          <CardContent className="p-3 sm:p-4">
            <div className="mx-auto max-w-md">
              <Pitch
                spots={spots}
                editable
                selectedId={held?.from === "pitch" ? held.id : null}
                onSelect={(id) => tapPitch(String(id))}
                onDropOnSpot={dropOnSpot}
                moveMode={moveMode}
                onMoveSpot={(id, x, y) => live.movePlayer(String(id), (100 - y) / 100, x / 100)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-start-1 lg:row-start-2">
          <CardHeader><CardTitle>{t.bench} · {benchPlayers.length}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {benchPlayers.length === 0 && <p className="text-sm text-fg-muted">{t.noSubsLeft}</p>}
            {benchPlayers.map((p) => {
              const info = squadById.get(p.id);
              return (
                <BenchCard
                  key={p.id}
                  kit={kit}
                  position={p.position}
                  name={nameOf(p.id, p.name)}
                  overall={info?.overall ?? 0}
                  fitness={info?.fitness ?? 100}
                  injured={info?.injured}
                  selected={held?.from === "bench" && held.id === p.id}
                  disabled={subsLeft <= 0}
                  dragId={`bench:${p.id}`}
                  title={`${p.name}${info ? ` · ${info.overall}` : ""}`}
                  onSelect={() => tapBench(p.id)}
                />
              );
            })}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Card>
            <CardHeader><CardTitle>{t.matchSetup}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>{t.formation}</Label>
                <Select value={instructions?.formation} onValueChange={(x) => live.setFormation(team.id, x as Formation)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.values(Formation).map((f) => <SelectItem key={f} value={f}>{FORMATION_LABEL[f] ?? f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t.mentality}</Label>
                <Select value={instructions?.mentality} onValueChange={(x) => live.setInstruction(team.id, { mentality: x as Mentality })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.values(Mentality).map((m) => <SelectItem key={m} value={m}>{cap(m)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <p className="text-2xs text-fg-faint">{t.tacticChangeHint}</p>
            </CardContent>
          </Card>

          {selected && (
            <Card>
              <CardHeader><CardTitle>{shortPos(selected.fielded)} · {nameOf(selected.id, selected.name)}</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Overall value={selected.overall} />
                  <span className="text-fg-muted">{posName(selected.position)}</span>
                  {Boolean(selected.booked) && <Badge variant="gold">{selected.booked}×</Badge>}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-fg-muted">
                    <span>{t.condition}</span>
                    <span className="tabular-nums">{Math.round(selected.stamina * 100)}</span>
                  </div>
                  <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.round(selected.stamina * 100)}%`, background: selected.stamina > 0.66 ? "var(--pos-mid)" : selected.stamina > 0.33 ? "var(--gold)" : "var(--danger)" }}
                    />
                  </span>
                </div>
                <PositionAndRole
                  fielded={selected.fielded}
                  role={selected.roleKey}
                  isGoalkeeper={selected.isGoalkeeper}
                  onPosition={(p) => live.setFieldedPosition(selected.id, p)}
                  onRole={(r) => live.setRole(selected.id, r)}
                />
              </CardContent>
            </Card>
          )}

          <InstructionsCard values={sliderValues} onChange={(patch) => live.setInstruction(team.id, patch)} />
        </div>
      </div>
    </div>
  );
}
