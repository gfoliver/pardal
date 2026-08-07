import { useState } from "react";
import { Formation, Mentality, type Position } from "@fut/domain";
import { tacticsDiagnostics, type TacticsPlayer } from "@fut/career";
import type { ClubKit } from "@fut/competition";
import type { ScreenId } from "../../layout/Shell";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import type { TacticsEditor } from "../../lib/tactics/editor";
import { Abbrev } from "../../components/ui/abbrev";
import { Confirm } from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { useFormat } from "../../lib/format";
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
import { TacticsDiagnosticsButton } from "../../components/tactics/Diagnostics";
import { LineupTable } from "../../components/tactics/LineupTable";
import { LineupList, IncomingSheet, SlotSheet } from "../../components/tactics/LineupList";
import { PlayerContextMenu } from "../../components/career/PlayerMenu";
import { shortNamesFor } from "../../lib/names";
import { ChevronDown, Move, Plus, Wand2 } from "lucide-react";
import { cn } from "../../lib/utils";

const MAX_TACTICS = 6;

/**
 * The prefix a bench/reserve card puts on its drag payload, so a drop can tell a card apart from a slot
 * index dragged off the pitch. The same convention the in-match board uses, because both boards drop
 * cards onto the same `Pitch`.
 */
const CARD_DRAG = "bench:";

/** Which of the three groups is shown below the xl breakpoint (all three show at once above it). */
type View = "starters" | "bench" | "reserves";

/**
 * The career's tactics screen: an editor built from career commands, handed to the board below.
 *
 * Thin on purpose. Everything visual lives in `TacticsBoard`, which knows nothing about careers — that is
 * what lets a multiplayer friendly show the same board over a tactic held in memory. The commands and
 * their order are untouched, so a save's command log is exactly what it was.
 */
export function Tactics({ onNavigate }: { onNavigate?: (s: ScreenId, param?: string) => void }) {
  const {
    career,
    setFormation,
    setMentality,
    setInstruction,
    setLineupSlot,
    setBenchSlot,
    setPlayerRole,
    setSlotFielded,
    setSlotPosition,
    autoPickLineup,
    createTactic,
    duplicateTactic,
    renameTactic,
    deleteTactic,
    selectTactic,
    applyPreset,
  } = useCareer();
  const view = career?.tacticsView();
  if (!career || !view) return null;
  const editor: TacticsEditor = {
    view,
    kits: career.snapshot().clubs[view.clubId]?.kits,
    fitAt: (id, position) => career.fitAt(id, position),
    setFormation,
    setMentality,
    setInstruction,
    setLineupSlot,
    setBenchSlot,
    setPlayerRole,
    setSlotFielded,
    setSlotPosition,
    applyPreset,
    autoPickLineup,
    saved: {
      select: selectTactic,
      create: () => createTactic(),
      duplicate: duplicateTactic,
      rename: renameTactic,
      remove: deleteTactic,
    },
  };
  return <TacticsBoard editor={editor} onNavigate={onNavigate} />;
}

/**
 * The board itself, over whatever holds the tactic.
 *
 * Reads `editor.view` and calls `editor`'s methods; it has no idea whether a change is being written to a
 * career's command log or to a friendly's in-memory tactic.
 */
