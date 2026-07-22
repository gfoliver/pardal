import { useState } from "react";
import { useApp } from "../app/AppProviders";
import { Avatar, Badge, Card, Masthead, Rating, Tabs } from "../components/ui";
import { DEMO_SQUAD, type DemoPlayer, type PosGroup } from "../data/demo";
import { groupColorVar, groupTone } from "../util/pos";

type Filter = "all" | PosGroup;

export function Squad() {
  const { t, mode } = useApp();
  const [filter, setFilter] = useState<Filter>("all");
  const advanced = mode === "advanced";

  const rows = DEMO_SQUAD.filter((p) => filter === "all" || p.group === filter);

  return (
    <>
      <Masthead kicker={t.squad} title={t.squadTitle} meta={t.squadSubtitle} />

      <div style={{ marginBottom: "var(--sp-4)" }}>
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "all", label: "All" },
            { value: "GK", label: "GK" },
            { value: "DEF", label: t.defending },
            { value: "MID", label: "Mid" },
            { value: "ATT", label: t.shooting },
          ]}
        />
      </div>

      <Card>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t.player}</th>
                <th>{t.position}</th>
                <th className="num">{t.age}</th>
                {advanced && <th>{t.role}</th>}
                {advanced && (
                  <>
                    <th className="num">{t.pace}</th>
                    <th className="num">{t.shooting}</th>
                    <th className="num">{t.passing}</th>
                    <th className="num">{t.defending}</th>
                    <th className="num">{t.physical}</th>
                  </>
                )}
                <th className="num">{t.overall}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <Row key={p.id} p={p} advanced={advanced} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Row({ p, advanced }: { p: DemoPlayer; advanced: boolean }) {
  return (
    <tr>
      <td>
        <div className="u-row u-gap-3">
          <Avatar name={p.name} tone={groupColorVar(p.group)} />
          <span className="name-serif" style={{ fontSize: "var(--fs-md)" }}>{p.name}</span>
        </div>
      </td>
      <td>
        <Badge tone={groupTone(p.group)}>{p.pos}</Badge>
      </td>
      <td className="num u-mono">{p.age}</td>
      {advanced && <td className="u-muted" style={{ fontSize: "var(--fs-sm)" }}>{p.role}</td>}
      {advanced && (
        <>
          <AttrCell v={p.attrs.pace} />
          <AttrCell v={p.attrs.shooting} />
          <AttrCell v={p.attrs.passing} />
          <AttrCell v={p.attrs.defending} />
          <AttrCell v={p.attrs.physical} />
        </>
      )}
      <td className="num">
        <Rating value={p.overall} />
      </td>
    </tr>
  );
}

function AttrCell({ v }: { v: number }) {
  const c = v >= 80 ? "var(--brand-emerald)" : v >= 65 ? "var(--text)" : "var(--text-faint)";
  return (
    <td className="num u-mono" style={{ color: c, fontWeight: v >= 80 ? 700 : 500 }}>
      {v}
    </td>
  );
}
