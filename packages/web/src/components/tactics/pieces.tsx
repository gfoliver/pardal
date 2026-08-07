import { useState, type ReactNode } from "react";
import { Formation, MarkingScheme, Mentality } from "@fut/domain";
import { matchPreset, TACTIC_PRESETS, type StoredInstructions, type TacticPresetKey } from "@fut/career";
import type { ClubKit } from "@fut/competition";
import { useApp } from "../../app/AppProviders";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Slider } from "../ui/slider";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { TeamShirt } from "../ui/team-shirt";
import { Abbrev } from "../ui/abbrev";
import { PlayerContextMenu } from "../career/PlayerMenu";
import { InjuryMark } from "../match/InjuryMark";
import type { ScreenId } from "../../layout/Shell";
import type { PosGroup } from "../../lib/engine/world";
import { groupColorVar } from "../../util/pos";
import { GROUP, cap, groupOf, shortPosFallback, useLabels } from "../../lib/labels";
import { tierColor, tierFill } from "../../lib/ratings";
import { cn } from "../../lib/utils";
import type { UIStringKey } from "../../i18n/strings";

/**
 * The pieces a tactics board is built from — shared by the squad-tactics screen
 * and the in-match one so a shape looks and behaves the same in both, whether
 * the numbers come from stored tactics or from a running match.
 */

export const FORMATION_LABEL: Record<string, string> = {
  [Formation.F442]: "4-4-2", [Formation.F442Diamond]: "4-4-2 ◇", [Formation.F433]: "4-3-3", [Formation.F4231]: "4-2-3-1",
  [Formation.F424]: "4-2-4", [Formation.F352]: "3-5-2", [Formation.F532]: "5-3-2", [Formation.F343]: "3-4-3", [Formation.F541]: "5-4-1",
};

// Labels live in `lib/labels` — the single dictionary every screen shares.
// Re-exported here so the tactics components keep their existing imports.
export { GROUP, groupOf, cap };
export const usePosLabels = useLabels;
export const shortPos = shortPosFallback;

/** Condition bar colour (shared by pitch markers and bench cards). */
export const fitnessColor = (fit: number) => (fit > 66 ? "var(--pos-mid)" : fit > 33 ? "var(--gold)" : "var(--danger)");
export const clampFit = (fit: number) => Math.max(0, Math.min(100, fit));
/** Positional-fit colour (0..1) — reuses the overall-rating tier scale. */
export const fitColor = (fit: number) => tierColor(Math.round(fit * 99));
/** Familiarity colour (0-100) — same bands as the fitness bar. */
export const familiarityColor = (familiarity: number) => fitnessColor(familiarity);

const SLIDERS: {
  key: keyof StoredInstructions;
  labelKey: "tempo" | "pressing" | "lineHeight" | "widthInstr" | "directness";
  lowKey: UIStringKey;
  highKey: UIStringKey;
}[] = [
  { key: "tempo", labelKey: "tempo", lowKey: "tempoLow", highKey: "tempoHigh" },
  { key: "pressing", labelKey: "pressing", lowKey: "pressingLow", highKey: "pressingHigh" },
  { key: "lineHeight", labelKey: "lineHeight", lowKey: "lineHeightLow", highKey: "lineHeightHigh" },
  { key: "width", labelKey: "widthInstr", lowKey: "widthLow", highKey: "widthHigh" },
  { key: "directness", labelKey: "directness", lowKey: "directnessLow", highKey: "directnessHigh" },
];

const MENTALITY_ORDER = [Mentality.VeryDefensive, Mentality.Defensive, Mentality.Balanced, Mentality.Attacking, Mentality.VeryAttacking];

