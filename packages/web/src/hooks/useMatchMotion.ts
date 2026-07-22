import { useEffect, useReducer, useRef } from "react";
import type { LivePlayer } from "@fut/engine";

/**
 * Continuous kinematic movement model (presentation layer). The zone engine
 * produces discrete per-step targets; here every player and the ball hold a
 * continuous position and *seek* their target at a capped speed via rAF, so
 * they run smoothly toward positions and never teleport. The ball travels
 * (fast) toward the carrier, so a pass reads as a struck ball, not a jump.
 * Outcomes are untouched — this only renders the engine's state believably.
 */
export interface MotionPlayer {
  id: string;
  teamId: string;
  pos: LivePlayer["pos"];
  x: number;
  y: number;
}

const PLAYER_SPEED = 24; // % of pitch per second (a brisk run)
const BALL_SPEED = 78; // the ball moves much faster than players
const CLAMP = (v: number) => Math.max(1, Math.min(99, v));

/** Stable per-player sub-cell offset so players sharing a zone fan out without jitter. */
function offsetFor(id: string): { x: number; y: number } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  const angle = (h % 628) / 100; // 0..2π
  const r = 2.4 + ((h >>> 9) % 3) * 1.1; // 2.4 / 3.5 / 4.6
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

function seek(pos: { x: number; y: number }, tx: number, ty: number, maxStep: number): void {
  const dx = tx - pos.x;
  const dy = ty - pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxStep || dist < 0.01) {
    pos.x = tx;
    pos.y = ty;
    return;
  }
  pos.x += (dx / dist) * maxStep;
  pos.y += (dy / dist) * maxStep;
}

export function useMatchMotion(players: readonly LivePlayer[]): { players: MotionPlayer[]; ball: { x: number; y: number } } {
  const targets = useRef(new Map<string, { x: number; y: number; teamId: string; pos: LivePlayer["pos"]; hasBall: boolean }>());
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const ball = useRef({ x: 50, y: 50 });
  const last = useRef(0);
  const [, tick] = useReducer((c: number) => (c + 1) % 1_000_000, 0);

  // Refresh targets whenever a new engine snapshot arrives.
  const t = new Map<string, { x: number; y: number; teamId: string; pos: LivePlayer["pos"]; hasBall: boolean }>();
  for (const p of players) {
    const off = offsetFor(p.id);
    const tx = CLAMP(p.x + off.x);
    const ty = CLAMP(p.y + off.y);
    t.set(p.id, { x: tx, y: ty, teamId: p.teamId, pos: p.pos, hasBall: p.hasBall });
    if (!positions.current.has(p.id)) positions.current.set(p.id, { x: tx, y: ty });
  }
  targets.current = t;

  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - (last.current || now)) / 1000);
      last.current = now;
      let carrier: { x: number; y: number } | null = null;
      for (const [id, tgt] of targets.current) {
        let pos = positions.current.get(id);
        if (!pos) {
          pos = { x: tgt.x, y: tgt.y };
          positions.current.set(id, pos);
        }
        seek(pos, tgt.x, tgt.y, PLAYER_SPEED * dt);
        if (tgt.hasBall) carrier = pos;
      }
      // Drop stale players (subs).
      for (const id of positions.current.keys()) if (!targets.current.has(id)) positions.current.delete(id);
      const bt = carrier ?? ball.current;
      seek(ball.current, bt.x + 2.4, bt.y - 2.4, BALL_SPEED * dt);
      tick();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rendered: MotionPlayer[] = [];
  for (const [id, tgt] of targets.current) {
    const pos = positions.current.get(id) ?? tgt;
    rendered.push({ id, teamId: tgt.teamId, pos: tgt.pos, x: pos.x, y: pos.y });
  }
  return { players: rendered, ball: ball.current };
}
