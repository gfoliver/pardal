import { describe, expect, it } from "vitest";
import {
  clubSearchTerms,
  matchClub,
  matchPlayer,
  normaliseName,
  type ClubCandidate,
  type PlayerCandidate,
} from "../src/resolve/matchEntities.js";

const club = (sourceId: string, name: string, extra: Partial<ClubCandidate> = {}): ClubCandidate => ({ sourceId, name, ...extra });
const cand = (sourceId: string, name: string, extra: Partial<PlayerCandidate> = {}): PlayerCandidate => ({ sourceId, name, ...extra });

describe("normaliseName", () => {
  it("folds accents, case and punctuation so sources can be compared", () => {
    expect(normaliseName("Vitão")).toBe("vitao");
    expect(normaliseName("Saúl Ñíguez")).toBe("saul niguez");
    expect(normaliseName("O'Hara")).toBe("o hara");
    expect(normaliseName("  Alex   Sandro ")).toBe("alex sandro");
  });
});

describe("matchClub", () => {
  it("matches an exact name", () => {
    const r = matchClub({ id: "614", name: "Flamengo" }, [club("134287", "Flamengo")]);
    expect(r).toMatchObject({ method: "exactName", candidate: { sourceId: "134287" } });
  });

  it("sees through the words that describe a club rather than name it", () => {
    // Transfermarkt's legal name vs TheSportsDB's common name.
    const r = matchClub({ id: "1023", name: "Sociedade Esportiva Palmeiras" }, [club("133739", "Palmeiras")]);
    expect(r).toMatchObject({ method: "tokenSubset", candidate: { sourceId: "133739" } });
  });

  it("matches on an alternate name", () => {
    const r = matchClub({ id: "6600", name: "Internacional" }, [club("134281", "Inter", { alternateNames: ["SC Internacional"] })]);
    expect(r).toMatchObject({ method: "alternateName" });
  });

  it("refuses rather than guesses when two candidates fit equally", () => {
    const r = matchClub({ id: "x", name: "Atlético" }, [club("1", "Atlético"), club("2", "Atlético")]);
    expect(r).toEqual({ ambiguous: true });
  });

  it("returns nothing when there is no plausible candidate", () => {
    expect(matchClub({ id: "x", name: "Flamengo" }, [club("1", "Corinthians")])).toBeUndefined();
    expect(matchClub({ id: "x", name: "Flamengo" }, [])).toBeUndefined();
  });

  it("lets a curated override win outright", () => {
    const r = matchClub({ id: "x", name: "Nothing Alike" }, [club("999", "Totally Different")], "999");
    expect(r).toMatchObject({ method: "override", candidate: { sourceId: "999" } });
  });

  /**
   * Every one of these was a CONFIRMED WRONG MATCH from a live run: token-subset
   * matching accepted a candidate that merely added a qualifier, so five of
   * twenty clubs resolved to a women's or youth side.
   */
  describe("the wrong-team guard", () => {
    it.each([
      ["Sociedade Esportiva Palmeiras", "Palmeiras U20"],
      ["Sport Club Internacional", "Internacional Women"],
      ["Cruzeiro Esporte Clube", "Cruzeiro Women"],
      ["Clube Atlético Mineiro", "Atlético Mineiro Women"],
      ["Esporte Clube Bahia", "Bahia Women"],
      ["Botafogo de Futebol e Regatas", "Botafogo B"],
      ["Santos FC", "Santos Youth"],
    ])("refuses %s → %s", (ours, theirs) => {
      expect(matchClub({ id: "x", name: ours }, [club("1", theirs)])).toBeUndefined();
    });

    it("still picks the senior side out of a list that contains both", () => {
      const r = matchClub({ id: "1023", name: "Sociedade Esportiva Palmeiras" }, [
        club("1", "Palmeiras U20"),
        club("2", "Palmeiras"),
        club("3", "Palmeiras Women"),
      ]);
      expect(r).toMatchObject({ candidate: { sourceId: "2" } });
    });

    it("keeps a qualifier that is genuinely part of our own name", () => {
      const r = matchClub({ id: "x", name: "Palmeiras B" }, [club("1", "Palmeiras B")]);
      expect(r).toMatchObject({ method: "exactName" });
    });
  });

  it("does not treat 'Atlético' as a throwaway word", () => {
    // It looked like an organisation word, so "Clube Atlético Mineiro" matched
    // "América Mineiro" on the one token left standing.
    expect(matchClub({ id: "330", name: "Clube Atlético Mineiro" }, [club("1", "América Mineiro")])).toBeUndefined();
    expect(matchClub({ id: "330", name: "Clube Atlético Mineiro" }, [club("2", "Atlético Mineiro")])).toMatchObject({
      candidate: { sourceId: "2" },
    });
  });
});

