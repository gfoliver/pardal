import type { ReactNode } from "react";
import { Formation, MarkingScheme, Mentality } from "@fut/domain";
import { matchPreset, TACTIC_PRESETS, type StoredInstructions, type TacticPresetKey } from "@fut/career";
import type { ClubKit } from "@fut/competition";
import { useApp } from "../../app/AppProviders";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Overall } from "../ui/game";
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
import { GROUP, cap, groupBadge, groupOf, shortPosFallback, useLabels } from "../../lib/labels";
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

/** A starter on the pitch, FIFA-style: kit, rating bottom-right, condition bar. */
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
      <span className="relative block leading-none">
        <TeamShirt kit={kit} size={size} label={numbered ? String(shirtNumber) : pos} />
        {numbered && (
          <span
            className="absolute -bottom-1 -left-2 rounded-sm px-1 text-[9px] font-bold uppercase leading-[1.5] tracking-caps ring-1 ring-black/40"
            style={{ background: groupColorVar(group ?? "MID"), color: "var(--text-on-accent)" }}
          >
            {pos}
          </span>
        )}
        {overall !== undefined && (
          <span
            className="absolute -bottom-1 -right-2 rounded-sm bg-[#0b0f14]/95 px-1 text-2xs font-bold leading-[1.35] tabular-nums ring-1 ring-white/25"
            style={{ color: tierColor(overall) }}
          >
            {overall}
          </span>
        )}
        {Boolean(booked) && <span className="absolute -left-1.5 -top-1 h-3 w-2 rounded-[1px] bg-[var(--gold)] ring-1 ring-black/40" />}
        {injured && <InjuryMark size={14} className="absolute -right-2 -top-1 ring-1 ring-black/40" />}
      </span>
      {fitness !== undefined && (
        <span className="block h-[3px] w-9 overflow-hidden rounded-full bg-black/50">
          <span className="block h-full rounded-full" style={{ width: `${clampFit(fitness)}%`, background: fitnessColor(fitness) }} />
        </span>
      )}
    </span>
  );
}

/** A FIFA-style bench card: kit, position chip, name, rating and condition. */
export function BenchCard({
  kit,
  position,
  name,
  shirtNumber,
  overall,
  fitness,
  injured,
  selected,
  disabled,
  dragId,
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
  selected?: boolean;
  disabled?: boolean;
  /** Payload for HTML drag-and-drop (omit to disable dragging). */
  dragId?: string;
  title?: string;
  onSelect?: () => void;
  /** Supply both to give the card a right-click menu (profile, actions). */
  playerId?: string;
  onNavigate?: (screen: ScreenId, param?: string) => void;
}) {
  const fit = fitness === undefined ? undefined : clampFit(fitness);
  const { shortPos: short, posName } = usePosLabels();
  const card = (
    <button
      draggable={Boolean(dragId) && !disabled}
      onDragStart={(e) => dragId && e.dataTransfer.setData("text/plain", dragId)}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        // `px-2.5 py-2` is the data layer's card padding, so a substitute here and a player on the
        // squad list sit on the same rhythm rather than each having their own.
        "group flex flex-col gap-1.5 rounded-lg border bg-[var(--surface-2-soft)] px-2.5 py-2 text-left transition-colors hover:bg-surface-2",
        selected ? "border-[var(--primary-line)] bg-primary-soft hover:bg-[var(--primary-wash)]" : "border-border",
        disabled && "opacity-45 hover:bg-[var(--surface-2-soft)]",
      )}
    >
      <div className="flex items-center gap-1.5">
        <TeamShirt kit={kit} size={26} />
        <Badge variant={groupBadge(position)}>{short(position)}</Badge>
        {/* The number is secondary data beside an identity, so it is muted and tabular — it changes
            from card to card and must not shift the badge beside it. */}
        {shirtNumber !== undefined && <span className="text-2xs tabular-nums text-fg-faint">#{shirtNumber}</span>}
        <span className="ml-auto">
          <Overall value={overall} size="sm" />
        </span>
      </div>
      <span className={cn("truncate text-xs font-medium", injured ? "text-fg-faint line-through" : "text-fg")}>{name}</span>
      {fit !== undefined && (
        <span className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
          <span className="block h-full rounded-full" style={{ width: `${fit}%`, background: fitnessColor(fit) }} />
        </span>
      )}
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