/** The five mentalities as a segmented control — one tap, no dropdown. */
export function MentalityToggle({ value, onChange }: { value: Mentality; onChange: (m: Mentality) => void }) {
  const { t } = useApp();
  const label: Record<Mentality, string> = {
    [Mentality.VeryDefensive]: t.mentalityVeryDefensive,
    [Mentality.Defensive]: t.mentalityDefensive,
    [Mentality.Balanced]: t.mentalityBalanced,
    [Mentality.Attacking]: t.mentalityAttacking,
    [Mentality.VeryAttacking]: t.mentalityVeryAttacking,
  };
  const fullLabel: Record<Mentality, string> = {
    [Mentality.VeryDefensive]: t.mentalityVeryDefensiveFull,
    [Mentality.Defensive]: t.mentalityDefensiveFull,
    [Mentality.Balanced]: t.mentalityBalancedFull,
    [Mentality.Attacking]: t.mentalityAttackingFull,
    [Mentality.VeryAttacking]: t.mentalityVeryAttackingFull,
  };
  return (
    // Natural widths, not five equal columns: the labels differ in length, and
    // an equal-column grid clips the longest one.
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v as Mentality)} className="flex w-full flex-wrap">
      {MENTALITY_ORDER.map((m) => (
        // The tooltip triggers off an inner span, for two reasons: as `asChild`
        // on the item itself both Radix parts would write `data-state` to one
        // element (the tooltip's "closed" clobbering the toggle's "on"), and
        // without `asChild` the trigger would render a <button> inside a button.
        <ToggleGroupItem key={m} value={m} accent className="flex-1 whitespace-nowrap px-2">
          <Abbrev full={fullLabel[m]} asChild><span>{label[m]}</span></Abbrev>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * One-click strategy bundles (mentality + every slider + marking). Shows
 * "Custom" the moment the current setup drifts from any preset — the picker
 * never lies about what's actually applied.
 */
export function PresetPicker({
  mentality,
  instructions,
  onApply,
}: {
  mentality: Mentality;
  instructions: StoredInstructions;
  onApply: (key: TacticPresetKey) => void;
}) {
  const { t } = useApp();
  const current = matchPreset(mentality, instructions);
  const label: Record<TacticPresetKey, string> = {
    highPress: t.presetHighPress,
    possession: t.presetPossession,
    counter: t.presetCounter,
    lowBlock: t.presetLowBlock,
    balanced: t.presetBalanced,
    direct: t.presetDirect,
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{t.preset}</Label>
      <Select value={current ?? "__custom"} onValueChange={(v) => onApply(v as TacticPresetKey)}>
        <SelectTrigger><SelectValue placeholder={t.presetCustom}>{current ? label[current] : t.presetCustom}</SelectValue></SelectTrigger>
        <SelectContent>
          {!current && <SelectItem value="__custom" disabled>{t.presetCustom}</SelectItem>}
          {TACTIC_PRESETS.map((p) => <SelectItem key={p.key} value={p.key}>{label[p.key]}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * A player as a STACK, Football-Manager-style: the shirt on top, and under it one plate carrying the
 * readings — position, rating, condition. The caller adds his name as the row below (the pitch draws a
 * matching nameplate, a bench card writes it on the card), so the three rows read as one figure.
 *
 * NOTHING IS DRAWN OVER ANYTHING ELSE, and that is the whole change from the layout this replaced. That
 * one hung a position chip off the shirt's bottom-left and a rating off its bottom-right, each 8px past
 * the shirt's edge so the two would clear each other — so the jersey showed through between them, the
 * chips crossed a bench card's own border, and the 8px of overhang had to be paid for in padding by
 * every caller. Collected into one plate the same facts need 45px instead of 54px and touch nothing.
 *
 * THE SHIRT'S BOX IS STILL STATED, not inferred, and that has to stay true at any `size`. `TeamShirt`
 * renders an inline <svg>; inline means it sits on a line's baseline, and the descender space under
 * that baseline used to make its wrapper several pixels taller than the drawing — which is how the
 * chips anchored to that wrapper's bottom edge came to land on the condition bar below it. `block` plus
 * an explicit width and height from the viewBox ratio keeps the line box out of the arithmetic. The
 * wrapper survives the rewrite because the two status marks are positioned against it.
 *
 * THE PLATE IS THE WIDEST ROW, and it is deliberately narrow: 3 characters of position, a two-digit
 * rating and 8px of padding, ~45px at the default size. The pitch is what that budget is for — see
 * `Pitch`, where a back four at 1280 leaves 76px between adjacent markers.
 *
 * BOOKING AND INJURY GO IN THE SHIRT'S OWN EMPTY CORNERS. They are status rather than identity, they
 * are rare, and the jersey genuinely has nothing there: the sleeve tops run from (7.4, 8.2) and
 * (32.6, 8.2) in `TeamShirt`'s 40×44 viewBox, so both upper corners are transparent. Flush inside the
 * box (`top-0`), never past it — anything that overhangs reaches into the row below.
 */
export function SlotMarker({
  kit,
  pos,
  group,
  shirtNumber,
  overall,
  fitness,
  size = 38,
  booked,
  injured,
}: {
  kit?: ClubKit;
  pos: string;
  /**
   * Which line he belongs to. REQUIRED, because the plate is always drawn and is always tinted by it —
   * a default would paint a centre-back's plate midfield green on the boards that do not track groups.
   */
  group: PosGroup;
  /**
   * The number on his back, which is what a shirt says in every football game there has ever been.
   *
   * Absent for a mode that does not know it — a live match reads the engine's athletes, which carry no
   * squad number — and then the chest is simply blank. It is not filled with the position: the plate
   * below already carries that, and printing it twice is what the old chest fallback amounted to once
   * the position stopped depending on there being a number.
   */
  shirtNumber?: number;
  overall?: number;
  /** 0–100. Omit to leave the meter undrawn — an empty meter reads as a man with nothing left. */
  fitness?: number;
  size?: number;
  /** Yellow cards, shown as a warning stripe when the player is one away. */
  booked?: number;
  /** Hurt and needing to come off — marked with the medical cross. */
  injured?: boolean;
}) {
  return (
    <span className="flex max-w-full flex-col items-center gap-0.5">
      {/* 44/40 is `TeamShirt`'s own viewBox ratio — the same figure it scales its height by. */}
      <span className="relative block shrink-0" style={{ width: size, height: (size * 44) / 40 }}>
        <TeamShirt kit={kit} size={size} label={shirtNumber === undefined ? undefined : String(shirtNumber)} className="block" />
        {Boolean(booked) && <span className="absolute left-0 top-0 h-3 w-[3px] rounded-[1px] bg-[var(--gold)] ring-1 ring-black/40" />}
        {injured && <InjuryMark size={11} className="absolute right-0 top-0 ring-1 ring-black/40" />}
      </span>
      {/*
        The plate: tinted by his line so a back four, a midfield and a front three are three colours at
        a glance (FM's cue), but kept near-black so the rating can be drawn in its own tier colour on
        top. A saturated fill could not carry a second saturated colour, and the rating's tier is the
        most repeated signal in the app to give up.

        `pb-[3px]` is the condition meter's lane and is reserved WHETHER OR NOT the meter is drawn. That
        is what keeps every plate the same height, so a row of bench cards with mixed known and unknown
        condition still has its names on one line — the ragged look this replaced.
      */}
      <span
        className="relative flex max-w-full items-center gap-1 overflow-hidden rounded-sm px-1 pb-[3px] pt-px ring-1 ring-white/10"
        style={{ background: `color-mix(in srgb, ${groupColorVar(group)} 22%, #0b0f14)` }}
      >
        <span
          className="min-w-0 truncate text-[9px] font-bold uppercase leading-[10px] tracking-caps"
          style={{ color: groupColorVar(group) }}
        >
          {pos}
        </span>
        {overall !== undefined && (
          <span className="shrink-0 text-[10px] font-bold leading-[10px] tabular-nums" style={{ color: tierFill(overall) }}>
            {overall}
          </span>
        )}
        {fitness !== undefined && (
          <span className="pointer-events-none absolute inset-x-px bottom-px h-[2px] overflow-hidden rounded-full bg-black/45">
            <span className="block h-full rounded-full" style={{ width: `${clampFit(fitness)}%`, background: fitnessColor(fitness) }} />
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * A bench or reserve entry: THE SAME FIGURE THE PITCH DRAWS, in a chip you can pick up.
 *
 * IT HAS NO PLAYER DRAWING OF ITS OWN, and that is the point. This used to be a second, wider
 * presentation of exactly the facts `SlotMarker` already carries — kit, squad number, position, rating,
 * condition, injury — laid out sideways at a different scale. Two components drawing one player two
 * ways is how the two quietly stop agreeing, and it is also why the bench could not shrink: a name, a
 * badge and a rating pill in a row need ~140px before anything is even cramped.
 *
 * So the split is the one `Pitch` already uses: `SlotMarker` is the man, the caller owns the gesture.
 * A pitch spot wraps him in a button that selects, drags and drops and adds a nameplate; this does the
 * same thing for the bench. Merging them the other way round — one component that is both the drawing
 * and the affordance — is what would not work, because the affordances genuinely differ: a spot has
 * pitch coordinates and a move mode, a card has a place in the bench ORDER.
 *
 * SMALL ON PURPOSE, and the width is arithmetic rather than taste. `w-14` (56px) holds the marker's
 * WIDEST ROW, which is its readings plate: 8px of padding, three characters of position (~19px at
 * `text-[9px]` with `tracking-caps`), a 4px gap, a two-digit rating (~12px) and the 1px ring — ~45px —
 * inside the card's own 1px borders. It used to be 56px for a different reason (the 38px shirt plus the
 * 8px its two chips hung past it on each side); the chips are gone, the number is unchanged, and the
 * ~9px that freed up is now slack instead of overhang. That is what turns a bench from two cards
 * abreast into a ROW of players.
 *
 * The name stays, truncated, because the number on the chest is not always there to identify him by —
 * a friendly has no career squad to read numbers from, and then the chest falls back to the position,
 * which every card in a panel may share. `Abbrev` carries the full name, the rating and the full
 * position on hover and focus, and `aria-label` keeps the accessible name the man's name rather than
 * the chips inside him.
 *
 * DRAGGABLE AND DROPPABLE, and the drag says what it will do before it happens, in the vocabulary the
 * pitch already established: the card being carried goes faint under a dashed border, every card that
 * would accept it draws the same dashed border in the accent, and the one under the cursor gets the
 * solid accent ring over `--primary-soft` that a shirt on the pitch gets. The caller owns the first
 * two, because only it knows what is being dragged and where it may legally land; `over` is local,
 * because only this card knows the cursor is on it.
 *
 * A tap is untouched and still opens the drawer — dragging is a different gesture, and the two-tap
 * "pick here, place there" this board deleted is not coming back through the drag.
 */
export function BenchCard({
  kit,
  position,
  name,
  shirtNumber,
  overall,
  fitness,
  injured,
  disabled,
  dragId,
  drag,
  onDragging,
  onDropId,
  title,
  onSelect,
  playerId,
  onNavigate,
}: {
  kit?: ClubKit;
  position: string;
  name: string;
  /** Absent where the mode does not know it — never invented, and never printed as a zero. */
  shirtNumber?: number;
  overall: number;
  /** 0–100. Omit to hide the bar — an unknown condition is not 100. */
  fitness?: number;
  injured?: boolean;
  disabled?: boolean;
  /** Payload for HTML drag-and-drop (omit to disable dragging). */
  dragId?: string;
  /**
   * This card's part in a drag currently in flight: the one being carried, or one that would accept it.
   * Undefined when nothing is being dragged, or when this card could not take what is.
   */
  drag?: "source" | "target";
  /** Reports this card's own drag starting and ending, so the caller can light the legal targets. */
  onDragging?: (dragging: boolean) => void;
  /** Accept a drop, carrying whatever `dragId` the dragged element set. Omit to refuse drops. */
  onDropId?: (dragId: string) => void;
  title?: string;
  onSelect?: () => void;
  /** Supply both to give the card a right-click menu (profile, actions). */
  playerId?: string;
  onNavigate?: (screen: ScreenId, param?: string) => void;
}) {
  const { shortPos: short, posName } = usePosLabels();
  /** The cursor is over THIS card with something in hand — the one state the caller cannot know. */
  const [over, setOver] = useState(false);
  const droppable = drag === "target" && onDropId !== undefined;
  const card = (
    <button
      draggable={Boolean(dragId) && !disabled}
      onDragStart={(e) => {
        if (!dragId) return;
        e.dataTransfer.setData("text/plain", dragId);
        // "move", so the cursor promises a move rather than a copy — this gesture never duplicates.
        e.dataTransfer.effectAllowed = "move";
        onDragging?.(true);
      }}
      onDragEnd={() => {
        setOver(false);
        onDragging?.(false);
      }}
      // `preventDefault` on dragover is what MAKES an element a drop target, so it is withheld unless
      // the caller has said this card can take what is being carried. Without that the browser refuses
      // the drop and the gesture dies over an illegal target, which is the honest outcome.
      onDragOver={(e) => {
        if (!droppable) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!droppable) return;
        e.preventDefault();
        setOver(false);
        const from = e.dataTransfer.getData("text/plain");
        if (from) onDropId?.(from);
      }}
      onClick={onSelect}
      disabled={disabled}
      // The chips inside are position codes and a rating, so left to itself the button's accessible
      // name would be "GOL 82" — enough to pick a card out, not enough to know who is on it.
      aria-label={name}
      className={cn(
        // `shrink-0` because the panels lay these out as wrapping flex rows: a chip that gave up width
        // to fit one more on a line would draw the same player narrower here than in the panel beside it,
        // which is the whole reason the width is fixed.
        "flex w-14 shrink-0 flex-col items-center gap-1 rounded-lg border border-border bg-[var(--surface-2-soft)] py-1.5 transition-colors hover:bg-surface-2",
        disabled && "opacity-45 hover:bg-[var(--surface-2-soft)]",
        dragId && !disabled && "cursor-grab active:cursor-grabbing",
        // Three states, drawn as the pitch draws them: faint-and-dashed for the card in hand, dashed
        // accent for one that would take it, solid accent over -soft for the one it would land on.
        drag === "source" && "border-dashed border-[var(--primary-line)] opacity-50",
        droppable && "border-dashed border-[var(--primary-line)]",
        over && "border-solid border-primary bg-primary-soft",
      )}
    >
      {/* No padding wrapper any more: the marker overhangs nothing, so it needs no air reserved for it
          and the card's own 56px is the only width in play. */}
      <SlotMarker
        kit={kit}
        pos={short(position)}
        group={groupOf(position)}
        shirtNumber={shirtNumber}
        overall={overall}
        fitness={fitness}
        injured={injured}
      />
      {/* ~8 characters at this size, which is what `shortNamesFor` mostly hands over anyway; the rest
          truncate and the tooltip has the full name. Struck through when he is hurt, reinforcing the
          cross the marker already draws rather than replacing it. */}
      <span className={cn("w-full truncate px-0.5 text-center text-2xs font-medium leading-4", injured ? "text-fg-faint line-through" : "text-fg")}>
        {name}
      </span>
    </button>
  );
  // One tooltip for the whole card (a second one inside it would nest a button
  // in a button): the full position, plus whatever the caller passed — the
  // player's full name and rating.
  const full = [posName(position), title].filter(Boolean).join(" · ");
  const withTooltip = <Abbrev full={full} asChild>{card}</Abbrev>;
  // Right-click reaches the player's profile and actions — until now there was
  // no route at all from the tactics board to a player.
  return playerId ? (
    <PlayerContextMenu playerId={playerId} context="tactics" onNavigate={onNavigate}>
      {withTooltip}
    </PlayerContextMenu>
  ) : (
    withTooltip
  );
}

/**
 * The five sliders + marking scheme, over any source of instructions. Pass
 * `bare` when it already sits inside a card — nesting one card in another just
 * draws a border around a border.
 */
export function InstructionsCard({
  values,
  onChange,
  bare,
}: {
  values: StoredInstructions;
  onChange: (patch: Partial<StoredInstructions>) => void;
  bare?: boolean;
}) {
  const { t } = useApp();
  const Frame = bare ? BareFrame : CardFrame;
  return (
    <Frame title={t.teamInstructions}>
      <div className="flex flex-col gap-3">
        {SLIDERS.map((s) => (
          <div key={s.key} className="flex flex-col gap-1">
            {/* Label in the caps treatment every field label on this board uses; the number is the
                DATA, so it keeps `text-fg` and tabular figures — a dial being dragged must not make
                the row it sits in jitter. */}
            <div className="flex items-baseline justify-between gap-2">
              <span className="caps text-fg-faint">{t[s.labelKey]}</span>
              <span className="text-xs font-semibold tabular-nums text-fg">{Math.round((values[s.key] as number) * 100)}</span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[values[s.key] as number]}
              onValueChange={([v]) => onChange({ [s.key]: v } as Partial<StoredInstructions>)}
            />
            <div className="flex justify-between text-2xs text-fg-faint">
              <span>{t[s.lowKey]}</span>
              <span>{t[s.highKey]}</span>
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <Label>{t.marking}</Label>
          <ToggleGroup type="single" value={values.markingScheme} onValueChange={(x) => x && onChange({ markingScheme: x as MarkingScheme })} className="grid grid-cols-2 gap-0.5">
            <ToggleGroupItem value={MarkingScheme.Zonal} accent>{t.markingZonal}</ToggleGroupItem>
            <ToggleGroupItem value={MarkingScheme.Man} accent>{t.markingMan}</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
    </Frame>
  );
}

function CardFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function BareFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="caps text-fg-faint">{title}</span>
      {children}
    </div>
  );
}
