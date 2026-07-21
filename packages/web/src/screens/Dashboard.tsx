import { useApp } from "../app/AppProviders";
import { Advanced, Avatar, Badge, Button, Card, Panel, Rating } from "../components/ui";
import { IconPlay, IconWhistle } from "../components/icons";
import { DEMO_FORM, DEMO_NEXT, DEMO_SQUAD, DEMO_TABLE } from "../data/demo";
import { groupColorVar, groupTone } from "../util/pos";
import type { ScreenId } from "../layout/Shell";

const formTone: Record<string, string> = {
  W: "var(--brand-emerald)",
  D: "var(--gold)",
  L: "var(--danger)",
};

export function Dashboard({ onNavigate }: { onNavigate: (s: ScreenId) => void }) {
  const { t } = useApp();
  const top = [...DEMO_SQUAD].sort((a, b) => b.overall - a.overall).slice(0, 5);

  return (
    <>
      <div className="page-head">
        <h1>{t.dashboard}</h1>
        <p>Onze FC · {DEMO_NEXT.competition}</p>
      </div>

      <div className="grid grid--2" style={{ alignItems: "start" }}>
        {/* Next match — hero card */}
        <Card pad className="onze-hero" style={{ gridColumn: "1 / -1" }}>
          <div className="u-row u-between u-wrap u-gap-6">
            <div className="u-col u-gap-3">
              <span className="u-caps">{t.nextMatch}</span>
              <div className="u-row u-gap-4" style={{ fontSize: "var(--fs-xl)", fontWeight: 700 }}>
                <span>{DEMO_NEXT.homeShort}</span>
                <span className="u-faint" style={{ fontSize: "var(--fs-md)", fontWeight: 500 }}>
                  vs
                </span>
                <span>{DEMO_NEXT.awayShort}</span>
              </div>
              <span className="u-muted" style={{ fontSize: "var(--fs-sm)" }}>
                {DEMO_NEXT.venue}
              </span>
            </div>
            <div className="u-row u-gap-3">
              <Button variant="secondary" leadingIcon={<IconWhistle size={18} />} onClick={() => onNavigate("match")}>
                {t.quickSim}
              </Button>
              <Button variant="primary" leadingIcon={<IconPlay size={16} />} onClick={() => onNavigate("match")}>
                {t.play}
              </Button>
            </div>
          </div>
        </Card>

        {/* Form + league position */}
        <Panel title={t.form}>
          <div className="u-row u-gap-2">
            {DEMO_FORM.map((r, i) => (
              <span
                key={i}
                className="u-row u-center"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "var(--r-md)",
                  fontWeight: 700,
                  fontSize: "var(--fs-sm)",
                  color: "#04140e",
                  background: formTone[r],
                }}
              >
                {t[r === "W" ? "won" : r === "D" ? "drawn" : "lost"]}
              </span>
            ))}
          </div>
          <Advanced>
            <p className="u-muted" style={{ marginTop: "var(--sp-4)", fontSize: "var(--fs-sm)" }}>
              Last 5 · 3W 1D 1L · +6 GD
            </p>
          </Advanced>
        </Panel>

        <Panel title={t.leaguePosition} action={<Button size="sm" variant="ghost" onClick={() => onNavigate("league")}>{t.viewAll}</Button>}>
          <MiniTable />
        </Panel>

        {/* Top performers */}
        <Panel title={t.topPerformers} action={<Button size="sm" variant="ghost" onClick={() => onNavigate("squad")}>{t.viewAll}</Button>}>
          <div className="u-col u-gap-3">
            {top.map((pl) => (
              <div key={pl.id} className="u-row u-gap-3">
                <Avatar name={pl.name} tone={groupColorVar(pl.group)} />
                <div className="u-col" style={{ lineHeight: 1.25 }}>
                  <strong style={{ fontSize: "var(--fs-sm)" }}>{pl.name}</strong>
                  <span className="u-faint" style={{ fontSize: "var(--fs-xs)" }}>
                    {pl.role}
                  </span>
                </div>
                <span style={{ marginLeft: "auto" }}>
                  <Rating value={pl.overall} />
                </span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Squad snapshot */}
        <Panel title={t.squadOverview} action={<Button size="sm" variant="ghost" onClick={() => onNavigate("squad")}>{t.viewAll}</Button>}>
          <div className="u-row u-gap-4 u-wrap">
            {(["GK", "DEF", "MID", "ATT"] as const).map((g) => {
              const members = DEMO_SQUAD.filter((s) => s.group === g);
              const avg = Math.round(members.reduce((a, b) => a + b.overall, 0) / members.length);
              return (
                <div key={g} className="u-col u-gap-1" style={{ minWidth: 68 }}>
                  <Badge tone={groupTone(g)}>{g}</Badge>
                  <span style={{ fontSize: "var(--fs-xl)", fontWeight: 700 }}>{avg}</span>
                  <span className="u-faint" style={{ fontSize: "var(--fs-xs)" }}>
                    {members.length} players
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </>
  );
}

function MiniTable() {
  const { t } = useApp();
  return (
    <table className="table">
      <thead>
        <tr>
          <th style={{ width: 28 }}>#</th>
          <th>{t.league}</th>
          <th className="num">{t.points}</th>
        </tr>
      </thead>
      <tbody>
        {DEMO_TABLE.slice(0, 4).map((r) => (
          <tr key={r.pos} style={r.isYou ? { background: "var(--primary-soft)" } : undefined}>
            <td className="u-mono">{r.pos}</td>
            <td>
              <span style={{ fontWeight: r.isYou ? 700 : 500 }}>{r.team}</span>
            </td>
            <td className="num" style={{ fontWeight: 700 }}>
              {r.pts}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
