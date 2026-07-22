import { useState } from "react";
import { useApp } from "../app/AppProviders";
import { Badge, Masthead, Panel, Segmented } from "../components/ui";
import { DEMO_SQUAD, type PosGroup } from "../data/demo";
import { groupColorVar } from "../util/pos";

type FormationId = "F433" | "F442" | "F352";

interface Spot {
  x: number;
  y: number;
  pos: string;
}

const FORMATIONS: Record<FormationId, { label: string; spots: Spot[] }> = {
  F433: {
    label: "4-3-3",
    spots: [
      { x: 50, y: 92, pos: "GK" },
      { x: 84, y: 73, pos: "RB" }, { x: 62, y: 80, pos: "CB" }, { x: 38, y: 80, pos: "CB" }, { x: 16, y: 73, pos: "LB" },
      { x: 50, y: 60, pos: "DM" }, { x: 30, y: 49, pos: "CM" }, { x: 64, y: 43, pos: "AM" },
      { x: 82, y: 27, pos: "RW" }, { x: 50, y: 17, pos: "ST" }, { x: 18, y: 27, pos: "LW" },
    ],
  },
  F442: {
    label: "4-4-2",
    spots: [
      { x: 50, y: 92, pos: "GK" },
      { x: 84, y: 74, pos: "RB" }, { x: 62, y: 80, pos: "CB" }, { x: 38, y: 80, pos: "CB" }, { x: 16, y: 74, pos: "LB" },
      { x: 82, y: 50, pos: "RM" }, { x: 60, y: 54, pos: "CM" }, { x: 40, y: 54, pos: "CM" }, { x: 18, y: 50, pos: "LM" },
      { x: 60, y: 20, pos: "ST" }, { x: 40, y: 20, pos: "ST" },
    ],
  },
  F352: {
    label: "3-5-2",
    spots: [
      { x: 50, y: 92, pos: "GK" },
      { x: 68, y: 80, pos: "CB" }, { x: 50, y: 82, pos: "CB" }, { x: 32, y: 80, pos: "CB" },
      { x: 88, y: 55, pos: "RWB" }, { x: 66, y: 54, pos: "CM" }, { x: 50, y: 49, pos: "CM" }, { x: 34, y: 54, pos: "CM" }, { x: 12, y: 55, pos: "LWB" },
      { x: 60, y: 20, pos: "ST" }, { x: 40, y: 20, pos: "ST" },
    ],
  },
};

const POSITIONS = ["GK", "RB", "LB", "CB", "RWB", "LWB", "DM", "CM", "AM", "RM", "LM", "RW", "LW", "ST"];
const ROLES = [
  "Goalkeeper", "Ball-Playing Def.", "Stopper", "Defensive FB", "Wing Back",
  "Deep-Lying Playmaker", "Box-to-Box", "Ball-Winning Mid", "Attacking Mid",
  "Winger", "Inside Forward", "Poacher", "Target Man", "False Nine", "Infiltrating Fwd",
];

function posGroup(pos: string): PosGroup {
  if (pos === "GK") return "GK";
  if (["RB", "LB", "CB", "RWB", "LWB"].includes(pos)) return "DEF";
  if (["DM", "CM", "AM", "RM", "LM"].includes(pos)) return "MID";
  return "ATT";
}

interface Override {
  pos?: string;
  role?: string;
}

const STARTING_XI = DEMO_SQUAD.slice(0, 11);

