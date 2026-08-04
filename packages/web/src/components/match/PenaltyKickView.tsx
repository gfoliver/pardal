import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { ClubKit } from "@fut/competition";
import type { PenaltyKick, PenaltyOutcome } from "@fut/engine";
import { useApp } from "../../app/AppProviders";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { cn } from "../../lib/utils";
import type { UIStringKey } from "../../i18n/strings";
import { shortPlayerName } from "../../lib/names";
import {
  BALL_R,
  BAR,
  GOAL_HALF,
  GOAL_HEIGHT,
  GROUND,
  KEEPER_LENGTH,
  NET_DEPTH,
  POST,
  SPOT_DEPTH,
  VIEWBOX,
  ballPose,
  clamp,
  keeperPose,
  project,
} from "../../lib/penalty-view";

const OUTCOME_LABEL: Record<PenaltyOutcome, UIStringKey> = {
  goal: "pkScored",
  saved: "pkSaved",
  post: "pkPost",
  wide: "pkWide",
};

/** How long the whole thing takes: strike, dive, landing. */
const FLIGHT_MS = 1150;
const VB = VIEWBOX;

/**
 * A 0→1 clock for one replay, restarted whenever `key` changes.
 *
 * Frame-driven, because everything it moves is SVG geometry. The timeout is a
 * backstop for a tab that isn't painting: requestAnimationFrame is suspended
 * there, and without it the replay would sit frozen on the penalty spot instead
 * of simply being over by the time you look again.
 */
