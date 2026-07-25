import { Formation, MarkingScheme, Position, PositionGroup, positionGroup, rolesFor } from "@fut/domain";
import type { StoredInstructions } from "@fut/career";
import type { ClubKit } from "@fut/competition";
import { useApp } from "../../app/AppProviders";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { TeamShirt } from "../ui/team-shirt";
import { groupColorVar } from "../../util/pos";
import { tierColor } from "../../lib/ratings";
import { cn } from "../../lib/utils";
import type { PosGroup } from "../../lib/engine/world";

/**
 * The pieces a tactics board is built from — shared by the squad-tactics screen
 * and the in-match one so a shape looks and behaves the same in both, whether
 * the numbers come from stored tactics or from a running match.
 */

export const POS_SHORT: Record<string, string> = {
  goalkeeper: "GK", centreBack: "CB", fullBack: "FB", wingBack: "WB", defensiveMidfielder: "DM",
  centralMidfielder: "CM", attackingMidfielder: "AM", winger: "WG", striker: "ST",
};
export const GROUP: Record<PositionGroup, PosGroup> = {
  [PositionGroup.Goalkeeper]: "GK", [PositionGroup.Defence]: "DEF", [PositionGroup.Midfield]: "MID", [PositionGroup.Attack]: "ATT",
};
export const FORMATION_LABEL: Record<string, string> = {
  [Formation.F442]: "4-4-2", [Formation.F442Diamond]: "4-4-2 ◇", [Formation.F433]: "4-3-3", [Formation.F4231]: "4-2-3-1",
  [Formation.F424]: "4-2-4", [Formation.F352]: "3-5-2", [Formation.F532]: "5-3-2", [Formation.F343]: "3-4-3", [Formation.F541]: "5-4-1",
};

export const shortPos = (position: string) => POS_SHORT[position] ?? position;
export const groupOf = (position: string) => GROUP[positionGroup(position as Position)];
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/([A-Z])/g, " $1");

/** Condition bar colour (shared by pitch markers and bench cards). */
export const fitnessColor = (fit: number) => (fit > 66 ? "var(--pos-mid)" : fit > 33 ? "var(--gold)" : "var(--danger)");
export const clampFit = (fit: number) => Math.max(0, Math.min(100, fit));

const SLIDERS: { key: keyof StoredInstructions; labelKey: "tempo" | "pressing" | "lineHeight" | "widthInstr" | "directness" }[] = [
  { key: "tempo", labelKey: "tempo" },
  { key: "pressing", labelKey: "pressing" },
  { key: "lineHeight", labelKey: "lineHeight" },
  { key: "width", labelKey: "widthInstr" },
  { key: "directness", labelKey: "directness" },
];

