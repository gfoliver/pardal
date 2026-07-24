import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { DataTable, type Column } from "../../components/ui/data-table";
import { Overall } from "../../components/ui/game";
import { useFormat } from "../../lib/format";
import type { ScreenId } from "../../layout/Shell";
import type { SquadEntry } from "@fut/career";

const POS: Record<string, string> = {
  goalkeeper: "GK", centreBack: "CB", fullBack: "FB", wingBack: "WB",
  defensiveMidfielder: "DM", centralMidfielder: "CM", attackingMidfielder: "AM",
  winger: "WG", striker: "ST",
};

export function Squad({ onNavigate }: { onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t } = useApp();
  const { career } = useCareer();
  const fmt = useFormat();
  if (!career) return null;
  const rows = career.squad();

  const columns: Column<SquadEntry>[] = [
    { key: "name", header: t.player, cell: (r) => <span className="font-medium text-fg">{r.name}</span>, sortValue: (r) => r.name },
    { key: "pos", header: t.position, cell: (r) => <Badge variant="muted">{POS[r.position] ?? r.position}</Badge>, sortValue: (r) => r.position },
    { key: "age", header: t.age, align: "center", cell: (r) => r.age, sortValue: (r) => r.age },
    { key: "ovr", header: t.overall, align: "center", cell: (r) => <Overall value={r.overall} />, sortValue: (r) => r.overall },
    {
      key: "status",
      header: t.role,
      cell: (r) =>
        r.injured ? (
          <Badge variant="gold">{t.out}</Badge>
        ) : (
          <span className="text-xs uppercase text-fg-faint">{r.contract?.squadStatus ?? "—"}</span>
        ),
      sortValue: (r) => (r.injured ? 0 : 1),
    },
    { key: "wage", header: t.wage, align: "right", cell: (r) => (r.contract ? fmt.money(r.contract.wage, { compact: true }) : "—"), sortValue: (r) => r.contract?.wage ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.squadTitle}</h1>
        <p className="text-sm text-fg-muted">{rows.length} {t.player.toLowerCase()}s</p>
      </div>
      <Card>
        <CardContent className="py-3">
          <DataTable
            columns={columns}
            rows={rows}
            getRowId={(r) => r.playerId}
            onRowClick={(r) => onNavigate("player", r.playerId)}
            initialSort={{ key: "ovr", dir: "desc" }}
            filterText={(r) => `${r.name} ${r.position}`}
            searchPlaceholder={`${t.player}…`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