export function TacticsBoard({
  editor,
  onNavigate,
}: {
  editor: TacticsEditor;
  onNavigate?: (s: ScreenId, param?: string) => void;
}) {
  const { t } = useApp();
  const {
    setFormation,
    setMentality,
    setInstruction,
    setLineupSlot,
    setBenchSlot,
    setPlayerRole,
    setSlotFielded,
    setSlotPosition,
    autoPickLineup,
    applyPreset,
  } = editor;
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  /** A substitute or squad player tapped for placing into the eleven. */
  const [incoming, setIncoming] = useState<TacticsPlayer | null>(null);
  /**
   * The player a card drag is carrying, or null.
   *
   * Held here rather than in the cards because every OTHER card, and the pitch, have to know: a drag
   * cannot read its own payload mid-flight (`dataTransfer.getData` is deliberately empty until the
   * drop), so the only way a target can say "this one is for me" before the cursor lands is for the
   * screen that started the drag to tell it.
   */
  const [dragging, setDragging] = useState<string | null>(null);
  const [moveMode, setMoveMode] = useState(false);
  const [view, setView] = useState<View>("starters");
  const { shortPos, posName } = usePosLabels();
  const v = editor.view;
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

  const kits = editor.kits;
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
        group={groupOf(s.position)}
        shirtNumber={s.player?.shirtNumber}
        overall={s.player?.overall}
        fitness={s.player ? s.player.fitness : undefined}
      />
    ),
  }));

  /**
   * A drag landing on a shirt, from either place it can start.
   *
   * `bench:<playerId>` is the payload a card sets — the same convention the in-match board already
   * uses — and a bare number is a slot index. Both end in `setLineupSlot`, which is where the two
   * meanings live: a man already in the eleven SWAPS with the target, and one from outside takes the
   * slot and pushes its occupant to the front of the bench. Reimplementing either here is how a side
   * ends up with ten men.
   */
  const dropOnSlot = (from: string, to: number | string) => {
    const toSlot = Number(to);
    if (from.startsWith(CARD_DRAG)) {
      setLineupSlot(toSlot, from.slice(CARD_DRAG.length));
      return;
    }
    const fromSlot = Number(from);
    if (Number.isFinite(fromSlot)) {
      const mover = v.slots[fromSlot]?.player;
      if (mover) setLineupSlot(toSlot, mover.playerId);
    }
  };

  /**
   * One card, in either panel, at its place in the ONE bench order behind them both.
   *
   * `index` counts across the substitutes and then the reserves, which is exactly what `setBenchSlot`
   * takes — so dropping a card on another card is one call whether the two are in the same panel or
   * not, and "promote a reserve", "demote a substitute" and "reorder" are the same gesture rather than
   * three features. A card refuses a shirt dragged off the pitch: a starter is not in that order, so
   * there is no place in it to put him, and lighting the card up would be a promise nothing keeps.
   */
  const benchCard = (p: TacticsPlayer, index: number, cardKit?: ClubKit) => (
    <BenchCard
      key={p.playerId}
      kit={cardKit}
      position={p.position}
      name={nameOf(p.playerId, p.name)}
      shirtNumber={p.shirtNumber}
      overall={p.overall}
      fitness={p.fitness}
      injured={p.injured}
      title={[`${p.name} · ${p.overall}`, alsoPlays(p)].filter(Boolean).join(" · ")}
      dragId={`${CARD_DRAG}${p.playerId}`}
      drag={dragging === null ? undefined : dragging === p.playerId ? "source" : "target"}
      onDragging={(d) => setDragging(d ? p.playerId : null)}
      onDropId={(from) => {
        if (from.startsWith(CARD_DRAG)) setBenchSlot(index, from.slice(CARD_DRAG.length));
      }}
      onSelect={() => setIncoming(p)}
      playerId={p.playerId}
      onNavigate={onNavigate}
    />
  );

  const definedFits = v.slots
    .map((s) => s.fit)
    .filter((f): f is number => f !== undefined);
  const avgFit =
    definedFits.length > 0
      ? definedFits.reduce((a, b) => a + b, 0) / definedFits.length
      : undefined;
  const activeTactic = v.tactics.find((tac) => tac.id === v.activeTacticId);

  /*
   * Computed here from the view rather than handed over by whoever owns the tactic, because the rules
   * turned out to need nothing but the view: `Career.tacticsDiagnostics` only ever read its own
   * `tacticsView()`, so extracting it left a pure function this board can call over `editor.view` in
   * either mode. An optional `diagnostics` member on `TacticsEditor` would have been two implementations
   * of the same list — and the friendly's would have been the one nobody wrote.
   */
  const diagnostics = tacticsDiagnostics(v);

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
        {/* Two readings of the side, in the treatment every stat on this board now uses: a caps
            caption over a tier-coloured tabular figure, so switching tactic cannot jog the layout. */}
        <div className="flex items-start gap-5">
          {activeTactic && (
            <div className="flex flex-col gap-0.5">
              <span className="caps text-fg-faint">{t.familiarity}</span>
              <span
                className="text-lg font-bold leading-none tabular-nums"
                style={{ color: familiarityColor(activeTactic.familiarity) }}
              >
                {Math.round(activeTactic.familiarity)}
              </span>
            </div>
          )}
          {/* Omitted, never zeroed: a friendly cannot measure fit at all and a nil average would read
              as an eleven of misfits. */}
          {avgFit !== undefined && (
            <div className="flex flex-col gap-0.5">
              <span className="caps text-fg-faint">{t.avgFit}</span>
              <span className="text-lg font-bold leading-none tabular-nums" style={{ color: fitColor(avgFit) }}>
                {Math.round(avgFit * 100)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/*
        Only where there are saved tactics to switch between. `editor.saved` is optional BY DESIGN — a
        friendly is one match with one shape — and this strip used to mount regardless, so its "+" and
        its rename/duplicate/delete menu were four controls that silently did nothing there.
      */}
      {editor.saved && (
        <TacticTabs
          tactics={v.tactics}
          activeTacticId={v.activeTacticId}
          onSelect={editor.saved.select}
          onCreate={editor.saved.create}
          onDuplicate={editor.saved.duplicate}
          onRename={editor.saved.rename}
          onDelete={editor.saved.remove}
        />
      )}

      <div className="flex items-center gap-2 sm:justify-between sm:gap-3">
        <div className="flex items-center gap-2">
          {/* Occasional tools: the label is worth its width on a desktop, and on a
              phone the icon carries it — reachable in one tap either way rather
              than buried in a menu. The diagnostics icon is the exception and has
              no label at any width: its COLOUR is the whole message. */}
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
          <TacticsDiagnosticsButton diagnostics={diagnostics} nameOf={nameOf} onSelectSlot={setOpenSlot} />
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
        fitAt={editor.fitAt}
        onNavigate={onNavigate}
      />

      <IncomingSheet
        slots={v.slots}
        player={incoming}
        onClose={() => setIncoming(null)}
        nameOf={nameOf}
        onSwap={setLineupSlot}
        fitAt={editor.fitAt}
        onNavigate={onNavigate}
      />

      {/* Pitch + substitutes on the left; the starters card + rest of the squad on the right, in a
          1 : 1.5 split — the eleven is read as a NINE-COLUMN TABLE and the pitch is read as a shape, so
          the table is the one that gets the width. Both tracks are `minmax(0,…)` and not a bare `1fr`,
          which IS `minmax(auto,1fr)`: the widest thing in a track would then raise that track's floor and
          the ratio would quietly stop holding — a nine-column table and a grid of bench cards are both
          exactly that kind of child. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className={cn("min-w-0", view === "starters" ? "block" : "hidden xl:block")}>
          <Card>
            <CardContent className="p-3 sm:p-4">
              {/* The pitch fills its track, EXCEPT that it is never taller than 65vh — which is what
                  the cap is: 3/4 of that height, because `Pitch` is 3:4. Without it the shape follows
                  the track without limit, and on a 2560px window a 1fr track is ~890px wide, so the
                  pitch alone would be ~1190px tall and the eleven would not fit on screen. Centred, so
                  the capped shape sits in the middle of the card instead of hugging one edge. */}
              <div className="mx-auto max-w-[calc(65vh*3/4)]">
                <Pitch
                  spots={spots}
                  editable
                  onSelect={(id) => setOpenSlot(Number(id))}
                  onDropOnSpot={dropOnSlot}
                  moveMode={moveMode}
                  // Every slot is a legal landing for a card, so every slot says so while one is in
                  // the air — the drop itself decides whether he swaps or displaces.
                  receiving={dragging !== null}
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
                {/* The table needs ~790px for its nine columns — it pins the position and the name
                    and scrolls the rest under them — so below md it is a card list with a drawer
                    instead: same eleven, same edits, nothing off the edge. */}
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
          {/*
            THE COLUMN COUNT IS THE PANEL'S, NOT THE WINDOW'S, and the TRACK IS FIXED rather than
            `minmax(…,1fr)`.
              - The count comes from the container because this panel lives in a track that is 40% of the
                content width: `sm:grid-cols-3 lg:grid-cols-4` were viewport breakpoints, so at `lg` they
                fitted four cards into a column sized for one about 2.5× wider and the cards burst.
              - The track is `3.5rem` flat because a `BenchCard` is now a FIXED 56px chip, not a fluid
                card. In a `minmax(3.5rem,1fr)` track the leftover width is shared out and every column
                stretches — which would draw the same player 64px wide here and 61px wide in the reserves
                panel beside it, since the two tracks are 1fr and 1.5fr. `repeat(auto-fill,3.5rem)` asks
                for as many 56px columns as fit and lets the remainder sit at the end of the row.
            2 cards abreast became 5 at 1280 and 9 at 1920 in this panel, and 5 at 375 on a phone.
          */}
          <CardContent className="grid grid-cols-[repeat(auto-fill,3.5rem)] gap-1.5">
            {v.bench.length === 0 && (
              <p className="col-span-full rounded-lg border border-dashed border-border py-10 text-center text-sm text-fg-muted">
                {t.tacNoSubs}
              </p>
            )}
            {v.bench.map((p, i) => benchCard(p, i, kit))}
          </CardContent>
        </Card>

        <Card className={cn("min-w-0", view === "reserves" ? "block" : "hidden xl:block")}>
          <CardHeader>
            <CardTitle>
              {t.squadOut} · {v.reserves.length}
            </CardTitle>
          </CardHeader>
          {/* Kit 2 for the players outside the 18 — the shirt itself says at a
              glance who is dressed for the match and who is not.

              The SAME grid as the substitutes above, character for character, and for the same reason it
              always was: two panels onto ONE ordered list must not be laid out differently. See the note
              there for why the count comes from the container and why the track is a fixed width. This
              panel sits in the 1.5fr track, so it fits more per row — same card, more of them. */}
          <CardContent className="grid grid-cols-[repeat(auto-fill,3.5rem)] gap-1.5">
            {v.reserves.length === 0 && (
              <p className="col-span-full rounded-lg border border-dashed border-border py-10 text-center text-sm text-fg-muted">
                {t.tacNoReserves}
              </p>
            )}
            {/* The index continues through the substitutes, because there is one bench order and this
                panel is its tail — see `benchCard`. */}
            {v.reserves.map((p, i) => benchCard(p, v.bench.length + i, kits?.away))}
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
  const fmt = useFormat();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  /**
   * The tactic the delete item was chosen for.
   *
   * A shape, its per-player roles and every slider, thrown away by one pick from a dropdown that also
   * holds "rename" and "duplicate" — three items where the harmless two sit above the one that
   * destroys work.
   */
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

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
            {/*
              `modal={false}` is load-bearing, not a preference — the same trap `PlayerMenu` documents.
              A modal Radix menu puts `pointer-events: none` on `<body>` while it is open; picking
              "delete" closes the menu and opens a dialog in the same tick, both holding that lock, and
              on the way out one restores it while the other does not. Measured with this menu still
              modal: after cancelling, `document.body.style.pointerEvents` stayed `"none"` with nothing
              mounted — the whole app unclickable until a reload.
            */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex items-center border-l px-1",
                    active
                      ? "border-[var(--primary-line)] text-primary"
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
                  onSelect={() => setDeleting({ id: tac.id, name: tac.name })}
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

      <Confirm
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t.deleteTactic}
        body={fmt.t(t.confirmDeleteTacticBody, { name: deleting?.name ?? "" })}
        confirmLabel={t.deleteAction}
        cancelLabel={t.cancel}
        danger
        onConfirm={() => {
          if (deleting) onDelete(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}
