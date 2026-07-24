import { Formation, Mentality } from "@fut/domain";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Label } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

const FORMATIONS = Object.values(Formation);
const MENTALITIES = Object.values(Mentality);

const FORMATION_LABEL: Record<string, string> = {
  [Formation.F442]: "4-4-2", [Formation.F442Diamond]: "4-4-2 ◇", [Formation.F433]: "4-3-3",
  [Formation.F4231]: "4-2-3-1", [Formation.F424]: "4-2-4", [Formation.F352]: "3-5-2",
  [Formation.F532]: "5-3-2", [Formation.F343]: "3-4-3", [Formation.F541]: "5-4-1",
};

export function Tactics() {
  const { t } = useApp();
  const { career, dispatch } = useCareer();
  if (!career) return null;
  const snap = career.snapshot();
  const club = snap.clubs[snap.managedClubId]!;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.tacticsTitle}</h1>
        <p className="text-sm text-fg-muted">{t.tacticsSubtitle}</p>
      </div>
      <Card className="max-w-md">
        <CardHeader><CardTitle>{club.name}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>{t.formation}</Label>
            <Select value={club.formation} onValueChange={(v) => dispatch({ type: "setClubTactics", clubId: club.id, formation: v as Formation })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FORMATIONS.map((f) => (
                  <SelectItem key={f} value={f}>{FORMATION_LABEL[f] ?? f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t.mentality}</Label>
            <Select value={club.mentality} onValueChange={(v) => dispatch({ type: "setClubTactics", clubId: club.id, mentality: v as Mentality })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MENTALITIES.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