function useReplayClock(duration: number, key: string): number {
  const [p, setP] = useState(0);
  useEffect(() => {
    setP(0);
    let raf = 0;
    let t0 = 0;
    const step = (now: number) => {
      t0 ||= now;
      const next = Math.min(1, (now - t0) / duration);
      setP(next);
      if (next < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const backstop = setTimeout(() => setP(1), duration + 400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(backstop);
    };
  }, [duration, key]);
  return p;
}

const OUTCOME_TONE: Record<PenaltyOutcome, string> = {
  goal: "bg-gradient-to-br from-[var(--brand-emerald)] to-[var(--brand-lime)] text-[var(--text-on-accent)]",
  saved: "bg-gold text-[var(--text-on-accent)]",
  post: "bg-white/90 text-[var(--text-on-accent)]",
  // A black overlay, so white type is the readable choice rather than a lapse.
  wide: "bg-black/80 text-white ring-1 ring-white/20",
};

/**
 * The penalty, replayed from the front.
 *
 * Everything on screen comes off the recorded kick: the ball travels to the
 * point the engine stored, the keeper goes the way the engine stored, and the
 * verdict is therefore something you read off the picture — the ball nestling
 * inside the post, or in his gloves, or sailing past the frame — rather than a
 * caption you have to take on trust.
 */
export function PenaltyKickView({
  kick,
  taker,
  minute,
  keeperKit,
}: {
  kick: PenaltyKick;
  taker?: string;
  minute: number;
  keeperKit: ClubKit;
}) {
  const { t } = useApp();
  const [take, setTake] = useState(0);
  // One clock for the whole replay. Both the ball and the keeper are redrawn from
  // it every frame: SVG geometry can't be driven by a CSS transition, which is
  // why the keeper used to snap straight to his landing position instead of
  // diving there.
  const p = useReplayClock(FLIGHT_MS, `${take}:${kick.x},${kick.y},${kick.dive},${kick.outcome}`);
  const landed = p >= 1;

  const { pos: ball, shadow, travel } = ballPose(kick, p);
  const rest = ballPose(kick, 1).pos; // where it ends up, for the impact marker
  const contact = kick.outcome === "saved" || kick.outcome === "post";

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-md border border-border-strong" style={{ background: "var(--pitch-grass)" }}>
        <svg viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`} className="block h-auto w-full">
          <Backdrop />
          <Net />
          <Keeper kick={kick} kit={keeperKit} p={p} />

          {/* Ball shadow on the grass — the only cue for how high it actually went. */}
          <ellipse
            cx={0}
            cy={0}
            rx={BALL_R * 1.1}
            ry={BALL_R * 0.45}
            fill="#000"
            opacity={0.34 - travel * 0.16}
            style={{ transform: `translate(${shadow.x}px, ${shadow.y}px) scale(${shadow.s})` }}
          />
          <g style={{ transform: `translate(${ball.x}px, ${ball.y}px) scale(${ball.s}) rotate(${travel * 420}deg)` }}>
            <Ball />
          </g>
          {/* Posts last: a ball in the net belongs BEHIND them, and one striking
              the woodwork should look like it hit the front of the post. */}
          <Frame />
          {/* Where it struck something: gloves or woodwork. */}
          {landed && contact && (
            <g style={{ transform: `translate(${rest.x}px, ${rest.y}px)` }} className="animate-in fade-in zoom-in-50 duration-200">
              <circle r={BALL_R * 2.4} fill="none" stroke={kick.outcome === "post" ? "#fff" : "var(--gold)"} strokeWidth={0.07} opacity={0.9} />
            </g>
          )}
        </svg>
      </div>

      <div className="flex items-center gap-3">
        <span
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-bold uppercase tracking-caps transition-opacity duration-200",
            OUTCOME_TONE[kick.outcome],
            landed ? "opacity-100" : "opacity-0",
          )}
        >
          {t[OUTCOME_LABEL[kick.outcome]]}
        </span>
        <div className="min-w-0 flex-1 text-xs text-fg-muted">
          <span className="font-semibold text-fg">{taker ? shortPlayerName(taker) : "—"}</span> · {minute}'
        </div>
        <Button variant="ghost" size="sm" onClick={() => setTake((n) => n + 1)}>
          <RotateCcw />
          {t.pkReplay}
        </Button>
      </div>
    </div>
  );
}

/** Six-yard box, the one marking near enough to show the ground receding. */
const GOAL_AREA_HALF = 18.32 / 2;
const GOAL_AREA_DEPTH = 5.5;
const HOARDING_DEPTH = -7; // advertising boards, set back behind the goal
const HOARDING_HEIGHT = 1;
const NEAR = 24; // the nearest ground the camera sees
const FAR = HOARDING_DEPTH; // the furthest, where the boards cut the grass off

/** A ground quad between two depths and two world x's, in perspective. */
function groundQuad(x0: number, x1: number, dNear: number, dFar: number): string {
  const a = project(x0, 0, dNear);
  const b = project(x1, 0, dNear);
  const c = project(x1, 0, dFar);
  const d = project(x0, 0, dFar);
  return `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`;
}

/**
 * Everything behind the ball: crowd, boards, grass and markings.
 *
 * The mown stripes run AWAY from the camera, so the projection converges them by
 * itself — that single cue does more for the sense of depth than any amount of
 * shading, because it is the same perspective the ball and the keeper obey.
 */
function Backdrop() {
  const box = project(GOAL_AREA_HALF, 0, GOAL_AREA_DEPTH);
  const spot = project(0, 0, SPOT_DEPTH);
  const boardTop = project(0, HOARDING_HEIGHT, HOARDING_DEPTH).y;
  const boardFoot = project(0, 0, HOARDING_DEPTH).y;
  return (
    <>
      {/* Stand: dark, with just enough texture to read as people rather than dots. */}
      <rect x={VB.x} y={VB.y} width={VB.w} height={boardTop - VB.y} fill="#080f0d" />
      {Array.from({ length: 6 }, (_, row) =>
        Array.from({ length: 74 }, (_, i) => (
          <rect
            key={`${row}-${i}`}
            x={VB.x + 0.05 + i * 0.18 + (row % 2) * 0.09}
            y={VB.y + 0.1 + row * 0.17}
            width={0.09}
            height={0.1}
            rx={0.045}
            fill="#fff"
            opacity={0.03 + ((i * 7 + row * 3) % 5) * 0.012}
          />
        )),
      )}
      {/* Advertising boards behind the goal — the band that says "stadium". */}
      <rect x={VB.x} y={boardTop} width={VB.w} height={boardFoot - boardTop} fill="#1d2b26" />
      <rect x={VB.x} y={boardTop} width={VB.w} height={0.045} fill="#fff" opacity={0.16} />
      <rect x={VB.x} y={boardFoot - 0.04} width={VB.w} height={0.04} fill="#000" opacity={0.35} />

      <polygon points={groundQuad(-60, 60, NEAR, FAR)} fill="var(--pitch-grass)" />
      {Array.from({ length: 13 }, (_, i) => -26 + i * 4).map((x0, i) =>
        i % 2 === 0 ? <polygon key={x0} points={groundQuad(x0, x0 + 4, NEAR, FAR)} fill="#fff" opacity={0.032} /> : null,
      )}

      <g fill="none" stroke="var(--pitch-line)" strokeWidth={0.06} opacity={0.8}>
        {/* Goal line, and the six-yard box drawn in perspective. */}
        <line x1={VB.x} y1={GROUND} x2={-GOAL_HALF - POST} y2={GROUND} />
        <line x1={GOAL_HALF + POST} y1={GROUND} x2={VB.x + VB.w} y2={GROUND} />
        <line x1={-box.x} y1={box.y} x2={box.x} y2={box.y} />
        <line x1={-GOAL_AREA_HALF} y1={GROUND} x2={-box.x} y2={box.y} />
        <line x1={GOAL_AREA_HALF} y1={GROUND} x2={box.x} y2={box.y} />
      </g>
      <ellipse cx={spot.x} cy={spot.y} rx={0.16 * spot.s} ry={0.06 * spot.s} fill="var(--pitch-line)" opacity={0.9} />
    </>
  );
}

/** The net box: a back plane set behind the goal line, joined at the corners. */
function Net() {
  const bl = project(-GOAL_HALF, 0, -NET_DEPTH);
  const bt = project(-GOAL_HALF, GOAL_HEIGHT, -NET_DEPTH);
  const br = project(GOAL_HALF, 0, -NET_DEPTH);
  const MESH = "rgba(255,255,255,0.30)";
  const rows = 7;
  const cols = 13;
  return (
    <>
      {/* Side panels + roof, so the goal has volume rather than being a rectangle. */}
      <polygon points={`${-GOAL_HALF},${GROUND} ${bl.x},${bl.y} ${bt.x},${bt.y} ${-GOAL_HALF},${BAR}`} fill="rgba(0,0,0,0.30)" />
      <polygon points={`${GOAL_HALF},${GROUND} ${br.x},${br.y} ${-bt.x},${bt.y} ${GOAL_HALF},${BAR}`} fill="rgba(0,0,0,0.30)" />
      <polygon points={`${-GOAL_HALF},${BAR} ${bt.x},${bt.y} ${-bt.x},${bt.y} ${GOAL_HALF},${BAR}`} fill="rgba(0,0,0,0.22)" />
      <rect x={bt.x} y={bt.y} width={-bt.x * 2} height={bl.y - bt.y} fill="rgba(0,0,0,0.34)" />
      {/* Mesh on the back plane only — enough to read "net" without moiré. */}
      <g stroke={MESH} strokeWidth={0.018}>
        {Array.from({ length: cols + 1 }, (_, i) => {
          const x = bt.x + ((-bt.x * 2) / cols) * i;
          return <line key={`v${i}`} x1={x} y1={bt.y} x2={x} y2={bl.y} />;
        })}
        {Array.from({ length: rows + 1 }, (_, i) => {
          const y = bt.y + ((bl.y - bt.y) / rows) * i;
          return <line key={`h${i}`} x1={bt.x} y1={y} x2={-bt.x} y2={y} />;
        })}
      </g>
    </>
  );
}

/** A ball, not a dot: the centre panel plus its neighbours is enough at this size. */
function Ball() {
  const pent = Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return `${(Math.cos(a) * BALL_R * 0.42).toFixed(3)},${(Math.sin(a) * BALL_R * 0.42).toFixed(3)}`;
  }).join(" ");
  return (
    <>
      <circle r={BALL_R} fill="#f7faf8" stroke="rgba(4,20,14,0.7)" strokeWidth={0.035} />
      <polygon points={pent} fill="#101a17" />
      {[0, 1, 2].map((i) => {
        const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / 3;
        return <circle key={i} cx={Math.cos(a) * BALL_R * 0.72} cy={Math.sin(a) * BALL_R * 0.72} r={BALL_R * 0.17} fill="#101a17" opacity={0.75} />;
      })}
    </>
  );
}

/** Posts and bar, drawn last so they sit in front of the ball and the keeper. */
function Frame() {
  return (
    <g fill="#f4f7f5" stroke="rgba(0,0,0,0.45)" strokeWidth={0.03}>
      <rect x={-GOAL_HALF - POST} y={BAR} width={POST} height={GROUND - BAR} />
      <rect x={GOAL_HALF} y={BAR} width={POST} height={GROUND - BAR} />
      <rect x={-GOAL_HALF - POST} y={BAR - POST} width={GOAL_HALF * 2 + POST * 2} height={POST} />
    </g>
  );
}

/**
 * The keeper, drawn along the line from his feet to where his hands ended up.
 *
 * Both ends come from the recorded dive, so a low dive to his right is a
 * different picture from a high one — and when the kick was saved, the model
 * guarantees the ball is inside that reach, which is why the save looks like a
 * save instead of needing to be labelled one.
 */
function Keeper({ kick, kit, p }: { kick: PenaltyKick; kit: ClubKit; p: number }) {
  const { feet, hands, air } = keeperPose(kick, p);
  return (
    <g>
      {/* Grounded by his own shadow, which slides and softens as he leaves it. */}
      <ellipse cx={(feet.x + hands.x) / 2} cy={GROUND + 0.05} rx={0.5 + Math.abs(feet.x) * 0.2} ry={0.13} fill="#000" opacity={0.24 - air * 0.2} />
      <KeeperBody feet={feet} hands={hands} kit={kit} />
    </g>
  );
}

/**
 * A goalkeeper drawn along the line between his boots and his gloves.
 *
 * The body is built from real proportions in a local frame that runs from his
 * boots toward his hands, then laid onto that line — so the same figure reads as
 * "set on his line", "full length to his right" or "stooping to a low one" purely
 * from where the two ends are, with no per-case artwork. The ARM is the part that
 * reaches the target: his body keeps its length and the limb closes the gap,
 * which is what stops a save from looking like a dive past the ball.
 */
function KeeperBody({ feet, hands, kit }: { feet: { x: number; y: number }; hands: { x: number; y: number }; kit: ClubKit }) {
  const dx = hands.x - feet.x;
  const dy = hands.y - feet.y;
  const reach = Math.hypot(dx, dy) || 0.001;
  // The drawing may not stretch or squash him: a short reach means a bent body,
  // not a smaller keeper.
  const body = clamp(reach, KEEPER_LENGTH * 0.78, KEEPER_LENGTH);
  const ux = dx / reach;
  const uy = dy / reach;
  // The "up" side of the body, kept upward whichever way he went (which also
  // mirrors him for a dive to the other side, as it should).
  const flip = ux < -0.02 ? -1 : 1;
  const nx = uy * flip;
  const ny = -ux * flip;
  /** Local frame: `a` = metres along the body from his boots, `c` = across it. */
  const p = (a: number, c: number): [number, number] => [feet.x + ux * a + nx * c, feet.y + uy * a + ny * c];
  const seg = (a: [number, number], b: [number, number]) => `M${a[0]},${a[1]} L${b[0]},${b[1]}`;
  /** Upright (a dive is nearly flat) — used to keep his stance legs apart. */
  const upright = Math.abs(uy) > 0.85;

  // Skeleton in metres along/across the body, on real proportions: legs are
  // about 46% of boot-to-fingertip, torso to 73%, the arm the rest. The trailing
  // leg is splayed and the spine arched — what a diving keeper actually does, and
  // what stops the figure reading as a plank.
  const bootTrail = p(0.0, upright ? -0.17 : -0.19);
  const kneeTrail = p(body * 0.24, upright ? -0.14 : -0.08);
  const bootLead = p(upright ? 0.0 : 0.05, upright ? 0.17 : 0.06);
  const kneeLead = p(body * 0.25, upright ? 0.13 : 0.16);
  const hip = p(body * 0.46, 0.03);
  const chest = p(body * 0.6, 0.11);
  const shoulder = p(body * 0.73, 0.09);
  const neck = p(body * 0.77, 0.11);
  const head = p(body * 0.83, upright ? 0.0 : 0.17);
  const elbow = p(body * 0.86, upright ? 0.13 : 0.03);
  const elbowTrail = p(body * 0.68, -0.15);
  const handTrail = p(body * 0.84, -0.21);

  const shirt = kit.primary;
  const shorts = "#101a17";
  const sock = kit.secondary ?? "#f4f7f5";
  const edge = "rgba(4,20,14,0.55)";
  return (
    <g strokeLinecap="round" strokeLinejoin="round" fill="none">
      {/* Trailing limbs first — they belong behind the body. */}
      <path d={`M${handTrail[0]},${handTrail[1]} L${elbowTrail[0]},${elbowTrail[1]} L${shoulder[0]},${shoulder[1]}`} stroke={shirt} strokeWidth={0.11} opacity={0.6} />
      <path d={seg(kneeTrail, bootTrail)} stroke="#c7b39a" strokeWidth={0.1} opacity={0.55} />
      <path d={seg(hip, kneeTrail)} stroke={shorts} strokeWidth={0.15} opacity={0.8} />

      {/* Leading leg: thigh in shorts, bare shin, sock and boot on the end. */}
      <path d={seg(hip, kneeLead)} stroke={shorts} strokeWidth={0.2} />
      <path d={seg(kneeLead, bootLead)} stroke="#d9a97f" strokeWidth={0.12} />
      <path d={`M${bootLead[0] * 0.35 + kneeLead[0] * 0.65},${bootLead[1] * 0.35 + kneeLead[1] * 0.65} L${bootLead[0]},${bootLead[1]}`} stroke={sock} strokeWidth={0.13} />
      <ellipse cx={bootLead[0]} cy={bootLead[1]} rx={0.11} ry={0.065} fill="#0b1512" />

      {/* Torso: hip → chest → shoulder, so the spine can arch. */}
      <path d={`M${hip[0]},${hip[1]} L${chest[0]},${chest[1]} L${shoulder[0]},${shoulder[1]}`} stroke={edge} strokeWidth={0.35} />
      <path d={`M${hip[0]},${hip[1]} L${chest[0]},${chest[1]} L${shoulder[0]},${shoulder[1]}`} stroke={shirt} strokeWidth={0.3} />
      <path d={seg(shoulder, neck)} stroke="#d9a97f" strokeWidth={0.11} />

      {/* The reaching arm — sleeve, forearm, then the glove ON the target. */}
      <path d={`M${shoulder[0]},${shoulder[1]} L${elbow[0]},${elbow[1]} L${hands.x},${hands.y}`} stroke={shirt} strokeWidth={0.13} />
      <circle cx={head[0]} cy={head[1]} r={0.125} fill="#d9a97f" stroke={edge} strokeWidth={0.025} />
      <circle cx={hands.x} cy={hands.y} r={0.135} fill="#f4f7f5" stroke={edge} strokeWidth={0.025} />
    </g>
  );
}

/** The same replay, in a dialog — used both live and from the timeline. */
export function PenaltyDialog({
  open,
  onOpenChange,
  kick,
  taker,
  minute,
  keeperKit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kick: PenaltyKick;
  taker?: string;
  minute: number;
  keeperKit: ClubKit;
}) {
  const { t } = useApp();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{t.penaltyKick}</DialogTitle></DialogHeader>
        <div className="px-4 py-4">
          <PenaltyKickView kick={kick} taker={taker} minute={minute} keeperKit={keeperKit} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
