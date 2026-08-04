/**
 * The set of screens, in one place.
 *
 * This used to be two: a `ScreenId` union in `Shell` and a hand-kept `VALID` array in `App` that the
 * hash parser validated against. Two lists of the same thing drift — a screen added to the union but
 * not the array parses as `home`, silently.
 *
 * `SECTIONS` is the subset that has a nav entry. The rest are DETAIL screens: you only ever arrive at
 * a player, a club or a match from somewhere else, which is what makes provenance worth tracking (see
 * `Shell`'s breadcrumb).
 */

export const SECTIONS = [
  "home",
  "calendar",
  "squad",
  "tactics",
  "league",
  "inbox",
  "transfers",
  "scouting",
  "finances",
] as const;

export const DETAILS = ["player", "club", "match"] as const;

export const SCREENS = [...SECTIONS, ...DETAILS] as const;

export type ScreenId = (typeof SCREENS)[number];
export type SectionId = (typeof SECTIONS)[number];

export const isScreenId = (v: string): v is ScreenId => (SCREENS as readonly string[]).includes(v);

/** True for a screen you can only reach by drilling in from another one. */
export const isDetail = (id: ScreenId): boolean => (DETAILS as readonly string[]).includes(id);
