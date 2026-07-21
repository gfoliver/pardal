import { useApp } from "../app/AppProviders";
import { Advanced, Badge, Panel, Segmented, StatBar } from "../components/ui";
import { DEMO_SQUAD, YOU } from "../data/demo";
import { groupColorVar } from "../util/pos";
import { useState } from "react";

// Normalised pitch coordinates for the starting XI (x: 0 left→100 right,
// y: 0 opponent goal (top) → 100 own goal (bottom)).
const SPOTS: { id: number; x: number; y: number }[] = [
  { id: 1, x: 50, y: 92 },
  { id: 2, x: 84, y: 73 },
  { id: 3, x: 62, y: 80 },
  { id: 4, x: 38, y: 80 },
  { id: 5, x: 16, y: 73 },
  { id: 6, x: 50, y: 60 },
  { id: 7, x: 30, y: 49 },
  { id: 8, x: 64, y: 43 },
  { id: 9, x: 82, y: 27 },
  { id: 10, x: 50, y: 17 },
  { id: 11, x: 18, y: 27 },
];

export function Tactics() {
  const { t } = useApp();
  const [formation, setFormation] = useState("4-3-3");
  const [mentality, setMentality] = useState("balanced");
  const byId = new Map(DEMO_SQUAD.map((p) => [p.id, p]));

  return (
    <>
      <div className="page-head">
        <h1>{t.tacticsTitle}</h1>
        <p>{t.tacticsSubtitle}</p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr", alignItems: "start" }}>
        <Panel
          title={
            <span className="u-row u-gap-3">
              {t.formation}
              <Badge tone="primary">{formation}</Badge>
            </span>
          }
        >
          <div className="pitch">
            <div className="pitch-markings" />
            {SPOTS.map((s) => {
              const p = byId.get(s.id)!;
              return (
                <div key={s.id} className="pitch-token" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
                  <span
                    className="pitch-dot"
                    style={{ background: groupColorVar(p.group) }}
                    title={`${p.name} · ${p.role}`}
                  >
                    {p.pos}
                  </span>
                  <span className="pitch-name">{p.name.split(" ")[1] ?? p.name}</span>
                </div>
              );
            })}
          </div>
        </Panel>

        <div className="u-col u-gap-4">
          <Panel title={t.formation}>
            <Segmented
              value={formation}
              onChange={setFormation}
              options={[
                { value: "4-3-3", label: "4-3-3" },
                { value: "4-4-2", label: "4-4-2" },
                { value: "3-5-2", label: "3-5-2" },
              ]}
            />
          </Panel>

          <Panel title={t.mentality}>
            <Segmented
              value={mentality}
              onChange={setMentality}
              options={[
                { value: "defensive", label: "Def" },
                { value: "balanced", label: "Bal" },
                { value: "attacking", label: "Att" },
              ]}
            />
          </Panel>

          <Advanced>
            <Panel title="Team shape">
              <div className="u-col u-gap-4">
                <StatBar label="Line height" value={58} max={100} />
                <StatBar label="Pressing" value={62} max={100} />
                <StatBar label="Tempo" value={50} max={100} />
                <StatBar label="Width" value={66} max={100} />
                <StatBar label="Directness" value={44} max={100} />
              </div>
            </Panel>
          </Advanced>
        </div>
      </div>

      <p className="u-faint" style={{ marginTop: "var(--sp-4)", fontSize: "var(--fs-sm)" }}>
        {YOU.name} · {formation} · {mentality}
      </p>
    </>
  );
}