/** A starter on the pitch, FIFA-style: kit, rating bottom-right, condition bar. */
export function SlotMarker({
  kit,
  pos,
  overall,
  fitness,
  size = 38,
  booked,
}: {
  kit?: ClubKit;
  pos: string;
  overall?: number;
  /** 0–100. Omit to hide the bar. */
  fitness?: number;
  size?: number;
  /** Yellow cards, shown as a warning stripe when the player is one away. */
  booked?: number;
}) {
  return (
    <span className="flex flex-col items-center gap-[3px]">
      <span className="relative block leading-none">
        <TeamShirt kit={kit} size={size} label={pos} />
        {overall !== undefined && (
          <span
            className="absolute -bottom-1 -right-2 rounded-sm bg-[#0b0f14]/95 px-1 text-2xs font-bold leading-[1.35] tabular-nums ring-1 ring-white/25"
            style={{ color: tierColor(overall) }}
          >
            {overall}
          </span>
        )}
        {Boolean(booked) && <span className="absolute -left-1.5 -top-1 h-3 w-2 rounded-[1px] bg-[var(--gold)] ring-1 ring-black/40" />}
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
  overall,
  fitness,
  injured,
  selected,
  disabled,
  dragId,
  title,
  onSelect,
}: {
  kit?: ClubKit;
  position: string;
  name: string;
  overall: number;
  fitness: number;
  injured?: boolean;
  selected?: boolean;
  disabled?: boolean;
  /** Payload for HTML drag-and-drop (omit to disable dragging). */
  dragId?: string;
  title?: string;
  onSelect?: () => void;
}) {
  const fit = clampFit(fitness);
  return (
    <button
      draggable={Boolean(dragId) && !disabled}
      onDragStart={(e) => dragId && e.dataTransfer.setData("text/plain", dragId)}
      onClick={onSelect}
      disabled={disabled}
      title={title}
      className={cn(
        "group flex flex-col gap-1.5 rounded-lg border bg-surface-2/60 p-2 text-left transition-colors hover:bg-surface-2",
        selected ? "border-primary ring-1 ring-primary" : "border-border",
        disabled && "opacity-45 hover:bg-surface-2/60",
      )}
    >
      <div className="flex items-center gap-2">
        <TeamShirt kit={kit} size={26} />
        <span
          className="rounded px-1 py-0.5 text-2xs font-bold uppercase leading-none"
          style={{ background: groupColorVar(groupOf(position)), color: "#04140e" }}
        >
          {shortPos(position)}
        </span>
        <span className="ml-auto text-sm font-bold tabular-nums text-fg">{overall}</span>
      </div>
      <span className={cn("truncate text-xs font-medium", injured ? "text-fg-faint line-through" : "text-fg")}>{name}</span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
        <span className="block h-full rounded-full" style={{ width: `${fit}%`, background: fitnessColor(fit) }} />
      </span>
    </button>
  );
}

/**
 * Where a player is being fielded, and what they're asked to do there. The role
 * list follows the position — pick centre-back and only a centre-back's jobs are
 * on offer — so the two controls can never disagree. Goalkeeping is its own
 * thing: only a keeper is offered the gloves, and never anything else.
 */
export function PositionAndRole({
  fielded,
  role,
  isGoalkeeper,
  onPosition,
  onRole,
}: {
  fielded: Position;
  role: string;
  isGoalkeeper: boolean;
  onPosition: (position: Position) => void;
  onRole: (roleKey: string) => void;
}) {
  const { t } = useApp();
  const positions = isGoalkeeper
    ? [Position.Goalkeeper]
    : Object.values(Position).filter((p) => p !== Position.Goalkeeper);
  const roles = rolesFor(fielded);
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label>{t.position}</Label>
        <Select value={fielded} onValueChange={(x) => onPosition(x as Position)} disabled={isGoalkeeper}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{positions.map((p) => <SelectItem key={p} value={p}>{cap(p)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t.role}</Label>
        <Select value={role} onValueChange={onRole}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{roles.map((r) => <SelectItem key={r.key} value={r.key}>{cap(r.key)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </>
  );
}

/** The five sliders + marking scheme, over any source of instructions. */
export function InstructionsCard({
  values,
  onChange,
}: {
  values: StoredInstructions;
  onChange: (patch: Partial<StoredInstructions>) => void;
}) {
  const { t } = useApp();
  return (
    <Card>
      <CardHeader><CardTitle>{t.teamInstructions}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        {SLIDERS.map((s) => (
          <div key={s.key} className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-fg-muted">
              <span>{t[s.labelKey]}</span>
              <span className="tabular-nums">{Math.round((values[s.key] as number) * 100)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={values[s.key] as number}
              onChange={(e) => onChange({ [s.key]: Number(e.target.value) } as Partial<StoredInstructions>)}
              className="accent-[var(--primary)]"
            />
          </div>
        ))}
        <div className="flex flex-col gap-1.5">
          <Label>{t.marking}</Label>
          <Select value={values.markingScheme} onValueChange={(x) => onChange({ markingScheme: x as MarkingScheme })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.values(MarkingScheme).map((m) => <SelectItem key={m} value={m}>{cap(m)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
