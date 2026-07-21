import { CardColor, MatchEventType, type MatchEvent } from "@fut/engine";
import { type Catalog, type RenderContext, type StatKey } from "../Catalog.js";

const STAT_LABELS: Record<StatKey, string> = {
  possession: "Posse de bola",
  shots: "Finalizações",
  shotsOnTarget: "No alvo",
  passes: "Passes",
  passAccuracy: "Acerto de passe",
  tackles: "Desarmes",
  fouls: "Faltas",
  offsides: "Impedimentos",
  corners: "Escanteios",
  yellowCards: "Cartões amarelos",
  redCards: "Cartões vermelhos",
};

const MENTALITY: Record<string, string> = {
  veryDefensive: "muito defensiva",
  defensive: "defensiva",
  balanced: "equilibrada",
  attacking: "ofensiva",
  veryAttacking: "muito ofensiva",
};

const PHRASES: Record<string, string> = {
  timeline: "Lances",
  statistics: "Estatísticas",
  finalScore: "Placar final",
  winner: "Vitória do {team}",
  draw: "Empate",
  afterExtraTime: "após a prorrogação",
  afterShootout: "nos pênaltis ({home}-{away})",
  aggregate: "agregado {home}-{away}",
  seed: "semente",
};

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`,
  );
}

export const ptBrCatalog: Catalog = {
  locale: "pt-BR",

  renderEvent(e: MatchEvent, ctx: RenderContext): string | null {
    const team = ctx.teamName(e.teamId);
    const p = e.playerName ?? "";
    switch (e.type) {
      case MatchEventType.Kickoff:
        return "Bola rolando!";
      case MatchEventType.HalfTime:
        return "Fim do primeiro tempo.";
      case MatchEventType.FullTime:
        return "Fim de jogo.";
      case MatchEventType.ExtraTimeStart:
        return "Começa a prorrogação.";
      case MatchEventType.Goal: {
        const penalty = e.params?.penalty ? " (pênalti)" : "";
        const assist = e.secondaryPlayerName
          ? `, com assistência de ${e.secondaryPlayerName}`
          : "";
        return `⚽ GOL! ${p} marca para o ${team}${penalty}${assist}.`;
      }
      case MatchEventType.Shot:
        if (e.params?.woodwork) return `${p} acerta a trave!`;
        if (e.params?.saved) return `${p} finaliza — o goleiro defende!`;
        return `${p} finaliza para fora.`;
      case MatchEventType.Foul:
        return `Falta de ${p} (${team}).`;
      case MatchEventType.Card: {
        const color = e.params?.color;
        if (color === CardColor.Red) {
          const reason =
            e.params?.reason === "secondYellow" ? " (segundo amarelo)" : "";
          return `🟥 Cartão vermelho para ${p}${reason}.`;
        }
        return `🟨 Cartão amarelo para ${p}.`;
      }
      case MatchEventType.Offside:
        return `Impedimento de ${p} (${team}).`;
      case MatchEventType.Corner:
        return `Escanteio para o ${team}.`;
      case MatchEventType.Penalty:
        return `Pênalti para o ${team}!`;
      case MatchEventType.Injury:
        return `${p} (${team}) se machuca.`;
      case MatchEventType.Substitution: {
        const reason = e.params?.injury ? " (lesão)" : "";
        return `Substituição (${team})${reason}: entra ${p}, sai ${e.secondaryPlayerName ?? ""}.`;
      }
      case MatchEventType.TacticChange: {
        const m = MENTALITY[String(e.params?.mentality)] ?? String(e.params?.mentality);
        return `O ${team} muda para uma postura ${m}.`;
      }
      case MatchEventType.ShootoutKick:
        return e.params?.scored
          ? `Pênaltis — ${p} converte.`
          : `Pênaltis — ${p} perde!`;
      default:
        return null;
    }
  },

  label(key: StatKey): string {
    return STAT_LABELS[key];
  },

  phrase(key: string, params?: Record<string, string | number>): string {
    return interpolate(PHRASES[key] ?? key, params);
  },
};
