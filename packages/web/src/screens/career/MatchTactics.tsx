import { useState } from "react";
import { Move } from "lucide-react";
import { Formation, MarkingScheme, Mentality, Position, type Team } from "@fut/domain";
import { TACTIC_PRESETS, type StoredInstructions, type TacticPresetKey } from "@fut/career";
import type { ClubKit } from "@fut/competition";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { InjuryMark } from "../../components/match/InjuryMark";
import { LivePlayerSheet } from "../../components/match/LivePlayerSheet";
import { useFormat } from "../../lib/format";
import { Alert } from "../../components/ui/alert";
import { Confirm } from "../../components/ui/alert-dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Label } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Pitch, type PitchSpot } from "../../components/pitch";
import {
  BenchCard,
  FORMATION_LABEL,
  groupOf,
  InstructionsCard,
  MentalityToggle,
  PresetPicker,
  usePosLabels,
  SlotMarker,
} from "../../components/tactics/pieces";
import { shortNamesFor } from "../../lib/names";
import type { SpatialController } from "../../hooks/useSpatialMatch";

/**
 * The full tactics board, live. Same controls as the squad-tactics screen —
 * shape on the pitch, formation, manual cells, roles and every slider — but read
 * from and applied to the RUNNING match: fitness is what's left in the legs
 * right now, and personnel changes cost a substitution.
 *
 * Changes here last for this match only; the club's stored tactics are untouched.
 */
