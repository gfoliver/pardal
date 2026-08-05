import { describe, expect, it } from "vitest";
import { clubNickname } from "../src/mapping/clubNickname.js";

/**
 * What a club is CALLED, from three tiers of decreasing trust.
 *
 * The tiers exist because the weakest one is genuinely bad and was the only one for a while: deriving
 * a display name from a legal name is a word-count heuristic, and every case below is a real club it
 * got wrong in the shipped dataset.
 */

const PONTE = ["1134", "Associação Atlética Ponte Preta"] as const;

describe("club display names", () => {
  it("prefers a name the source published over both curation and derivation", () => {
    // Curation is the tier that used to win. FM agreed with 17 of the 20 hand-written names and was
    // preferred on the other three, so the order is source-first — see the module doc.
    expect(clubNickname("978", "Clube de Regatas Vasco da Gama", "Vasco da Gama")).toBe("Vasco da Gama");
    expect(clubNickname("330", "Clube Atlético Mineiro", "Atlético Mineiro")).toBe("Atlético Mineiro");
    expect(clubNickname(...PONTE, "Ponte Preta")).toBe("Ponte Preta");
  });

  it("falls back to curation for a dataset built with no ratings layer", () => {
    expect(clubNickname("978", "Clube de Regatas Vasco da Gama")).toBe("Vasco");
    expect(clubNickname("210", "Grêmio Foot-Ball Porto Alegrense")).toBe("Grêmio");
  });

  it("derives a name for a club neither tier knows", () => {
    expect(clubNickname("99999", "Esporte Clube São Caetano")).toBe("São Caetano");
  });

  /**
   * The cases that motivated the source tier. Each of these is what the derivation actually produced
   * in a shipped artifact — none of them is a club any Brazilian names that way, and the last one is
   * outright wrong rather than merely ugly.
   */
  it("derivation mangles exactly the names the source gets right", () => {
    expect(clubNickname(...PONTE)).toBe("Atlética Ponte");
    expect(clubNickname("11449", "Clube de Regatas Brasil (AL)")).toBe("Brasil");
    expect(clubNickname("8718", "Sport Club do Recife")).toBe("Recife");
    // Both Botafogos derive to the same string, so a two-division table had two rows reading
    // "Botafogo". FM distinguishes them: "Botafogo" and "Botafogo (SP)".
    expect(clubNickname("9030", "Botafogo FC")).toBe(clubNickname("537", "Botafogo de Futebol e Regatas"));
    expect(clubNickname("9030", "Botafogo FC", "Botafogo (SP)")).not.toBe(clubNickname("537", "Botafogo de Futebol e Regatas", "Botafogo"));
  });

  it("ignores an empty sourced name rather than emitting one", () => {
    expect(clubNickname("978", "Clube de Regatas Vasco da Gama", "")).toBe("Vasco");
  });
});
