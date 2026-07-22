import type { PosGroup } from "../lib/engine/world";

export function groupTone(g: PosGroup): "gk" | "def" | "mid" | "att" {
  return g === "GK" ? "gk" : g === "DEF" ? "def" : g === "MID" ? "mid" : "att";
}

export function groupColorVar(g: PosGroup): string {
  return g === "GK"
    ? "var(--pos-gk)"
    : g === "DEF"
      ? "var(--pos-def)"
      : g === "MID"
        ? "var(--pos-mid)"
        : "var(--pos-att)";
}
