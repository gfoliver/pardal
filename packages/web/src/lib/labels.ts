import { Position, PositionGroup, positionGroup, type RoleKey } from "@fut/domain";
import { SquadStatus } from "@fut/career";
import { useApp } from "../app/AppProviders";
import type { PosGroup } from "./engine/world";
import type { UIStringKey } from "../i18n/strings";

/**
 * The ONE place a domain enum becomes text a human reads.
 *
 * This exists because the alternative was demonstrated: `usePosLabels` lived
 * inside the tactics components, so five screens each grew their own hardcoded
 * English `POS` map, and the squad table printed `squadStatus` raw — a Brazilian
 * manager saw `CB` and `KEY` instead of ZAG and Jogador-chave. Every duplicated
 * map is a label that will be wrong in the next locale pass, so there is exactly
 * one dictionary and every surface goes through it.
 *
 * Each lookup falls back to a readable form of the raw value, so an enum the
 * catalogs somehow miss degrades to "Centre Back" rather than to nothing.
 */

/** Fallback abbreviations, used only when a locale is missing an entry. */
const POS_SHORT_FALLBACK: Record<string, string> = {
  goalkeeper: "GK", centreBack: "CB", fullBack: "FB", wingBack: "WB", defensiveMidfielder: "DM",
  centralMidfielder: "CM", attackingMidfielder: "AM", winger: "WG", striker: "ST",
};

/** Position group → the short code the pitch and colour tokens use. */
export const GROUP: Record<PositionGroup, PosGroup> = {
  [PositionGroup.Goalkeeper]: "GK",
  [PositionGroup.Defence]: "DEF",
  [PositionGroup.Midfield]: "MID",
  [PositionGroup.Attack]: "ATT",
};

export const shortPosFallback = (position: string) => POS_SHORT_FALLBACK[position] ?? position;
export const groupOf = (position: string) => GROUP[positionGroup(position as Position)];

/**
 * Position group as a `<Badge variant>`. Distinct from `groupOf`, which yields
 * the uppercase pitch code — passing that straight to Badge silently fell
 * through to the default grey, which is what the lineup table had been doing.
 */
export const groupBadge = (position: string) => groupOf(position).toLowerCase() as "gk" | "def" | "mid" | "att";

/** "centreBack" → "Centre Back" — the last-resort readable form. */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/([A-Z])/g, " $1");

/** Squad status → the i18n key that names it. */
const STATUS_KEY: Record<SquadStatus, UIStringKey> = {
  [SquadStatus.Key]: "statusKey",
  [SquadStatus.FirstTeam]: "statusFirstTeam",
  [SquadStatus.Rotation]: "statusRotation",
  [SquadStatus.Backup]: "statusBackup",
  [SquadStatus.Prospect]: "statusProspect",
  [SquadStatus.Surplus]: "statusSurplus",
};

export interface Labels {
  /** Table/pitch abbreviation, localised (ZAG in pt-BR, CB in en). */
  shortPos: (position: string) => string;
  /** Full position name. */
  posName: (position: string) => string;
  /** Tactical role name. */
  roleName: (roleKey: string) => string;
  /** Squad-hierarchy status ("Key player" / "Jogador-chave"). */
  statusName: (status: string | undefined) => string;
}

/** Localised names for every domain enum a screen displays. */
export function useLabels(): Labels {
  const { t } = useApp();
  return {
    shortPos: (position) => t.positionShort[position as Position] ?? shortPosFallback(position),
    posName: (position) => t.positionNames[position as Position] ?? cap(position),
    roleName: (roleKey) => t.roleNames[roleKey as RoleKey] ?? cap(roleKey),
    statusName: (status) => {
      if (!status) return "—";
      const key = STATUS_KEY[status as SquadStatus];
      return key ? t[key] : cap(status);
    },
  };
}