export function Tactics() {
  const { t, mode, setMode } = useApp();
  const advanced = mode === "advanced";

  const [formation, setFormation] = useState<FormationId>("F433");
  const [mentality, setMentality] = useState("balanced");
  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [instr, setInstr] = useState({ lineHeight: 58, pressing: 62, tempo: 50, widthInstr: 66, directness: 44 });

  const spots = FORMATIONS[formation].spots;

  const posOf = (i: number) => overrides[STARTING_XI[i]!.id]?.pos ?? spots[i]!.pos;
  const roleOf = (i: number) => overrides[STARTING_XI[i]!.id]?.role ?? STARTING_XI[i]!.role;

  const setOverride = (id: number, patch: Override) =>
    setOverrides((o) => ({ ...o, [id]: { ...o[id], ...patch } }));

  const selectedIdx = selected == null ? -1 : STARTING_XI.findIndex((p) => p.id === selected);

  return (
    <>
      <Masthead
        kicker={t.tactics}
        title={t.tacticsTitle}
        meta={t.tacticsSubtitle}
        action={
          <Segmented
            accent
            ariaLabel={t.customize}
            value={mode}
            onChange={setMode}
            options={[
              { value: "simple", label: t.simple },
              { value: "advanced", label: t.advanced },
            ]}
          />
        }
      />

      {!advanced && (
        <div className="hint">
          <span className="kicker">{t.simple}</span>
          <span>{t.advancedHint}</span>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr", alignItems: "start" }}>
        <Panel
          title={
            <span className="u-row u-gap-3">
              {t.formation}
              <Badge tone="primary">{FORMATIONS[formation].label}</Badge>
            </span>
          }
        >
          <div className="pitch">
            <div className="pitch-markings" />
            {spots.map((s, i) => {
              const p = STARTING_XI[i]!;
              const pos = posOf(i);
              const isSel = selected === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`pitch-token${advanced ? " pitch-token--editable" : ""}${isSel ? " is-selected" : ""}`}
                  style={{ left: `${s.x}%`, top: `${s.y}%` }}
                  onClick={() => advanced && setSelected(p.id)}
                  disabled={!advanced}
                  title={`${p.name} · ${roleOf(i)}`}
                >
                  <span className="pitch-dot" style={{ background: groupColorVar(posGroup(pos)) }}>
                    {pos}
                  </span>
                  <span className="pitch-name">{p.name.split(" ")[1] ?? p.name}</span>
                </button>
              );
            })}
          </div>
        </Panel>

        <div className="u-col u-gap-4">
          <Panel title={t.formation}>
            <Segmented
              value={formation}
              onChange={(v) => { setFormation(v); setSelected(null); }}
              options={(Object.keys(FORMATIONS) as FormationId[]).map((f) => ({ value: f, label: FORMATIONS[f].label }))}
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

          {advanced && (
            <>
              <Panel title={t.playerEditor}>
                {selectedIdx < 0 ? (
                  <p className="u-muted" style={{ fontSize: "var(--fs-sm)" }}>{t.selectPlayerHint}</p>
                ) : (
                  <div className="u-col u-gap-4">
                    <div className="u-row u-gap-3">
                      <span
                        className="pitch-dot"
                        style={{ background: groupColorVar(posGroup(posOf(selectedIdx))), position: "static" }}
                      >
                        {posOf(selectedIdx)}
                      </span>
                      <span className="name-serif" style={{ fontSize: "var(--fs-lg)" }}>
                        {STARTING_XI[selectedIdx]!.name}
                      </span>
                    </div>
                    <label className="field">
                      <span className="field-label">{t.positionLabel}</span>
                      <select
                        className="select"
                        value={posOf(selectedIdx)}
                        onChange={(e) => setOverride(selected!, { pos: e.target.value })}
                      >
                        {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span className="field-label">{t.role}</span>
                      <select
                        className="select"
                        value={roleOf(selectedIdx)}
                        onChange={(e) => setOverride(selected!, { role: e.target.value })}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </label>
                  </div>
                )}
              </Panel>

              <Panel title={t.teamInstructions}>
                <div className="u-col u-gap-4">
                  {([
                    ["lineHeight", t.lineHeight],
                    ["pressing", t.pressing],
                    ["tempo", t.tempo],
                    ["widthInstr", t.widthInstr],
                    ["directness", t.directness],
                  ] as const).map(([key, label]) => (
                    <div className="slider-row" key={key}>
                      <span className="field-label">{label}</span>
                      <span className="slider-val">{instr[key]}</span>
                      <input
                        className="range"
                        type="range"
                        min={0}
                        max={100}
                        value={instr[key]}
                        onChange={(e) => setInstr((s) => ({ ...s, [key]: Number(e.target.value) }))}
                      />
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          )}
        </div>
      </div>
    </>
  );
}
