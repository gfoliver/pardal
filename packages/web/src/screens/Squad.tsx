import { useState } from "react";
import { useApp } from "../app/AppProviders";
import { PageHeader } from "../components/ui/page-header";
import { Card } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Avatar } from "../components/ui/avatar";
import { Overall, Attr } from "../components/ui/game";
import { DEMO_SQUAD, type PosGroup } from "../data/demo";
import { groupColorVar, groupTone } from "../util/pos";

type Filter = "all" | PosGroup;

export function Squad() {
  const { t } = useApp();
  const [filter, setFilter] = useState<Filter>("all");
  const rows = DEMO_SQUAD.filter((p) => filter === "all" || p.group === filter);

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

      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[42%]">{t.player}</TableHead>
              <TableHead className="text-center">{t.position}</TableHead>
              <TableHead className="text-right">{t.age}</TableHead>
              <TableHead className="text-center" title={t.pace}>PAC</TableHead>
              <TableHead className="text-center" title={t.shooting}>SHO</TableHead>
              <TableHead className="text-center" title={t.passing}>PAS</TableHead>
              <TableHead className="text-center" title={t.defending}>DEF</TableHead>
              <TableHead className="text-center" title={t.physical}>PHY</TableHead>
              <TableHead className="text-center">{t.overall}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
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
    </>
  );
}

function AttrTd({ v }: { v: number }) {
  return (
    <TableCell className="text-center">
      <Attr value={v} />
    </TableCell>
  );
}
