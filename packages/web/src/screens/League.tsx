import { useApp } from "../app/AppProviders";
import { Advanced, Card } from "../components/ui";
import { DEMO_TABLE } from "../data/demo";

export function League() {
  const { t } = useApp();
  return (
    <>
      <div className="page-head">
        <h1>{t.league}</h1>
        <p>Round 12 of 38</p>
      </div>

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
                  <td className="u-mono">{r.pos}</td>
                  <td style={{ fontWeight: r.isYou ? 700 : 500 }}>{r.team}</td>
                  <td className="num u-mono">{r.played}</td>
                  <td className="num u-mono">{r.w}</td>
                  <td className="num u-mono">{r.d}</td>
                  <td className="num u-mono">{r.l}</td>
                  <Advanced>
                    <td className="num u-mono">{r.gf}</td>
                    <td className="num u-mono">{r.ga}</td>
                    <td className="num u-mono">{r.gf - r.ga > 0 ? `+${r.gf - r.ga}` : r.gf - r.ga}</td>
                  </Advanced>
                  <td className="num" style={{ fontWeight: 700 }}>
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
