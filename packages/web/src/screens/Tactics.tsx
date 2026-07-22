import { useState } from "react";
import { Info } from "lucide-react";
import { useApp } from "../app/AppProviders";
import { PageHeader } from "../components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Slider } from "../components/ui/slider";
import { Pitch, type PitchSpot } from "../components/pitch";
import { DEMO_SQUAD, type PosGroup } from "../data/demo";
import { groupColorVar } from "../util/pos";

type FormationId = "F433" | "F442" | "F352";

const FORMATIONS: Record<FormationId, { label: string; spots: { x: number; y: number; pos: string }[] }> = {
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

const STARTING_XI = DEMO_SQUAD.slice(0, 11);
const INSTR: { key: keyof Instr; labelKey: "lineHeight" | "pressing" | "tempo" | "widthInstr" | "directness" }[] = [
  { key: "lineHeight", labelKey: "lineHeight" },
  { key: "pressing", labelKey: "pressing" },
  { key: "tempo", labelKey: "tempo" },
  { key: "widthInstr", labelKey: "widthInstr" },
  { key: "directness", labelKey: "directness" },
];
interface Instr { lineHeight: number; pressing: number; tempo: number; widthInstr: number; directness: number; }

export function Tactics() {
  const { t, mode, setMode } = useApp();
  const advanced = mode === "advanced";
  const [formation, setFormation] = useState<FormationId>("F433");
  const [mentality, setMentality] = useState("balanced");
  const [overrides, setOverrides] = useState<Record<number, { pos?: string; role?: string }>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [instr, setInstr] = useState<Instr>({ lineHeight: 58, pressing: 62, tempo: 50, widthInstr: 66, directness: 44 });

  const spots = FORMATIONS[formation].spots;
  const posOf = (i: number) => overrides[STARTING_XI[i]!.id]?.pos ?? spots[i]!.pos;
  const roleOf = (i: number) => overrides[STARTING_XI[i]!.id]?.role ?? STARTING_XI[i]!.role;
  const setOverride = (id: number, patch: { pos?: string; role?: string }) =>
    setOverrides((o) => ({ ...o, [id]: { ...o[id], ...patch } }));

  const pitchSpots: PitchSpot[] = spots.map((s, i) => {
    const p = STARTING_XI[i]!;
    const pos = posOf(i);
    return { id: p.id, x: s.x, y: s.y, pos, group: posGroup(pos), name: p.name.split(" ")[1] ?? p.name, title: `${p.name} · ${roleOf(i)}` };
  });

  const selIdx = selected == null ? -1 : STARTING_XI.findIndex((p) => p.id === selected);

  return (
    <>
      <PageHeader
        kicker={t.tactics}
        title={t.tacticsTitle}
        meta={t.tacticsSubtitle}
        action={
          <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as typeof mode)}>
            <ToggleGroupItem value="simple" accent>{t.simple}</ToggleGroupItem>
            <ToggleGroupItem value="advanced" accent>{t.advanced}</ToggleGroupItem>
          </ToggleGroup>
        }
      />

      {!advanced && (
        <div className="mb-4 flex items-center gap-3 rounded-md border border-dashed border-border-strong px-4 py-3 text-sm text-fg-muted">
          <Info className="size-4 shrink-0 text-primary" />
          <span>{t.advancedHint}</span>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2.5">{t.formation}<Badge variant="primary">{FORMATIONS[formation].label}</Badge></span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Pitch spots={pitchSpots} selectedId={selected} onSelect={(id) => setSelected(id as number)} editable={advanced} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>{t.formation}</CardTitle></CardHeader>
            <CardContent>
              <ToggleGroup
                type="single"
                value={formation}
                onValueChange={(v) => { if (v) { setFormation(v as FormationId); setSelected(null); } }}
                className="w-full"
              >
                {(Object.keys(FORMATIONS) as FormationId[]).map((f) => (
                  <ToggleGroupItem key={f} value={f} className="flex-1">{FORMATIONS[f].label}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t.mentality}</CardTitle></CardHeader>
            <CardContent>
              <ToggleGroup type="single" value={mentality} onValueChange={(v) => v && setMentality(v)} className="w-full">
                <ToggleGroupItem value="defensive" className="flex-1">Def</ToggleGroupItem>
                <ToggleGroupItem value="balanced" className="flex-1">Bal</ToggleGroupItem>
                <ToggleGroupItem value="attacking" className="flex-1">Att</ToggleGroupItem>
              </ToggleGroup>
            </CardContent>
          </Card>

          {advanced && (
            <>
              <Card>
                <CardHeader><CardTitle>{t.playerEditor}</CardTitle></CardHeader>
                <CardContent>
                  {selIdx < 0 ? (
                    <p className="text-sm text-fg-muted">{t.selectPlayerHint}</p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="grid size-9 place-items-center rounded-md text-2xs font-bold text-[#04140e]"
                          style={{ background: groupColorVar(posGroup(posOf(selIdx))) }}
                        >
                          {posOf(selIdx)}
                        </span>
                        <span className="serif text-lg font-semibold">{STARTING_XI[selIdx]!.name}</span>
                      </div>
                      <label className="flex flex-col gap-1.5">
                        <span className="caps text-fg-faint">{t.positionLabel}</span>
                        <Select value={posOf(selIdx)} onValueChange={(v) => setOverride(selected!, { pos: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {POSITIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="caps text-fg-faint">{t.role}</span>
                        <Select value={roleOf(selIdx)} onValueChange={(v) => setOverride(selected!, { role: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </label>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>{t.teamInstructions}</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {INSTR.map(({ key, labelKey }) => (
                    <div key={key}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="caps text-fg-faint">{t[labelKey]}</span>
                        <span className="text-sm font-bold tabular-nums">{instr[key]}</span>
                      </div>
                      <Slider
                        value={[instr[key]]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={([v]) => setInstr((s) => ({ ...s, [key]: v! }))}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
