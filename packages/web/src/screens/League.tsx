import { useApp } from "../app/AppProviders";
import { Advanced, Card, Masthead } from "../components/ui";
import { DEMO_TABLE } from "../data/demo";

export function League() {
  const { t } = useApp();
  return (
    <>
      <Masthead kicker={t.league} title="Standings" meta="Round 12 of 38" />

      <Card>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>{t.league}</th>
                <th className="num">P</th>
                <th className="num">{t.won}</th>
                <th className="num">{t.drawn}</th>
                <th className="num">{t.lost}</th>
                <Advanced>
                  <th className="num">{t.goalsFor}</th>
                  <th className="num">{t.goalsAgainst}</th>
                  <th className="num">GD</th>
                </Advanced>
                <th className="num">{t.points}</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_TABLE.map((r) => (
                <tr key={r.pos} style={r.isYou ? { background: "var(--primary-soft)" } : undefined}>
                  <td className="rank">{r.pos}</td>
                  <td>
                    <span className="name-serif" style={{ fontSize: "var(--fs-md)" }}>{r.team}</span>
                  </td>
                  <td className="num u-mono">{r.played}</td>
                  <td className="num u-mono">{r.w}</td>
                  <td className="num u-mono">{r.d}</td>
                  <td className="num u-mono">{r.l}</td>
                  <Advanced>
                    <td className="num u-mono">{r.gf}</td>
                    <td className="num u-mono">{r.ga}</td>
                    <td className="num u-mono">{r.gf - r.ga > 0 ? `+${r.gf - r.ga}` : r.gf - r.ga}</td>
                  </Advanced>
                  <td className="num feature-num" style={{ fontSize: "var(--fs-lg)" }}>
                    {r.pts}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
