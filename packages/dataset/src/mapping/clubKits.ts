import type { ClubKit, ClubKits } from "@fut/competition";

/**
 * Kit colours (home = kit 1, away = kit 2). No public API publishes these
 * reliably, so the sample league is curated by Transfermarkt club id — the
 * clubs' own well-known colours. Unknown clubs fall back to a deterministic
 * palette derived from their id, so any dataset still renders a plausible shirt.
 */
const kit = (primary: string, secondary: string, detail: string, pattern: ClubKit["pattern"] = "solid"): ClubKit => ({ primary, secondary, detail, pattern });

const BY_TM_ID: Record<string, ClubKits> = {
  "614": { home: kit("#C52613", "#1A1A1A", "#FFFFFF", "hoops"), away: kit("#FFFFFF", "#C52613", "#1A1A1A") }, // Flamengo
  "1023": { home: kit("#006437", "#FFFFFF", "#FFFFFF"), away: kit("#FFFFFF", "#006437", "#006437") }, // Palmeiras
  "609": { home: kit("#1F4B99", "#FFFFFF", "#FFFFFF"), away: kit("#FFFFFF", "#1F4B99", "#1F4B99") }, // Cruzeiro
  "199": { home: kit("#FFFFFF", "#1A1A1A", "#1A1A1A"), away: kit("#1A1A1A", "#FFFFFF", "#FFFFFF") }, // Corinthians
  "10010": { home: kit("#0055A4", "#E1112C", "#FFFFFF", "stripes"), away: kit("#FFFFFF", "#0055A4", "#E1112C") }, // Bahia
  "537": { home: kit("#1A1A1A", "#FFFFFF", "#FFFFFF", "stripes"), away: kit("#FFFFFF", "#1A1A1A", "#1A1A1A") }, // Botafogo
  "2462": { home: kit("#7A1128", "#1A6B3C", "#FFFFFF", "stripes"), away: kit("#FFFFFF", "#7A1128", "#1A6B3C") }, // Fluminense
  "978": { home: kit("#1A1A1A", "#FFFFFF", "#FFFFFF", "sash"), away: kit("#FFFFFF", "#1A1A1A", "#1A1A1A", "sash") }, // Vasco
  "210": { home: kit("#0D8BD9", "#1A1A1A", "#FFFFFF", "stripes"), away: kit("#FFFFFF", "#0D8BD9", "#1A1A1A") }, // Grêmio
  "221": { home: kit("#FFFFFF", "#1A1A1A", "#1A1A1A"), away: kit("#1A1A1A", "#FFFFFF", "#FFFFFF") }, // Santos
  "8793": { home: kit("#FFFFFF", "#D91E2A", "#1B2A6B"), away: kit("#1B2A6B", "#FFFFFF", "#D91E2A") }, // Bragantino
  "330": { home: kit("#1A1A1A", "#FFFFFF", "#FFFFFF", "stripes"), away: kit("#FFFFFF", "#1A1A1A", "#1A1A1A") }, // Atlético-MG
  "585": { home: kit("#FFFFFF", "#E1112C", "#1B2A6B", "hoops"), away: kit("#1B2A6B", "#FFFFFF", "#E1112C") }, // São Paulo
  "679": { home: kit("#D9232E", "#1A1A1A", "#FFFFFF", "stripes"), away: kit("#FFFFFF", "#D9232E", "#1A1A1A") }, // Athletico-PR
  "6600": { home: kit("#D9232E", "#FFFFFF", "#FFFFFF"), away: kit("#FFFFFF", "#D9232E", "#D9232E") }, // Internacional
  "2125": { home: kit("#D9232E", "#1A1A1A", "#FFFFFF", "stripes"), away: kit("#FFFFFF", "#D9232E", "#1A1A1A") }, // Vitória
  "776": { home: kit("#0B6B3A", "#FFFFFF", "#FFFFFF", "stripes"), away: kit("#FFFFFF", "#0B6B3A", "#0B6B3A") }, // Coritiba
  "3876": { home: kit("#0B7A3B", "#FFFF00", "#FFFFFF"), away: kit("#FFFFFF", "#0B7A3B", "#FFFF00") }, // Mirassol
  "10997": { home: kit("#0B4DA2", "#FFFFFF", "#FFFFFF"), away: kit("#FFFFFF", "#0B4DA2", "#0B4DA2") }, // Remo
  "17776": { home: kit("#1B7A3D", "#FFFFFF", "#FFFFFF"), away: kit("#FFFFFF", "#1B7A3D", "#1B7A3D") }, // Chapecoense
};

/** Deterministic fallback palette so every club has a usable pair of kits. */
const FALLBACK = ["#C52613", "#1F4B99", "#006437", "#1A1A1A", "#E8A21C", "#6B2D8C", "#0D8BD9", "#D9232E"];

export function clubKits(id: string): ClubKits {
  const curated = BY_TM_ID[id];
  if (curated) return curated;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  const primary = FALLBACK[Math.abs(h) % FALLBACK.length]!;
  return { home: kit(primary, "#FFFFFF", "#FFFFFF"), away: kit("#FFFFFF", primary, primary) };
}
