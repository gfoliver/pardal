import { useState } from "react";
import { Formation, Mentality, type Position } from "@fut/domain";
import type { TacticsPlayer } from "@fut/career";
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
import { LineupList, IncomingSheet, SlotSheet } from "../../components/tactics/LineupList";
import { PlayerContextMenu } from "../../components/career/PlayerMenu";
import { shortNamesFor } from "../../lib/names";
import { ChevronDown, Move, Plus, Wand2 } from "lucide-react";
import { cn } from "../../lib/utils";

const MAX_TACTICS = 6;

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
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  /** A substitute or squad player tapped for placing into the eleven. */
  const [incoming, setIncoming] = useState<TacticsPlayer | null>(null);
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
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {t.tacticsTitle}
          </h1>
          {/* The static description is furniture on a phone; the two HINTS are
              live feedback on what your last tap did, so they show at every size. */}
          <p className={cn("text-sm text-fg-muted", !moveMode && "hidden sm:block")}>
            {moveMode ? t.movePositionsHint : t.tacticsSubtitle}
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

      <div className="flex items-center gap-2 sm:justify-between sm:gap-3">
        <div className="flex items-center gap-2">
          {/* Occasional tools: the label is worth its width on a desktop, and on a
              phone the icon carries it — reachable in one tap either way rather
              than buried in a menu. */}
          <Button
            variant={moveMode ? "primary" : "ghost"}
            size="icon"
            className="sm:hidden"
            aria-label={t.movePositions}
            onClick={() => {
              setMoveMode((m) => !m);
            }}
          >
            <Move />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="sm:hidden"
            aria-label={t.autoPick}
            onClick={() => {
              autoPickLineup();
            }}
          >
            <Wand2 />
          </Button>
          <Button
            variant={moveMode ? "primary" : "ghost"}
            className="hidden sm:inline-flex"
            onClick={() => {
              setMoveMode((m) => !m);
            }}
          >
            {t.movePositions}
          </Button>
          <Button
            variant="secondary"
            className="hidden sm:inline-flex"
            onClick={() => {
              autoPickLineup();
            }}
          >
            {t.autoPick}
          </Button>
        </div>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(x) => x && setView(x as View)}
          className="min-w-0 flex-1 sm:w-auto sm:flex-none xl:hidden"
        >
          <ToggleGroupItem value="starters" accent className="flex-1 sm:flex-none">
            {t.starters}
          </ToggleGroupItem>
          <ToggleGroupItem value="bench" accent className="flex-1 sm:flex-none">
            {t.reservesTitle}
          </ToggleGroupItem>
          <ToggleGroupItem value="reserves" accent className="flex-1 sm:flex-none">
            {t.squadOut}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Pitch + substitutes on the left; the starters card + rest of the squad
          on the right. The pitch column is sized to the pitch itself (3:4 of its
          own height) rather than stretching, so the card hugs the shape. */}
      <SlotSheet
        slots={v.slots}
        openSlot={openSlot}
        onClose={() => setOpenSlot(null)}
        bench={v.bench}
        reserves={v.reserves}
        nameOf={nameOf}
        onChangeRole={setPlayerRole}
        onChangePosition={setSlotFielded}
        onSwap={setLineupSlot}
        fitAt={(id, position) => career.fitAt(id, position)}
        onNavigate={onNavigate}
      />

      <IncomingSheet
        slots={v.slots}
        player={incoming}
        onClose={() => setIncoming(null)}
        nameOf={nameOf}
        onSwap={setLineupSlot}
        fitAt={(id, position) => career.fitAt(id, position)}
        onNavigate={onNavigate}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[auto_minmax(0,1fr)]">
        <div className={cn("min-w-0", view === "starters" ? "block" : "hidden xl:block")}>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="max-w-full">
                <Pitch
                  spots={spots}
                  editable
                  onSelect={(id) => setOpenSlot(Number(id))}
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
        <Card className={cn("min-w-0", view === "starters" ? "block" : "hidden xl:block")}>
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
                {/* The table needs 721px for its eight columns, so below md it is a
                    list with a drawer instead — same eleven, same edits, no
                    horizontal scroll. */}
                <div className="hidden md:block">
                  <LineupTable
                    slots={v.slots}
                    nameOf={nameOf}
                    onSelectSlot={setOpenSlot}
                    onChangeRole={setPlayerRole}
                    onChangePosition={setSlotFielded}
                    onNavigate={onNavigate}
                  />
                </div>
                <div className="md:hidden">
                  <LineupList slots={v.slots} nameOf={nameOf} onOpenSlot={setOpenSlot} />
                </div>
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

        <Card className={cn("min-w-0", view === "bench" ? "block" : "hidden xl:block")}>
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
                selected={false}
                title={[`${p.name} · ${p.overall}`, alsoPlays(p)].filter(Boolean).join(" · ")}
                onSelect={() => setIncoming(p)}
                playerId={p.playerId}
                onNavigate={onNavigate}
              />
            ))}
          </CardContent>
        </Card>

        <Card className={cn("min-w-0", view === "reserves" ? "block" : "hidden xl:block")}>
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
                selected={false}
                title={[`${p.name} · ${p.overall}`, alsoPlays(p)].filter(Boolean).join(" · ")}
                onSelect={() => setIncoming(p)}
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
