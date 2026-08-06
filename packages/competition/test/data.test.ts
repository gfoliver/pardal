import { describe, expect, it } from "vitest";
import { Goalkeeper, Position } from "@fut/domain";
import {
  DataValidationError,
  loadTeam,
  type PlayerData,
  type TeamData,
} from "@fut/competition";

const attrs = {
  physical: { pace: 60, stamina: 60, strength: 60, agility: 60 },
  mental: {
    decisions: 60, composure: 60, workRate: 60, teamwork: 60,
    aggression: 60, anticipation: 60, positioning: 60, vision: 60, offTheBall: 60,
  },
  technical: {
    passing: 60, technique: 60, dribbling: 60, finishing: 60,
    shotPower: 60, tackling: 60, marking: 60, crossing: 60, firstTouch: 60, heading: 60,
  },
};

function pd(id: string, position: Position, extra: Partial<PlayerData> = {}): PlayerData {
  return { id, name: id, age: 25, nationality: "BR", position, ...attrs, ...extra };
}

function gkData(id: string): PlayerData {
  return {
    ...pd(id, Position.Goalkeeper),
    goalkeeping: { reflexes: 60, handling: 60, positioning: 60, oneOnOnes: 60 },
  };
}

function validTeam(overridePlayers?: PlayerData[]): TeamData {
  const players = overridePlayers ?? [
    gkData("gk"),
    pd("d1", Position.CentreBack),
    pd("d2", Position.CentreBack),
    pd("d3", Position.FullBack),
    pd("d4", Position.FullBack),
    pd("m1", Position.CentralMidfielder),
    pd("m2", Position.CentralMidfielder),
    pd("w1", Position.Winger),
    pd("w2", Position.Winger),
    pd("s1", Position.Striker),
    pd("s2", Position.Striker),
    pd("b1", Position.Striker), // bench
  ];
  return {
    id: "t",
    name: "Test FC",
    shortName: "TST",
    coach: {
      id: "c", name: "Coach", age: 50, nationality: "BR",
      attributes: { adaptability: 60, tacticalKnowledge: 60, reactiveness: 60, composure: 60 },
    },
    players,
  };
}

describe("Data loader", () => {
  it("maps team data to a domain Team (XI, bench, GK, tactics)", () => {
    const team = loadTeam(validTeam());
    expect(team.startingXi).toHaveLength(11);
    expect(team.bench).toHaveLength(1);
    expect(team.goalkeeper()).toBeInstanceOf(Goalkeeper);
    expect(team.tactics.roleFor("s1")).toBeDefined();
  });

  it("parses versatile players' natural positions", () => {
    const players = validTeam().players.map((p) =>
      p.id === "s1"
        ? { ...p, naturalPositions: [Position.Striker, Position.Winger] }
        : p,
    );
    const team = loadTeam(validTeam(players));
    const versatile = team.startingXi.find((p) => p.id === "s1")!;
    expect(versatile.canPlay(Position.Winger)).toBe(true);
  });

  it("rejects a squad with fewer than 11 players", () => {
    const short = validTeam().players.slice(0, 10);
    expect(() => loadTeam(validTeam(short))).toThrow(DataValidationError);
  });

  it("rejects an invalid position", () => {
    const players = validTeam().players.map((p) =>
      p.id === "s1" ? ({ ...p, position: "quarterback" }) : p,
    );
    expect(() => loadTeam(validTeam(players))).toThrow(DataValidationError);
  });

  it("rejects a goalkeeper without goalkeeping attributes", () => {
    const players = validTeam().players.map((p) =>
      p.id === "gk" ? ({ ...pd("gk", Position.Goalkeeper) }) : p,
    );
    expect(() => loadTeam(validTeam(players))).toThrow(DataValidationError);
  });

  it("rejects a starting XI with no goalkeeper", () => {
    const players = [
      pd("x1", Position.CentreBack),
      ...validTeam().players.slice(1),
    ];
    expect(() => loadTeam(validTeam(players))).toThrow(DataValidationError);
  });
});
