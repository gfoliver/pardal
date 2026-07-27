import { Position, rolesFor } from "@fut/domain";
import type { TacticsPlayer, TacticsSlot } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { Abbrev } from "../ui/abbrev";
import { Badge } from "../ui/badge";
import { DataTable, type Column } from "../ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Overall } from "../ui/game";
import { Flag } from "../ui/flag";
import { fitColor, fitnessColor, groupOf, usePosLabels } from "./pieces";
import { cn } from "../../lib/utils";

/**
 * The starting XI as a sortable table — same information as the pitch, laid
 * out for scanning and comparing rather than for spatial reading. Shares
 * selection with the pitch (clicking a row is the same as tapping the shirt),
 * and edits the role inline without leaving the table.
 */
export function LineupTable({
  slots,
  nameOf,
  selectedSlot,
  onSelectSlot,
  onChangeRole,
  onChangePosition,
}: {
  slots: readonly TacticsSlot[];
  nameOf: (playerId: string, fallback: string) => string;
  selectedSlot: number | null;
  onSelectSlot: (slot: number) => void;
  onChangeRole: (playerId: string, roleKey: string) => void;
  onChangePosition: (slot: number, position: Position) => void;
}) {
  const { t } = useApp();
  const { shortPos, posName, roleName } = usePosLabels();
  const outfieldPositions = Object.values(Position).filter((p) => p !== Position.Goalkeeper);
  const columns: Column<TacticsSlot>[] = [
    {
      key: "pos",
      header: t.position,
      align: "center",
      cell: (s) => {
        // A keeper's slot isn't a choice — only a keeper can take it, so it stays a badge.
        const isKeeperSlot = s.player?.position === Position.Goalkeeper || s.position === Position.Goalkeeper;
        if (isKeeperSlot || !s.player) {
          return <Abbrev full={posName(s.position)}><Badge variant={groupOf(s.position)}>{shortPos(s.position)}</Badge></Abbrev>;
        }
        return (
          <Select value={s.position} onValueChange={(v) => onChangePosition(s.slot, v as Position)}>
            <SelectTrigger className="h-7 w-[5rem] px-2 text-xs" onClick={(e) => e.stopPropagation()}>
              <SelectValue>{shortPos(s.position)}</SelectValue>
            </SelectTrigger>
            {/* The trigger only shows an abbreviation, so the list must size to
                its own (much longer) labels rather than to the trigger. */}
            <SelectContent className="w-auto min-w-[13rem]" onClick={(e) => e.stopPropagation()}>
              {outfieldPositions.map((p) => <SelectItem key={p} value={p}>{posName(p)}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      key: "fit",
      header: t.fitShort,
      align: "center",
      sortValue: (s) => s.fit ?? -1,
      cell: (s) => (s.fit !== undefined ? <span className="font-bold tabular-nums" style={{ color: fitColor(s.fit) }}>{Math.round(s.fit * 100)}</span> : "—"),
    },
    {
      key: "name",
      header: t.player,
      sortValue: (s) => (s.player ? nameOf(s.player.playerId, s.player.name) : ""),
      cell: (s) => (s.player ? <span className={cn("font-medium text-fg", s.player.injured && "text-fg-faint line-through")}>{nameOf(s.player.playerId, s.player.name)}</span> : <span className="text-fg-faint">—</span>),
    },
    {
      key: "role",
      header: t.role,
      cell: (s) =>
        s.player ? (
          <Select value={s.role} onValueChange={(v) => onChangeRole(s.player!.playerId, v)}>
            <SelectTrigger className="h-7 w-36 text-xs" onClick={(e) => e.stopPropagation()}>
              <SelectValue>{roleName(s.role)}</SelectValue>
            </SelectTrigger>
            <SelectContent className="w-auto min-w-[14rem]" onClick={(e) => e.stopPropagation()}>
              {rolesFor(s.position as Position).map((r) => <SelectItem key={r.key} value={r.key}>{roleName(r.key)}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : null,
    },
    {
      key: "overall",
      header: t.overall,
      align: "center",
      sortValue: (s) => s.player?.overall ?? 0,
      cell: (s) => (s.player ? <Overall value={s.player.overall} /> : null),
    },
    {
      key: "age",
      header: t.age,
      align: "center",
      sortValue: (s) => s.player?.age ?? 0,
      cell: (s) => s.player?.age ?? "",
    },
    {
      key: "nat",
      header: t.nationalityShort,
      align: "center",
      cell: (s) => (s.player ? <Flag nationality={s.player.nationality} /> : null),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={[...slots]}
      getRowId={(s) => String(s.slot)}
      onRowClick={(s) => onSelectSlot(s.slot)}
      activeRowId={selectedSlot != null ? String(selectedSlot) : undefined}
      pageSize={20}
    />
  );
}

/**
 * A flat player list — the matchday substitutes (with their sub number) or the
 * rest of the squad left out entirely. Selecting a row is one half of a swap
 * (see Tactics.tsx's tap-to-select-then-target model); which pairs are valid
 * depends on which two lists the selection spans, not on this component.
 */
export function ReservesTable({
  players,
  nameOf,
  showSlot,
  selectedId,
  onSelectPlayer,
}: {
  players: readonly TacticsPlayer[];
  nameOf: (playerId: string, fallback: string) => string;
  /** Number rows 1..N (the matchday sub order) instead of just listing them. */
  showSlot?: boolean;
  selectedId?: string | null;
  onSelectPlayer?: (playerId: string) => void;
}) {
  const { t } = useApp();
  const { shortPos, posName } = usePosLabels();
  const columns: Column<TacticsPlayer>[] = [
    ...(showSlot ? [{ key: "slot", header: t.subSlot, align: "center" as const, cell: (p: TacticsPlayer) => <span className="tabular-nums text-fg-faint">{players.indexOf(p) + 1}</span> }] : []),
    { key: "pos", header: t.position, align: "center", cell: (p) => <Abbrev full={posName(p.position)}><Badge variant={groupOf(p.position)}>{shortPos(p.position)}</Badge></Abbrev> },
    { key: "name", header: t.player, sortValue: (p) => nameOf(p.playerId, p.name), cell: (p) => <span className={cn("font-medium text-fg", p.injured && "text-fg-faint line-through")}>{nameOf(p.playerId, p.name)}</span> },
    { key: "overall", header: t.overall, align: "center", sortValue: (p) => p.overall, cell: (p) => <Overall value={p.overall} /> },
    { key: "fitness", header: t.condition, align: "center", sortValue: (p) => p.fitness, cell: (p) => <span className="font-semibold tabular-nums" style={{ color: fitnessColor(p.fitness) }}>{Math.round(p.fitness)}</span> },
    { key: "age", header: t.age, align: "center", sortValue: (p) => p.age, cell: (p) => p.age },
    { key: "nat", header: t.nationalityShort, align: "center", cell: (p) => <Flag nationality={p.nationality} /> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={[...players]}
      getRowId={(p) => p.playerId}
      pageSize={20}
      onRowClick={onSelectPlayer ? (p) => onSelectPlayer(p.playerId) : undefined}
      activeRowId={selectedId ?? undefined}
    />
  );
}
