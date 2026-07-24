import { Star, Search, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { DataTable, type Column } from "../../components/ui/data-table";
import { Overall } from "../../components/ui/game";
import { useFormat } from "../../lib/format";
import type { TransferTarget } from "@fut/career";

const POS: Record<string, string> = { goalkeeper: "GK", centreBack: "CB", fullBack: "FB", wingBack: "WB", defensiveMidfielder: "DM", centralMidfielder: "CM", attackingMidfielder: "AM", winger: "WG", striker: "ST" };

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={i < n ? "size-3.5 fill-gold text-gold" : "size-3.5 text-fg-faint"} />
      ))}
    </span>
  );
}

export function Scouting() {
  const { t } = useApp();
  const { career, scout, addTarget } = useCareer();
  const fmt = useFormat();
  if (!career) return null;
  const rows = career.transferTargets();

  const columns: Column<TransferTarget>[] = [
    { key: "name", header: t.player, cell: (r) => <span className="font-medium text-fg">{r.name}</span>, sortValue: (r) => r.name },
    { key: "club", header: t.club, cell: (r) => r.clubShort, sortValue: (r) => r.clubShort },
    { key: "pos", header: t.position, cell: (r) => <Badge variant="muted">{POS[r.position] ?? r.position}</Badge>, sortValue: (r) => r.position },
    { key: "age", header: t.age, align: "center", cell: (r) => r.age, sortValue: (r) => r.age },
    { key: "ovr", header: t.overall, align: "center", cell: (r) => <Overall value={r.overall} />, sortValue: (r) => r.overall },
    {
      key: "pot",
      header: t.potential,
      align: "center",
      cell: (r) => (r.scouted && r.potentialStars ? <Stars n={r.potentialStars} /> : <span className="text-fg-faint">?</span>),
      sortValue: (r) => r.potentialStars ?? -1,
    },
    {
      key: "scout",
      header: "",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          {r.scouted ? (
            <span className="self-center text-2xs uppercase text-fg-faint">{t.scouted}</span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => scout(r.playerId)}><Search /> {t.scout}</Button>
          )}
          {career.isTarget(r.playerId) ? (
            <Button size="sm" variant="ghost" disabled><Check /> {t.target}</Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => { addTarget(r.playerId); toast(fmt.t(t.addedToTargets, { name: r.name })); }}><Plus /> {t.target}</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.scouting}</h1>
        <p className="text-sm text-fg-muted">{fmt.t(t.scoutedCount, { n: career.snapshot().scoutedPlayerIds.length })}</p>
      </div>
      <Card>
        <CardContent className="py-3">
          <DataTable columns={columns} rows={rows} getRowId={(r) => r.playerId} initialSort={{ key: "ovr", dir: "desc" }} filterText={(r) => `${r.name} ${r.clubShort} ${r.position}`} searchPlaceholder={`${t.player}…`} />
        </CardContent>
      </Card>
    </div>
  );
}
