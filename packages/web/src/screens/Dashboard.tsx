import { useApp } from "../app/AppProviders";
import { Advanced, Avatar, Button, Masthead, Panel, Rating, Stat } from "../components/ui";
import { IconPlay, IconWhistle } from "../components/icons";
import { DEMO_FORM, DEMO_NEXT, DEMO_SQUAD, DEMO_TABLE } from "../data/demo";
import { groupColorVar } from "../util/pos";
import type { ScreenId } from "../layout/Shell";

const formTone: Record<string, string> = {
  W: "var(--brand-emerald)",
  D: "var(--gold)",
  L: "var(--danger)",
};

export function Dashboard({ onNavigate }: { onNavigate: (s: ScreenId) => void }) {
  const { t } = useApp();
  const top = [...DEMO_SQUAD].sort((a, b) => b.overall - a.overall).slice(0, 5);
  const you = DEMO_TABLE.find((r) => r.isYou)!;

  return (
    <>
      <Masthead kicker="Onze FC" title={t.dashboard} meta={DEMO_NEXT.competition} />

      {/* Matchday feature */}
      <div className="hero" style={{ marginBottom: "var(--sp-4)" }}>
        <div className="u-row u-between u-wrap u-gap-6" style={{ position: "relative", zIndex: 1 }}>
          <div className="u-col u-gap-4">
            <span className="kicker">{t.nextMatch}</span>
            <div className="hero-fixture">
              <div className="hero-team">
                <span className="eyebrow">{t.home}</span>
                <span className="club">{DEMO_NEXT.home}</span>
              </div>
              <span className="hero-vs">vs</span>
              <div className="hero-team">
                <span className="eyebrow">{t.away}</span>
                <span className="club">{DEMO_NEXT.away}</span>
              </div>
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
      </div>

      <div className="grid grid--2" style={{ alignItems: "start" }}>
        <Panel title={t.form}>
          <div className="u-row u-between u-wrap u-gap-4">
            <div className="u-row u-gap-2">
              {DEMO_FORM.map((r, i) => (
                <span
                  key={i}
                  className="u-row u-center feature-num"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "var(--r-sm)",
                    fontSize: "var(--fs-md)",
                    color: "#04140e",
                    background: formTone[r],
                  }}
                >
                  {t[r === "W" ? "won" : r === "D" ? "drawn" : "lost"]}
                </span>
              ))}
            </div>
            <Stat value={`${you.pos}${ordinal(you.pos)}`} caption={t.leaguePosition} />
          </div>
          <Advanced>
            <hr className="hairline" style={{ margin: "var(--sp-4) 0" }} />
            <div className="u-row u-gap-6">
              <Stat value={you.pts} caption={t.points} />
              <Stat value={`+${you.gf - you.ga}`} caption="GD" color="var(--brand-emerald)" />
              <Stat value={you.played} caption="Played" />
            </div>
          </Advanced>
        </Panel>

        <Panel
          title={t.leaguePosition}
          action={<Button size="sm" variant="ghost" onClick={() => onNavigate("league")}>{t.viewAll}</Button>}
        >
          <MiniTable />
        </Panel>

        <Panel
          title={t.topPerformers}
          action={<Button size="sm" variant="ghost" onClick={() => onNavigate("squad")}>{t.viewAll}</Button>}
        >
          <div className="u-col">
            {top.map((pl, i) => (
              <div key={pl.id} className="u-row u-gap-3" style={{ padding: "var(--sp-2) 0", borderBottom: i < top.length - 1 ? "1px solid var(--hairline)" : "none" }}>
                <Avatar name={pl.name} tone={groupColorVar(pl.group)} />
                <div className="u-col" style={{ lineHeight: 1.3 }}>
                  <span className="name-serif" style={{ fontSize: "var(--fs-md)" }}>{pl.name}</span>
                  <span className="u-faint" style={{ fontSize: "var(--fs-xs)" }}>{pl.role}</span>
                </div>
                <span style={{ marginLeft: "auto" }}>
                  <Rating value={pl.overall} />
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title={t.squadOverview}
          action={<Button size="sm" variant="ghost" onClick={() => onNavigate("squad")}>{t.viewAll}</Button>}
        >
          <div className="u-row u-between u-wrap u-gap-4">
            {(["GK", "DEF", "MID", "ATT"] as const).map((g) => {
              const members = DEMO_SQUAD.filter((s) => s.group === g);
              const avg = Math.round(members.reduce((a, b) => a + b.overall, 0) / members.length);
              return <Stat key={g} value={avg} caption={`${g} · ${members.length}`} color={groupColorVar(g)} />;
            })}
          </div>
        </Panel>
      </div>
    </>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0]!;
}

function MiniTable() {
  const { t } = useApp();
  return (
    <table className="table">
      <tbody>
        {DEMO_TABLE.slice(0, 4).map((r) => (
          <tr key={r.pos} style={r.isYou ? { background: "var(--primary-soft)" } : undefined}>
            <td className="rank">{r.pos}</td>
            <td>
              <span className={r.isYou ? "name-serif" : undefined} style={{ fontSize: r.isYou ? "var(--fs-md)" : undefined }}>
                {r.team}
              </span>
            </td>
            <td className="num feature-num" style={{ fontSize: "var(--fs-lg)" }}>
              {r.pts}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