export function MatchTactics({
  live,
  team,
  kit,
  minute,
  score,
  onClose,
  injuredId,
}: {
  live: SpatialController;
  team: Team;
  kit: ClubKit;
  minute: number;
  score: { home: number; away: number };
  /** Omitted while an injury is unresolved — the manager can't just walk away. */
  onClose?: () => void;
  /** A hurt player who must come off before play resumes. */
  injuredId?: string;
}) {
  const { t } = useApp();
  const fmt = useFormat();
  const { shortPos } = usePosLabels();
  const { career } = useCareer();
  const [moveMode, setMoveMode] = useState(false);
  /** The player whose drawer is open — the only selection this screen has now. */
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const shape = live.shape(team.id);
  const benchPlayers = live.bench(team.id);
  const subsLeft = live.subsRemaining(team.id);
  const instructions = live.instructions(team.id);

  // Bench condition/rating come from the career (the engine has no body for a
  // player who hasn't come on yet).
  const squad = career?.tacticsView(team.id);
  const squadById = new Map(
    // The WHOLE squad, not just the matchday eighteen: the engine's bench can hold
    // someone this view files under `reserves`, and a lookup that misses is what
    // printed an overall of 0. The rating no longer depends on this at all, but
    // condition still does, so the map may as well cover everyone.
    [
      ...(squad?.slots ?? []).map((s) => s.player).filter((p): p is NonNullable<typeof p> => Boolean(p)),
      ...(squad?.bench ?? []),
      ...(squad?.reserves ?? []),
    ].map((p) => [p.playerId, p]),
  );
  const short = shortNamesFor([...shape.map((p) => ({ playerId: p.id, name: p.name })), ...benchPlayers.map((p) => ({ playerId: p.id, name: p.name }))]);
  const nameOf = (id: string, fallback: string) => short.get(id) ?? fallback;

  /**
   * Bring a substitute on for someone — spends one of five, and cannot be undone.
   *
   * ASKS first, and this is the one action on the board that does. Everything else here can be put
   * back: drag a shirt to the wrong spot and drag it again, move a slider and move it back. A
   * substitution is permanent, spends one of five, and can be triggered by a drop on a shirt — which
   * is a gesture a phone produces by accident.
   *
   * The two callers both come through here, so the question cannot be routed around: the drawer's
   * button and the drag-and-drop. It is state rather than a callback for exactly that reason.
   */
  const [pendingSub, setPendingSub] = useState<{ outId: string; inId: string } | null>(null);
  const [confirmPlayOn, setConfirmPlayOn] = useState(false);
  const trySub = (outId: string, inId: string) => {
    if (subsLeft <= 0) return;
    setPendingSub({ outId, inId });
  };
  const confirmSub = () => {
    if (!pendingSub) return;
    live.substitute(team.id, pendingSub.outId, pendingSub.inId);
    setPendingSub(null);
    setSelectedId(null);
  };

  const spots: PitchSpot[] = shape.map((p) => ({
    id: p.id,
    x: p.width * 100,
    y: 100 - p.depth * 100,
    pos: shortPos(p.fielded),
    group: groupOf(p.fielded),
    name: nameOf(p.id, p.name),
    title: `${p.name} · ${p.overall} · ${Math.round(p.stamina * 100)}%`,
    marker: (
      <SlotMarker
        kit={kit}
        pos={shortPos(p.fielded)}
        overall={p.overall}
        fitness={p.stamina * 100}
        booked={p.booked}
        injured={p.id === injuredId}
      />
    ),
  }));

  /** Drop a shirt on a shirt = swap; drop a bench card on a shirt = substitution. */
  const dropOnSpot = (from: string, to: number | string) => {
    const toId = String(to);
    if (from.startsWith("bench:")) trySub(toId, from.slice(6));
    else if (from !== toId) live.swapPlayers(from, toId);
  };


  // The engine's instructions carry the sliders the board edits; formation and
  // mentality get their own controls above them.
  const sliderValues: StoredInstructions = {
    tempo: instructions?.tempo ?? 0.5,
    pressing: instructions?.pressing ?? 0.5,
    lineHeight: instructions?.lineHeight ?? 0.5,
    width: instructions?.width ?? 0.5,
    directness: instructions?.directness ?? 0.5,
    markingScheme: instructions?.markingScheme ?? MarkingScheme.Zonal,
  };

  /** A preset is one instruction patch — mentality and every slider at once. */
  const applyPresetLive = (key: TacticPresetKey) => {
    const preset = TACTIC_PRESETS.find((p) => p.key === key);
    if (preset) live.setInstruction(team.id, { mentality: preset.mentality, ...preset.instructions });
  };

  const savedTactics = squad?.tactics ?? [];
  /**
   * Apply one of the club's saved tactics to the side ALREADY on the pitch:
   * its shape, its instructions, and the roles of whichever of its players are
   * out there. Personnel are untouched (that would cost substitutions), and so
   * are the stored tactics — like every other change here, this is match-only.
   */
  const loadSavedTactic = (id: string) => {
    const tac = career?.savedTactic(id, team.id);
    if (!tac) return;
    live.setFormation(team.id, tac.formation);
    live.setInstruction(team.id, { mentality: tac.mentality, ...tac.instructions });
    for (const p of live.shape(team.id)) {
      const role = tac.roles[p.id];
      if (role) live.setRole(p.id, role);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.matchTactics}</h1>
          <p className="text-sm text-fg-muted">{moveMode ? t.movePositionsHint : t.matchTacticsHint}</p>
        </div>
        {/* This row could not break — 439px of controls in a 375px viewport, so the
            resume button was simply off-screen. It wraps now, and the occasional
            tool sheds its label on a phone. */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Badge variant="primary">{minute}'</Badge>
          <span className="serif text-xl font-bold tabular-nums">{score.home} : {score.away}</span>
          <Badge variant={subsLeft > 0 ? "muted" : "gold"}>{t.subsLeft}: {subsLeft}</Badge>
          <Button
            variant={moveMode ? "primary" : "ghost"}
            size="icon"
            className="sm:hidden"
            aria-label={t.movePositions}
            onClick={() => setMoveMode((m) => !m)}
          >
            <Move />
          </Button>
          <Button
            variant={moveMode ? "primary" : "ghost"}
            className="hidden sm:inline-flex"
            onClick={() => setMoveMode((m) => !m)}
          >
            {t.movePositions}
          </Button>
          {onClose ? (
            <Button variant="primary" onClick={onClose}>{t.resumeMatch}</Button>
          ) : (
            // No way back to the pitch until the injury is dealt with, but the
            // manager can always choose to carry on a man short.
            <Button variant="secondary" onClick={() => setConfirmPlayOn(true)}>{t.playOnShort}</Button>
          )}
        </div>
      </div>

      {/* `danger`, and it keeps its own mark: an injury has an established icon on this board and the
          alert should not introduce a second symbol for the same thing. */}
      {injuredId && (
        <Alert tone="danger" icon={<InjuryMark />}>
          {fmt.t(t.injuryForcesChange, { name: nameOf(injuredId, injuredId) })}
        </Alert>
      )}

      <LivePlayerSheet
        shape={shape}
        bench={benchPlayers}
        selectedId={selectedId}
        onClose={() => setSelectedId(null)}
        subsLeft={subsLeft}
        onPosition={(id, position) => live.setFieldedPosition(id, position)}
        onRole={(id, role) => live.setRole(id, role)}
        onSwapOnPitch={(a, b) => live.swapPlayers(a, b)}
        onSubstitute={trySub}
      />

      {/* Names, not ids, and the cost said out loud — he is being asked to spend one of five on THESE
          two players, and a dialog that only says "are you sure?" is one he learns to click through. */}
      <Confirm
        open={pendingSub !== null}
        onOpenChange={(o) => !o && setPendingSub(null)}
        title={t.substitution}
        body={`${fmt.t(t.confirmSubBody, {
          out: nameOf(pendingSub?.outId ?? "", pendingSub?.outId ?? ""),
          in: nameOf(pendingSub?.inId ?? "", pendingSub?.inId ?? ""),
        })} ${fmt.t(t.confirmSubCost, { n: subsLeft })}`}
        confirmLabel={t.makeSub}
        cancelLabel={t.cancel}
        onConfirm={confirmSub}
      />

      {/* Playing on a man down is not undoable either, and it is reached from the one button that is
          allowed to leave an unresolved injury — the easiest wrong click on the board. */}
      <Confirm
        open={confirmPlayOn}
        onOpenChange={setConfirmPlayOn}
        title={t.playOnShort}
        body={fmt.t(t.confirmPlayOnBody, { name: nameOf(injuredId ?? "", injuredId ?? "") })}
        confirmLabel={t.playOnShort}
        cancelLabel={t.cancel}
        onConfirm={() => {
          live.playOnWithoutInjured(team.id);
          setConfirmPlayOn(false);
        }}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader><CardTitle>{t.onPitch} · {shape.length}</CardTitle></CardHeader>
          <CardContent className="p-3 sm:p-4">
            <div className="mx-auto max-w-md">
              <Pitch
                spots={spots}
                editable
                onSelect={(id) => setSelectedId(String(id))}
                onDropOnSpot={dropOnSpot}
                moveMode={moveMode}
                onMoveSpot={(id, x, y) => live.movePlayer(String(id), (100 - y) / 100, x / 100)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-start-1 lg:row-start-2">
          <CardHeader><CardTitle>{t.bench} · {benchPlayers.length}</CardTitle></CardHeader>
          {/* The SAME grid as the squad board's two bench panels, for the same two reasons: the count
              has to come from this panel (it shares a row with a fixed 360px column, so a viewport
              breakpoint knows nothing useful about its width) and the track is flat 3.5rem because a
              `BenchCard` is a fixed-width chip that must not stretch. This bench is the more cramped of
              the two boards, so it gains the most: 4 cards abreast became 8 at 1280. */}
          <CardContent className="grid grid-cols-[repeat(auto-fill,3.5rem)] gap-1.5">
            {benchPlayers.length === 0 && <p className="col-span-full text-sm text-fg-muted">{t.noSubsLeft}</p>}
            {benchPlayers.map((p) => {
              const info = squadById.get(p.id);
              return (
                <BenchCard
                  key={p.id}
                  kit={kit}
                  position={p.position}
                  name={nameOf(p.id, p.name)}
                  // From the ENGINE, which holds the athlete. `?? 0` here printed a
                  // rating no footballer has for anyone outside the matchday
                  // eighteen, because the career view being consulted only lists
                  // those. Fitness stays career-side and is simply omitted when
                  // unknown — the card hides the bar rather than claiming 100.
                  overall={p.overall}
                  // Career-side, like the condition beside it: the engine's athletes carry no squad
                  // number, so it is simply absent for anyone the view cannot name.
                  shirtNumber={info?.shirtNumber}
                  fitness={info?.fitness}
                  injured={info?.injured}
                  disabled={subsLeft <= 0}
                  dragId={`bench:${p.id}`}
                  title={`${p.name} · ${p.overall}`}
                  // A substitute cannot be "selected" on its own here: coming on
                  // is something you do TO a player who is already out there, so the
                  // move starts from him. Dragging the card onto a shirt still works.
                  onSelect={() => undefined}
                />
              );
            })}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Card>
            <CardHeader><CardTitle>{t.matchSetup}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>{t.formation}</Label>
                <Select value={instructions?.formation} onValueChange={(x) => live.setFormation(team.id, x as Formation)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.values(Formation).map((f) => <SelectItem key={f} value={f}>{FORMATION_LABEL[f] ?? f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t.mentality}</Label>
                <MentalityToggle
                  value={instructions?.mentality ?? Mentality.Balanced}
                  onChange={(m) => live.setInstruction(team.id, { mentality: m })}
                />
              </div>
              <PresetPicker
                mentality={instructions?.mentality ?? Mentality.Balanced}
                instructions={sliderValues}
                onApply={applyPresetLive}
              />
              {/* Shown from ONE tactic upwards. Gating it at two hid the
                  control from anyone who hadn't made a second setup — and with
                  a single tactic it's still useful: it puts the side back to
                  the shape you prepared after you've fiddled mid-match. */}
              {savedTactics.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label>{t.loadSavedTactic}</Label>
                  <Select value="" onValueChange={loadSavedTactic}>
                    <SelectTrigger><SelectValue placeholder={t.loadSavedTactic} /></SelectTrigger>
                    <SelectContent>
                      {savedTactics.map((tac) => <SelectItem key={tac.id} value={tac.id}>{tac.name} · {FORMATION_LABEL[tac.formation] ?? tac.formation}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <p className="text-2xs text-fg-faint">{t.tacticChangeHint}</p>
            </CardContent>
          </Card>

          <InstructionsCard values={sliderValues} onChange={(patch) => live.setInstruction(team.id, patch)} />
        </div>
      </div>
    </div>
  );
}