describe("clubSearchTerms — widening a query the source can actually answer", () => {
  it("falls back from the legal name to the common one", () => {
    // The full name returned nothing from the live API; "Vasco da Gama" resolves.
    expect(clubSearchTerms({ name: "Clube de Regatas Vasco da Gama" })).toEqual([
      "Clube de Regatas Vasco da Gama",
      "Vasco da Gama",
      "Vasco",
    ]);
  });

  it("keeps Grêmio, which reads like an organisation word but is the whole name", () => {
    expect(clubSearchTerms({ name: "Grêmio Foot-Ball Porto Alegrense" })).toContain("Grêmio");
  });

  it("adds the short name as a last resort and never repeats a term", () => {
    expect(clubSearchTerms({ name: "Santos", shortName: "SAN" })).toEqual(["Santos", "SAN"]);
  });

  it("reaches for the longest distinctive word, not the first", () => {
    // Searching "Sport" or "Red" returns other clubs; the identifying word is last.
    expect(clubSearchTerms({ name: "Sport Club Internacional" })).toContain("Internacional");
    expect(clubSearchTerms({ name: "Red Bull Bragantino" })).toContain("Bragantino");
    expect(clubSearchTerms({ name: "Sport Club Internacional" }).indexOf("Internacional"))
      .toBeLessThan(clubSearchTerms({ name: "Sport Club Internacional" }).indexOf("Sport"));
  });
});

