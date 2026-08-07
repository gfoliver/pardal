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
import { tierColor } from "../../lib/ratings";
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
 * A starter on the pitch, FIFA-style: the number on the chest, the position and the rating on the
 * shirt's bottom corners, condition underneath.
 *
 * EVERY PIECE HAS ITS OWN SPACE, and two rules keep it that way — both learned from the layout this
 * replaced, where the position chip and the rating were drawn straight over the condition bar.
 *
 *  - THE SHIRT'S BOX IS STATED, not inferred. `TeamShirt` renders an inline <svg>, an inline element
 *    sits on its line's baseline, and the descender space beneath that baseline made the wrapper
 *    several pixels taller than the shirt — so chips anchored to the WRAPPER's bottom edge landed
 *    below the shirt's, on top of the bar. `block` plus an explicit width and height takes the line
 *    box out of the arithmetic, at any `size`.
 *  - THE CHIPS ARE FLUSH WITH IT (`bottom-0`, `top-0`), never hanging past it. Anything that overhangs
 *    vertically reaches into whatever the caller draws next — on the pitch, the nameplate — and the
 *    chips are set in absolute type that does not scale with `size`, so no `size`-derived padding
 *    could reserve the right amount anyway. The shirt's own transparent margin (the jersey ends at
 *    89% of the viewBox) is what gives them air below the hem.
 *
 * The sideways offsets stay: the two chips together are wider than the shirt and would collide in the
 * middle without them. They overhang horizontally on purpose, which is also why two markers drawn very
 * close together can still touch — that is a spacing question for the pitch, not for this component.
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
  /** Colours the position chip. Only read when a squad number has taken the chest. */
  group?: PosGroup;
  /**
   * The number on his back, which is what a shirt says in every football game there has ever been.
   *
   * Absent for a mode that does not know it — a live match reads the engine's athletes, which carry no
   * squad number — and then the chest falls back to the position abbreviation exactly as before. So the
   * chip below the shirt appears only alongside a number: with the position already ON the shirt it
   * would be the same fact printed twice.
   */
  shirtNumber?: number;
  overall?: number;
  /** 0–100. Omit to hide the bar. */
  fitness?: number;
  size?: number;
  /** Yellow cards, shown as a warning stripe when the player is one away. */
  booked?: number;
  /** Hurt and needing to come off — marked with the medical cross. */
  injured?: boolean;
}) {
  const numbered = shirtNumber !== undefined;
  return (
    <span className="flex flex-col items-center gap-[3px]">
      {/* 44/40 is `TeamShirt`'s own viewBox ratio — the same figure it scales its height by. */}
      <span className="relative block" style={{ width: size, height: (size * 44) / 40 }}>
        <TeamShirt kit={kit} size={size} label={numbered ? String(shirtNumber) : pos} className="block" />
        {numbered && (
          <span
            className="absolute bottom-0 -left-2 rounded-sm px-1 text-[9px] font-bold uppercase leading-[1.5] tracking-caps ring-1 ring-black/40"
            style={{ background: groupColorVar(group ?? "MID"), color: "var(--text-on-accent)" }}
          >
            {pos}
          </span>
        )}
        {overall !== undefined && (
          <span
            className="absolute bottom-0 -right-2 rounded-sm bg-[#0b0f14]/95 px-1 text-2xs font-bold leading-[1.35] tabular-nums ring-1 ring-white/25"
            style={{ color: tierColor(overall) }}
          >
            {overall}
          </span>
        )}
        {Boolean(booked) && <span className="absolute -left-1.5 top-0 h-3 w-2 rounded-[1px] bg-[var(--gold)] ring-1 ring-black/40" />}
        {injured && <InjuryMark size={14} className="absolute -right-2 top-0 ring-1 ring-black/40" />}
      </span>
      {/* As wide as the shirt, not a hardcoded 36px: the bar is a reading OF this player and it belongs
          under him at whatever size he is drawn. Absent, never empty — an unknown condition drawn as a
          zero-width bar reads as a man with nothing left. */}
      {fitness !== undefined && (
        <span className="block h-[3px] overflow-hidden rounded-full bg-black/50" style={{ width: size }}>
          <span className="block h-full rounded-full" style={{ width: `${clampFit(fitness)}%`, background: fitnessColor(fitness) }} />
        </span>
      )}
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
 * SMALL ON PURPOSE, and the width is arithmetic rather than taste. `w-14` (56px) is the 38px shirt,
 * plus the 8px its position chip and rating badge each hang past that shirt (`-left-2` / `-right-2`),
 * plus the 1px borders: 8 + 38 + 8 + 2. A pixel narrower and the chips cross the card's edge; wider and
 * fewer fit. That is what turns a bench from two cards abreast into a ROW of players.
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
        "flex w-14 flex-col items-center gap-1 rounded-lg border border-border bg-[var(--surface-2-soft)] py-1.5 transition-colors hover:bg-surface-2",
        disabled && "opacity-45 hover:bg-[var(--surface-2-soft)]",
        dragId && !disabled && "cursor-grab active:cursor-grabbing",
        // Three states, drawn as the pitch draws them: faint-and-dashed for the card in hand, dashed
        // accent for one that would take it, solid accent over -soft for the one it would land on.
        drag === "source" && "border-dashed border-[var(--primary-line)] opacity-50",
        droppable && "border-dashed border-[var(--primary-line)]",
        over && "border-solid border-primary bg-primary-soft",
      )}
    >
      {/* The 8px of air the marker's two chips need: they are anchored `-left-2` / `-right-2` on a box
          that is exactly `size` wide, so this padding is the SHIRT'S overhang, not decoration. It lives
          here rather than on the button so the nameplate below can still use the card's full width. */}
      <span className="px-2">
        <SlotMarker
          kit={kit}
          pos={short(position)}
          group={groupOf(position)}
          shirtNumber={shirtNumber}
          overall={overall}
          fitness={fitness}
          injured={injured}
        />
      </span>
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
