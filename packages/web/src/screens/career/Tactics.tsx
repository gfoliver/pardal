import { useState } from "react";
import { Formation, Mentality, type Position } from "@fut/domain";
import type { ScreenId } from "../../layout/Shell";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Abbrev } from "../../components/ui/abbrev";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Input, Label } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { Pitch, type PitchSpot } from "../../components/pitch";
import {
  BenchCard,
  familiarityColor,
  fitColor,
  FORMATION_LABEL,
  groupOf,
  InstructionsCard,
  MentalityToggle,
  PresetPicker,
  usePosLabels,
  SlotMarker,
} from "../../components/tactics/pieces";
import { LineupTable } from "../../components/tactics/LineupTable";
import { PlayerContextMenu } from "../../components/career/PlayerMenu";
import { shortNamesFor } from "../../lib/names";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "../../lib/utils";

const MAX_TACTICS = 6;

/** A single selection, whichever of the three lists (or the pitch) it came from. */
type Held =
  | { kind: "xi"; slot: number; playerId: string }
  | { kind: "bench"; index: number; playerId: string }
  | { kind: "reserve"; playerId: string }
  | null;

/** Which of the three groups is shown below the xl breakpoint (all three show at once above it). */
type View = "starters" | "bench" | "reserves";

export function Tactics({ onNavigate }: { onNavigate?: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const {
    career,
    setFormation,
    setMentality,
    setInstruction,
    setLineupSlot,
    setPlayerRole,
    setSlotFielded,
    setSlotPosition,
    setBenchSlot,
    autoPickLineup,
    createTactic,
    duplicateTactic,
    renameTactic,
    deleteTactic,
    selectTactic,
    applyPreset,
  } = useCareer();
  const [held, setHeld] = useState<Held>(null);
  const [moveMode, setMoveMode] = useState(false);
  const [view, setView] = useState<View>("starters");
  const { shortPos, posName } = usePosLabels();
  if (!career) return null;
  const v = career.tacticsView();
  if (!v) return null;
  // Lineups read better with common names ("Bernabei", not "Alexandro Bernabei").
  const short = shortNamesFor([
    ...v.slots
      .map((s) => s.player)
      .filter((p): p is NonNullable<typeof p> => Boolean(p)),
    ...v.bench,
    ...v.reserves,
  ]);
  const nameOf = (playerId: string, fallback: string) =>
    short.get(playerId) ?? fallback;
  const nameOfPlayer = (p?: { playerId: string; name: string }) =>
    p ? nameOf(p.playerId, p.name) : undefined;

  const sameTarget = (a: NonNullable<Held>, b: NonNullable<Held>): boolean => {
    if (a.kind !== b.kind) return false;
    if (a.kind === "xi" && b.kind === "xi") return a.slot === b.slot;
    if (a.kind === "bench" && b.kind === "bench") return a.index === b.index;
    return (
      a.kind === "reserve" && b.kind === "reserve" && a.playerId === b.playerId
    );
  };

  /**
   * One tap picks a player up (from the pitch, the substitutes, or the rest of
   * the squad); the next tap resolves the pair — swap two starters, promote a
   * substitute or reserve into the XI, promote a reserve onto the bench, or
   * swap two substitutes' slots. Which command runs depends only on WHICH TWO
   * lists the pair spans, not on which was tapped first.
   */
  const select = (next: NonNullable<Held>) => {
    if (!held) {
      setHeld(next);
      return;
    }
    if (sameTarget(held, next)) {
      setHeld(null);
      return;
    } // tap the same one again → cancel
    if (held.kind === "reserve" && next.kind === "reserve") {
      setHeld(next);
      return;
    } // nothing to swap; just re-pick
    const xi = held.kind === "xi" ? held : next.kind === "xi" ? next : null;
    if (xi) {
      const other = held.kind === "xi" ? next : held;
      setLineupSlot(xi.slot, other.playerId);
    } else {
      const bench =
        held.kind === "bench"
          ? held
          : (next as Extract<NonNullable<Held>, { kind: "bench" }>);
      const other = held.kind === "bench" ? next : held;
      setBenchSlot(bench.index, other.playerId);
    }
    setHeld(null);
  };

  const tapSlot = (slot: number) => {
    const playerId = v.slots[slot]?.player?.playerId;
    if (!held && !playerId) return; // nothing to pick up, and no target needed
    select({ kind: "xi", slot, playerId: playerId ?? "" });
  };
  const tapBench = (index: number, playerId: string) =>
    select({ kind: "bench", index, playerId });
  const tapReserve = (playerId: string) =>
    select({ kind: "reserve", playerId });

  const kits = career.snapshot().clubs[v.clubId]?.kits;
  const kit = kits?.home;

  /** "Also plays: Winger, Central midfielder" — omitted when there is nothing to add. */
  const alsoPlays = (p?: { secondaryPositions: readonly string[] }) =>
    p && p.secondaryPositions.length > 0
      ? `${t.alsoPlays}: ${p.secondaryPositions.map((x) => posName(x as Position)).join(", ")}`
      : undefined;

  const spots: PitchSpot[] = v.slots.map((s) => ({
    id: s.slot,
    x: s.width * 100,
    y: 100 - s.depth * 100,
    pos: shortPos(s.position),
    group: groupOf(s.position),
    name: nameOfPlayer(s.player) ?? "—",
    title: s.player
      ? [`${s.player.name} · ${s.player.overall}`, posName(s.player.position as Position), alsoPlays(s.player)]
          .filter(Boolean)
          .join(" · ")
      : undefined,
    marker: (
      <SlotMarker
        kit={kit}
        pos={shortPos(s.position)}
        overall={s.player?.overall}
        fitness={s.player ? s.player.fitness : undefined}
      />
    ),
  }));

  // Drag one shirt onto another to swap their XI slots.
  const dropOnSlot = (from: string, to: number | string) => {
    const toSlot = Number(to);
    const fromSlot = Number(from);
    if (Number.isFinite(fromSlot)) {
      const mover = v.slots[fromSlot]?.player;
      if (mover) setLineupSlot(toSlot, mover.playerId);
    }
    setHeld(null);
  };

  const definedFits = v.slots
    .map((s) => s.fit)
    .filter((f): f is number => f !== undefined);
  const avgFit =
    definedFits.length > 0
      ? definedFits.reduce((a, b) => a + b, 0) / definedFits.length
      : undefined;
  const activeTactic = v.tactics.find((tac) => tac.id === v.activeTacticId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t.tacticsTitle}
          </h1>
          <p className="text-sm text-fg-muted">
            {moveMode
              ? t.movePositionsHint
              : held
                ? t.selectPlayerHint
                : t.tacticsSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {activeTactic && (
            <span className="flex items-center gap-1.5 text-xs text-fg-muted">
              {t.familiarity}
              <span
                className="font-bold tabular-nums"
                style={{ color: familiarityColor(activeTactic.familiarity) }}
              >
                {Math.round(activeTactic.familiarity)}
              </span>
            </span>
          )}
          {avgFit !== undefined && (
            <span className="flex items-center gap-1.5 text-xs text-fg-muted">
              {t.avgFit}
              <span
                className="font-bold tabular-nums"
                style={{ color: fitColor(avgFit) }}
              >
                {Math.round(avgFit * 100)}
              </span>
            </span>
          )}
        </div>
      </div>

      <TacticTabs
        tactics={v.tactics}
        activeTacticId={v.activeTacticId}
        onSelect={selectTactic}
        onCreate={() => createTactic()}
        onDuplicate={(id) => duplicateTactic(id)}
        onRename={renameTactic}
        onDelete={deleteTactic}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant={moveMode ? "primary" : "ghost"}
            onClick={() => {
              setMoveMode((m) => !m);
              setHeld(null);
            }}
          >
            {t.movePositions}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              autoPickLineup();
              setHeld(null);
            }}
          >
            {t.autoPick}
          </Button>
        </div>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(x) => x && setView(x as View)}
          className="xl:hidden"
        >
          <ToggleGroupItem value="starters" accent>
            {t.starters}
          </ToggleGroupItem>
          <ToggleGroupItem value="bench" accent>
            {t.reservesTitle}
          </ToggleGroupItem>
          <ToggleGroupItem value="reserves" accent>
            {t.squadOut}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Pitch + substitutes on the left; the starters card + rest of the squad
          on the right. The pitch column is sized to the pitch itself (3:4 of its
          own height) rather than stretching, so the card hugs the shape. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[auto_minmax(0,1fr)]">
        <div className={cn(view === "starters" ? "block" : "hidden xl:block")}>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="max-w-full">
                <Pitch
                  spots={spots}
                  editable
                  selectedId={held?.kind === "xi" ? held.slot : null}
                  onSelect={(id) => tapSlot(Number(id))}
                  onDropOnSpot={dropOnSlot}
                  moveMode={moveMode}
                  onMoveSpot={(id, x, y) =>
                    setSlotPosition(Number(id), (100 - y) / 100, x / 100)
                  }
                  // Right-click a shirt for the player's actions and a route to
                  // his profile — the pitch was the one place on this screen with
                  // no way through to the man you were looking at.
                  wrapSpot={(spot, rendered) => {
                    const playerId = v.slots[Number(spot.id)]?.player?.playerId;
                    return playerId ? (
                      <PlayerContextMenu playerId={playerId} context="tactics" onNavigate={onNavigate}>
                        {rendered}
                      </PlayerContextMenu>
                    ) : (
                      rendered
                    );
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* One card beside the pitch, two tabs deep: the eleven, or the settings
            that shape them. They swap in place so the pitch never moves. */}
        <Card className={cn(view === "starters" ? "block" : "hidden xl:block")}>
          <Tabs defaultValue="lineup">
            <CardHeader className="pb-0">
              <TabsList>
                <TabsTrigger value="lineup">
                  {t.lineupTab} · {v.slots.filter((s) => s.player).length}/11
                </TabsTrigger>
                <TabsTrigger value="tactics">{t.tacticsTab}</TabsTrigger>
              </TabsList>
            </CardHeader>

            <TabsContent value="lineup">
              <CardContent>
                <LineupTable
                  slots={v.slots}
                  nameOf={nameOf}
                  selectedSlot={held?.kind === "xi" ? held.slot : null}
                  onSelectSlot={tapSlot}
                  onChangeRole={setPlayerRole}
                  onChangePosition={setSlotFielded}
                  onNavigate={onNavigate}
                />
              </CardContent>
            </TabsContent>

            <TabsContent value="tactics">
              <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
                <div className="flex flex-1 flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label>{t.formation}</Label>
                    <Select
                      value={v.formation}
                      onValueChange={(x) => setFormation(x as Formation)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(Formation).map((f) => (
                          <SelectItem key={f} value={f}>
                            {FORMATION_LABEL[f] ?? f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>{t.mentality}</Label>
                    <MentalityToggle
                      value={v.mentality}
                      onChange={(m) => setMentality(m as Mentality)}
                    />
                  </div>
                  <PresetPicker
                    mentality={v.mentality}
                    instructions={v.instructions}
                    onApply={applyPreset}
                  />
                </div>
                <div className="flex-1">
                  <InstructionsCard
                    values={v.instructions}
                    onChange={setInstruction}
                    bare
                  />
                </div>
              </CardContent>
            </TabsContent>
          </Tabs>
        </Card>

        <Card className={cn(view === "bench" ? "block" : "hidden xl:block")}>
          <CardHeader>
            <CardTitle>
              {t.reservesTitle} · {v.bench.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {v.bench.map((p, i) => (
              <BenchCard
                key={p.playerId}
                kit={kit}
                position={p.position}
                name={nameOf(p.playerId, p.name)}
                overall={p.overall}
                fitness={p.fitness}
                injured={p.injured}
                selected={held?.kind === "bench" && held.playerId === p.playerId}
                title={[`${p.name} · ${p.overall}`, alsoPlays(p)].filter(Boolean).join(" · ")}
                onSelect={() => tapBench(i, p.playerId)}
                playerId={p.playerId}
                onNavigate={onNavigate}
              />
            ))}
          </CardContent>
        </Card>

        <Card className={cn(view === "reserves" ? "block" : "hidden xl:block")}>
          <CardHeader>
            <CardTitle>
              {t.squadOut} · {v.reserves.length}
            </CardTitle>
          </CardHeader>
          {/* Kit 2 for the players outside the 18 — the shirt itself says at a
              glance who is dressed for the match and who is not. */}
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {v.reserves.map((p) => (
              <BenchCard
                key={p.playerId}
                kit={kits?.away}
                position={p.position}
                name={nameOf(p.playerId, p.name)}
                overall={p.overall}
                fitness={p.fitness}
                injured={p.injured}
                selected={held?.kind === "reserve" && held.playerId === p.playerId}
                title={[`${p.name} · ${p.overall}`, alsoPlays(p)].filter(Boolean).join(" · ")}
                onSelect={() => tapReserve(p.playerId)}
                playerId={p.playerId}
                onNavigate={onNavigate}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Tactic-tabs strip: pick, rename (dialog), duplicate, delete — capped at 6. */
function TacticTabs({
  tactics,
  activeTacticId,
  onSelect,
  onCreate,
  onDuplicate,
  onRename,
  onDelete,
}: {
  tactics: readonly {
    id: string;
    name: string;
    formation: Formation;
    familiarity: number;
  }[];
  activeTacticId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useApp();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [name, setName] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tactics.map((tac) => {
        const active = tac.id === activeTacticId;
        return (
          <div
            key={tac.id}
            className={cn(
              "flex items-stretch overflow-hidden rounded-md border",
              active
                ? "border-primary bg-primary-soft"
                : "border-border bg-surface-2",
            )}
          >
            <button
              onClick={() => onSelect(tac.id)}
              className={cn(
                "flex items-center gap-2 px-2.5 py-1.5 text-sm font-medium",
                active ? "text-primary" : "text-fg-muted hover:text-fg",
              )}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ background: familiarityColor(tac.familiarity) }}
              />
              {tac.name}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex items-center border-l px-1",
                    active
                      ? "border-primary/30 text-primary"
                      : "border-border text-fg-faint hover:text-fg",
                  )}
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onSelect={() => {
                    setName(tac.name);
                    setRenamingId(tac.id);
                  }}
                >
                  {t.renameTactic}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={tactics.length >= MAX_TACTICS}
                  onSelect={() => onDuplicate(tac.id)}
                >
                  {t.duplicateTactic}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={tactics.length <= 1}
                  onSelect={() => onDelete(tac.id)}
                >
                  {t.deleteTactic}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
      {tactics.length < MAX_TACTICS && (
        <Abbrev full={t.newTactic} asChild>
          <Button variant="ghost" size="icon-sm" onClick={onCreate}>
            <Plus />
          </Button>
        </Abbrev>
      )}

      <Dialog
        open={renamingId !== null}
        onOpenChange={(open) => !open && setRenamingId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.renameTactic}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-1.5">
            <Label>{t.tacticName}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenamingId(null)}>
              {t.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (renamingId) onRename(renamingId, name);
                setRenamingId(null);
              }}
            >
              {t.renameTactic}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