describe("matchPlayer", () => {
  const FLA = "134287";

  it("joins on an explicit Transfermarkt id, without needing the club guard", () => {
    const r = matchPlayer({ id: "79960", name: "Alex Sandro" }, [cand("34146585", "Alex Sandro", { transfermarktId: "79960" })]);
    expect(r).toMatchObject({ method: "externalId", candidate: { sourceId: "34146585" } });
  });

  it("rejects a same-name player from a DIFFERENT club (the wrong-Pedro case)", () => {
    // A name search for "Pedro" returns exactly one result and it may be Lazio's.
    const lazioPedro = cand("34146369", "Pedro", { sourceClubId: "133724", birthDate: "1987-07-28" });
    const r = matchPlayer({ id: "tm-1", name: "Pedro", expectedSourceClubId: FLA }, [lazioPedro]);
    expect(r).toBeUndefined();
  });

  it("accepts the same name once the candidate plays for the club we matched", () => {
    const flaPedro = cand("34194887", "Pedro", { sourceClubId: FLA, birthDate: "1997-06-20" });
    const r = matchPlayer({ id: "tm-1", name: "Pedro", expectedSourceClubId: FLA }, [flaPedro]);
    expect(r).toMatchObject({ method: "exactName", candidate: { sourceId: "34194887" } });
  });

  it("matches a full name against a shorter registered one, within the club", () => {
    const flaPedro = cand("34194887", "Pedro", { sourceClubId: FLA });
    const r = matchPlayer({ id: "tm-1", name: "Pedro Guilherme", expectedSourceClubId: FLA }, [flaPedro]);
    expect(r).toMatchObject({ method: "tokenSubset" });
  });

  it("vetoes a club-mate whose birth year contradicts what we know", () => {
    const wrongAge = cand("999", "Pedro", { sourceClubId: FLA, birthDate: "1987-07-28" });
    const r = matchPlayer({ id: "tm-1", name: "Pedro", expectedSourceClubId: FLA, birthYear: 1997 }, [wrongAge]);
    expect(r).toBeUndefined();
  });

  it("tolerates a missing birth date on either side", () => {
    const noDob = cand("34194887", "Pedro", { sourceClubId: FLA });
    expect(matchPlayer({ id: "tm-1", name: "Pedro", expectedSourceClubId: FLA, birthYear: 1997 }, [noDob])).toMatchObject({ method: "exactName" });
  });

  it("refuses everything when the club was never resolved — there is no guard left", () => {
    const anyPedro = cand("34194887", "Pedro", { sourceClubId: FLA });
    expect(matchPlayer({ id: "tm-1", name: "Pedro" }, [anyPedro])).toBeUndefined();
  });

  it("reports ambiguity instead of picking one of two club-mates with the same name", () => {
    const a = cand("1", "Bruno Henrique", { sourceClubId: FLA });
    const b = cand("2", "Bruno Henrique", { sourceClubId: FLA });
    expect(matchPlayer({ id: "tm-1", name: "Bruno Henrique", expectedSourceClubId: FLA }, [a, b])).toEqual({ ambiguous: true });
  });

  it("folds accents when comparing", () => {
    const r = matchPlayer({ id: "tm-1", name: "Alexandro Bernabei", expectedSourceClubId: "134281" }, [
      cand("34215705", "Alexandro Bernabéi", { sourceClubId: "134281" }),
    ]);
    expect(r).toMatchObject({ method: "exactName" });
  });

  it("is deterministic whatever order the candidates arrive in", () => {
    const list = [cand("1", "Danilo", { sourceClubId: FLA }), cand("2", "Danilo Silva", { sourceClubId: FLA })];
    const forward = matchPlayer({ id: "tm-1", name: "Danilo", expectedSourceClubId: FLA }, list);
    const backward = matchPlayer({ id: "tm-1", name: "Danilo", expectedSourceClubId: FLA }, [...list].reverse());
    expect(forward).toEqual(backward);
  });

  /**
   * The club guard alone loses anyone the source has at a stale club. Real case:
   * TheSportsDB still listed Guillermo Maripán at Torino while our snapshot had
   * him at Internacional, so an otherwise perfect match was recorded as a miss.
   * A day-exact birth date is the stronger identifier — transfers change,
   * birthdays don't — so it stands on its own.
   */
  describe("birth date as independent evidence", () => {
    const INTER = "134281";
    const maripan = cand("34161395", "Guillermo Maripán", { sourceClubId: "133687", birthDate: "1994-05-06" });

    it("accepts a stale-club candidate whose birth date matches exactly", () => {
      const r = matchPlayer(
        { id: "tm-249730", name: "Guillermo Maripán", expectedSourceClubId: INTER, birthYear: 1994, birthDate: "1994-05-06" },
        [maripan],
      );
      expect(r).toMatchObject({ method: "exactName", candidate: { sourceId: "34161395" } });
    });

    it("still refuses the wrong club when the birth date does NOT match", () => {
      const r = matchPlayer(
        { id: "tm-1", name: "Guillermo Maripán", expectedSourceClubId: INTER, birthDate: "1990-01-01" },
        [maripan],
      );
      expect(r).toBeUndefined();
    });

    it("does not let a shared birthday carry a mere token-subset name", () => {
      // Same birthday by coincidence, different club, and only a partial name:
      // three weak signals do not add up to a match.
      const other = cand("500", "Pedro", { sourceClubId: "999", birthDate: "1997-06-20" });
      const r = matchPlayer(
        { id: "tm-1", name: "Pedro Guilherme", expectedSourceClubId: FLA, birthDate: "1997-06-20" },
        [other],
      );
      expect(r).toBeUndefined();
    });

    it("still resolves a player with no birth date at all through the club", () => {
      const flaPedro = cand("34194887", "Pedro", { sourceClubId: FLA });
      expect(matchPlayer({ id: "tm-1", name: "Pedro", expectedSourceClubId: FLA }, [flaPedro])).toMatchObject({
        method: "exactName",
      });
    });

    it("reports ambiguity rather than choosing between two exact birthday twins", () => {
      const a = cand("1", "João Silva", { sourceClubId: "111", birthDate: "2000-03-03" });
      const b = cand("2", "João Silva", { sourceClubId: "222", birthDate: "2000-03-03" });
      expect(matchPlayer({ id: "tm-1", name: "João Silva", birthDate: "2000-03-03" }, [a, b])).toEqual({ ambiguous: true });
    });
  });
});
