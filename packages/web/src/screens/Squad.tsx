import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useApp } from "../app/AppProviders";
import { PageHeader } from "../components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Avatar } from "../components/ui/avatar";
import { Overall, Attr, Stat } from "../components/ui/game";
import { Separator } from "../components/ui/separator";
import { PlayerRadar } from "../components/player-radar";
import { MY_SQUAD, type SquadPlayer, type PosGroup } from "../lib/engine/world";
import { cn } from "../lib/utils";
import { groupColorVar, groupTone } from "../util/pos";

type Filter = "all" | PosGroup;
type SortKey = "name" | "age" | "pace" | "shooting" | "passing" | "defending" | "physical" | "overall";

const TOP = [...MY_SQUAD].sort((a, b) => b.overall - a.overall)[0]!;

function valueOf(p: SquadPlayer, k: SortKey): number | string {
  if (k === "name") return p.name;
  if (k === "age") return p.age;
  if (k === "overall") return p.overall;
  return p.attrs[k];
}

export function Squad() {
  const { t } = useApp();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState(TOP.id);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "overall", dir: "desc" });

  const selected = MY_SQUAD.find((p) => p.id === selectedId) ?? TOP;
  const rows = MY_SQUAD.filter((p) => filter === "all" || p.group === filter).sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const av = valueOf(a, sort.key);
    const bv = valueOf(b, sort.key);
    if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * dir;
    return (av - bv) * dir;
  });

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));

  const SortHead = ({ k, label, align = "center" }: { k: SortKey; label: string; align?: "left" | "center" | "right" }) => (
    <TableHead className={align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center"}>
      <button
        onClick={() => toggle(k)}
        className={cn(
          "inline-flex items-center gap-1 outline-none transition-colors hover:text-fg",
          sort.key === k && "text-fg",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        {sort.key === k && (sort.dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
      </button>
    </TableHead>
  );

  return (
    <>
      <PageHeader kicker={t.squad} title={t.squadTitle} meta={t.squadSubtitle} />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="GK">GK</TabsTrigger>
          <TabsTrigger value="DEF">Def</TabsTrigger>
          <TabsTrigger value="MID">Mid</TabsTrigger>
          <TabsTrigger value="ATT">Att</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1fr_320px]">
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortHead k="name" label={t.player} align="left" />
                <TableHead className="text-center">{t.position}</TableHead>
                <SortHead k="age" label={t.age} align="right" />
                <SortHead k="pace" label="PAC" />
                <SortHead k="shooting" label="SHO" />
                <SortHead k="passing" label="PAS" />
                <SortHead k="defending" label="DEF" />
                <SortHead k="physical" label="PHY" />
                <SortHead k="overall" label={t.overall} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow
                  key={p.id}
                  data-active={p.id === selectedId || undefined}
                  onClick={() => setSelectedId(p.id)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={p.name} tone={groupColorVar(p.group)} size="sm" />
                      <div className="min-w-0 leading-tight">
                        <div className="serif text-base font-semibold">{p.name}</div>
                        <div className="text-2xs text-fg-faint">{p.role}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={groupTone(p.group)}>{p.pos}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-fg-muted">{p.age}</TableCell>
                  <AttrTd v={p.attrs.pace} />
                  <AttrTd v={p.attrs.shooting} />
                  <AttrTd v={p.attrs.passing} />
                  <AttrTd v={p.attrs.defending} />
                  <AttrTd v={p.attrs.physical} />
                  <TableCell className="text-center"><Overall value={p.overall} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <PlayerProfile player={selected} />
      </div>
    </>
  );
}

function PlayerProfile({ player }: { player: SquadPlayer }) {
  const tone = groupColorVar(player.group);
  return (
    <Card className="xl:sticky xl:top-4">
      <CardHeader><CardTitle>Player profile</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={player.name} tone={tone} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="serif text-lg font-semibold leading-tight">{player.name}</div>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={groupTone(player.group)}>{player.pos}</Badge>
              <span className="truncate text-2xs text-fg-faint">{player.role}</span>
            </div>
          </div>
          <Overall value={player.overall} />
        </div>

        <Separator />
        <PlayerRadar player={player} />
        <Separator />

        <div className="flex items-center justify-between">
          <Stat value={player.age} label="Age" />
          <Stat value={peak(player)} label="Best" color="var(--brand-emerald)" />
          <Stat value={player.overall} label="Overall" />
        </div>
      </CardContent>
    </Card>
  );
}

function peak(p: SquadPlayer): string {
  const entries = Object.entries(p.attrs) as [string, number][];
  const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  return { pace: "PAC", shooting: "SHO", passing: "PAS", defending: "DEF", physical: "PHY" }[best[0]] ?? "–";
}

function AttrTd({ v }: { v: number }) {
  return (
    <TableCell className="text-center">
      <Attr value={v} />
    </TableCell>
  );
}
