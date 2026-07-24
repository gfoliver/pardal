import { InboxMessageType, type Career, type InboxMessage } from "@fut/career";
import type { UILocale } from "../../i18n/strings";

export interface InboxText {
  from: string;
  subject: string;
  body: string;
}

const str = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

/**
 * Render a structured inbox message as a real e-mail (sender, subject, prose
 * body) in the user's locale — names resolved from the save via the façade.
 */
export function renderInbox(m: InboxMessage, career: Career, locale: UILocale): InboxText {
  const pt = locale === "pt-BR";
  const p = m.params;
  const player = () => career.playerName(str(p.playerId));
  const club = (id: unknown) => career.clubName(str(id));

  switch (m.type) {
    case InboxMessageType.PlayerInjured: {
      const weeks = Math.max(1, Math.round(num(p.days) / 7));
      return pt
        ? {
            from: "Departamento Médico",
            subject: `${player()} sofre lesão`,
            body: `Nossos médicos confirmaram que ${player()} se lesionou e deve ficar afastado por cerca de ${weeks} ${weeks === 1 ? "semana" : "semanas"}. O jogador iniciará o tratamento imediatamente e será reavaliado ao longo da recuperação. Vamos ajustar o elenco para os próximos jogos.`,
          }
        : {
            from: "Medical Department",
            subject: `${player()} picks up an injury`,
            body: `Our medical staff have confirmed that ${player()} suffered an injury and is expected to be out for around ${weeks} ${weeks === 1 ? "week" : "weeks"}. He begins treatment immediately and will be reassessed through his recovery. We'll adjust the squad for the coming fixtures.`,
          };
    }
    case InboxMessageType.ContractRenewed:
      return pt
        ? { from: "Diretoria", subject: `Renovação: ${player()}`, body: `Fechamos a renovação de contrato com ${player()}. Um passo importante para manter a base do elenco e dar estabilidade ao projeto.` }
        : { from: "Board", subject: `Contract renewed: ${player()}`, body: `We've agreed a contract extension with ${player()}. An important step in keeping the spine of the squad together and giving the project stability.` };
    case InboxMessageType.BoardObjectiveSet: {
      const target = num(p.target);
      return pt
        ? { from: "Presidência", subject: "Metas da temporada", body: `Bem-vindo. A diretoria definiu como objetivo para a temporada terminar entre os ${target} primeiros da liga. Contamos com o seu trabalho para atingir — ou superar — essa meta.` }
        : { from: "Chairman", subject: "Your season objectives", body: `Welcome. The board has set your objective for the season: finish in the top ${target} of the league. We're counting on you to meet — or exceed — that target.` };
    }
    case InboxMessageType.TransferOfferReceived:
      return pt
        ? { from: "Diretor de Futebol", subject: `Proposta por ${player()}`, body: `Recebemos uma proposta de ${club(p.fromClubId)} por ${player()}. Cabe a você aceitar, recusar ou negociar os termos.` }
        : { from: "Director of Football", subject: `Offer received for ${player()}`, body: `We've received an offer from ${club(p.fromClubId)} for ${player()}. It's your call to accept, reject or negotiate the terms.` };
    case InboxMessageType.TransferCompleted:
      return pt
        ? { from: "Diretor de Futebol", subject: `Transferência concluída`, body: `${player()} deixou ${club(p.fromClubId)} rumo a ${club(p.toClubId)}${num(p.fee) ? "." : " por empréstimo."}` }
        : { from: "Director of Football", subject: `Transfer completed`, body: `${player()} has moved from ${club(p.fromClubId)} to ${club(p.toClubId)}${num(p.fee) ? "." : " on loan."}` };
    case InboxMessageType.BoardWarning:
      return pt
        ? { from: "Presidência", subject: "Preocupação da diretoria", body: `A diretoria está preocupada com os resultados recentes e com o rumo da temporada. Esperamos uma reação imediata.` }
        : { from: "Chairman", subject: "Board concern", body: `The board is concerned with recent results and the direction of the season. We expect an immediate response.` };
    case InboxMessageType.BoardSacked:
      return pt
        ? { from: "Presidência", subject: "Encerramento do seu contrato", body: `Lamentamos informar que a diretoria decidiu encerrar o seu vínculo com o clube. Agradecemos pelo trabalho e desejamos sucesso.` }
        : { from: "Chairman", subject: "Your contract has been terminated", body: `We regret to inform you that the board has decided to end your tenure at the club. We thank you for your work and wish you well.` };
    case InboxMessageType.PromotionRelegation:
      return pt
        ? { from: "Liga", subject: "Movimentação entre divisões", body: `A liga confirmou as promoções e rebaixamentos da temporada.` }
        : { from: "League", subject: "Promotion & relegation", body: `The league has confirmed this season's promotions and relegations.` };
    default:
      return { from: "—", subject: str(m.type), body: "" };
  }
}
