import { InboxMessageType, type Career, type InboxMessage } from "@fut/career";
import type { UILocale } from "../../i18n/strings";

export interface InboxText {
  from: string;
  subject: string;
  body: string;
}

const str = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));

/** Compact currency, without pulling the whole formatter in here. */
const money = (v: number): string => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(v);

/**
 * A rejection is only useful if it says what to do next: bid again, or move on.
 * Mirrors `RejectionReason` in @fut/career.
 */
const REJECTION: Record<string, { pt: string; en: string } | undefined> = {
  belowValuation: { pt: "Avaliam o jogador bem acima disso — só um valor bem maior reabre a conversa.", en: "They rate him well above that — only a far bigger number reopens this." },
  keyPlayer: { pt: "É peça central do time deles; não pretendem negociar.", en: "He's central to their side; they have no intention of dealing." },
  squadTooThin: { pt: "Ficariam desfalcados na posição. Não é questão de dinheiro.", en: "It would leave them short in that position. This isn't about money." },
  alreadyRefused: { pt: "Já haviam recusado essa conversa.", en: "They'd already turned this down." },
};

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
    case InboxMessageType.ScoutReport: {
      const confidence = num(p.confidence);
      const complete = Boolean(p.complete);
      // The scout stays on him unless this was the last rung. Saying so is the point: the
      // manager should not go looking for a button to send him back out.
      const next = num(p.next);
      return pt
        ? {
            from: "Departamento de Observação",
            subject: `Relatório: ${player()}`,
            body: complete
              ? `Nosso olheiro concluiu o acompanhamento de ${player()}. É tudo o que conseguimos apurar de fora do clube — daqui em diante, só convivendo com ele no dia a dia.\n\nConhecimento: ${confidence}%.`
              : `Chegou o relatório sobre ${player()}. Nossa leitura do jogador melhorou, mas ainda há margem de erro.\n\nConhecimento: ${confidence}%. O olheiro segue acompanhando e o próximo relatório deve chegar em ${next}% — se preferir usar a vaga em outro jogador, retire-o da observação.`,
          }
        : {
            from: "Scouting Department",
            subject: `Report: ${player()}`,
            body: complete
              ? `Our scout has finished watching ${player()}. That's everything we can learn from outside the club — anything more would take working with him day to day.\n\nKnowledge: ${confidence}%.`
              : `The report on ${player()} is in. Our read on him has improved, but there's still a margin of error.\n\nKnowledge: ${confidence}%. The scout stays on him and should file again at ${next}% — if you'd rather spend the slot elsewhere, take him off observation.`,
          };
    }
    case InboxMessageType.ContractExpiring: {
      const left = num(p.daysLeft);
      const months = Math.max(1, Math.round(left / 30));
      return pt
        ? {
            from: "Diretor de Futebol",
            subject: `Contrato de ${player()} perto do fim`,
            body: `O contrato de ${player()} vence em cerca de ${months} ${months === 1 ? "mês" : "meses"} (${left} dias). Se chegarmos ao fim sem renovar, ele sai de graça e não recebemos nada. Vale sentar com ele agora, enquanto ainda temos posição para negociar.`,
          }
        : {
            from: "Director of Football",
            subject: `${player()}'s contract is running down`,
            body: `${player()}'s deal expires in about ${months} ${months === 1 ? "month" : "months"} (${left} days). If we let it run out he leaves for nothing and we get no fee. Worth sitting down with him now, while we still have a position to negotiate from.`,
          };
    }
    case InboxMessageType.ContractLapsed:
      return pt
        ? { from: "Diretor de Futebol", subject: `Perdemos ${player()}`, body: `O contrato de ${player()} venceu e ele deixou o clube como agente livre. Não houve compensação. Foi avisado com antecedência — vale revisar quem mais está com o vínculo perto do fim.` }
        : { from: "Director of Football", subject: `We've lost ${player()}`, body: `${player()}'s contract expired and he has left as a free agent. No fee, nothing. We had notice on this — worth reviewing who else is running down.` };
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
    case InboxMessageType.TransferAccepted:
      return pt
        ? { from: "Diretor de Futebol", subject: `${club(p.clubId)} aceitou nosso valor`, body: `${club(p.clubId)} topou pagar ${money(num(p.fee))} por ${player()}. Falta só acertar os termos pessoais com o jogador para fechar a saída.` }
        : { from: "Director of Football", subject: `${club(p.clubId)} met our valuation`, body: `${club(p.clubId)} have agreed to pay ${money(num(p.fee))} for ${player()}. All that's left is personal terms with the player to complete the sale.` };
    case InboxMessageType.TransferCompleted:
      return pt
        ? { from: "Diretor de Futebol", subject: `Transferência concluída`, body: `${player()} deixou ${club(p.fromClubId)} rumo a ${club(p.toClubId)}${num(p.fee) ? "." : " por empréstimo."}` }
        : { from: "Director of Football", subject: `Transfer completed`, body: `${player()} has moved from ${club(p.fromClubId)} to ${club(p.toClubId)}${num(p.fee) ? "." : " on loan."}` };
    case InboxMessageType.TransferCountered:
      return pt
        ? { from: "Diretor de Futebol", subject: `Contraproposta por ${player()}`, body: `${club(p.clubId)} não aceitou nossa oferta, mas abriu conversa: pedem ${money(num(p.fee))}. Podemos aceitar, insistir com um novo valor ou encerrar. A proposta tem prazo — deixar parada é abrir mão dela.` }
        : { from: "Director of Football", subject: `Counter-offer for ${player()}`, body: `${club(p.clubId)} turned our bid down but left the door open: they want ${money(num(p.fee))}. We can accept, come back with a new number, or walk. There's a deadline on this — letting it sit is the same as passing.` };
    case InboxMessageType.TransferRejected: {
      const why = REJECTION[str(p.reason)];
      return pt
        ? { from: "Diretor de Futebol", subject: `Proposta recusada: ${player()}`, body: `${club(p.clubId)} recusou nossa proposta de ${money(num(p.fee))}.${why ? ` ${why.pt}` : ""}` }
        : { from: "Director of Football", subject: `Offer rejected: ${player()}`, body: `${club(p.clubId)} have turned down our ${money(num(p.fee))} offer.${why ? ` ${why.en}` : ""}` };
    }
    // Buying: the clubs have shaken hands and the ball is now in our court —
    // this mail has to say plainly that there IS a next step, and how long we
    // have, because it used to render as an empty placeholder and the deal just
    // seemed to die on its own.
    case InboxMessageType.PersonalTerms: {
      const days = num(p.days) || 21;
      return pt
        ? { from: "Diretor de Futebol", subject: `Acordo fechado com ${club(p.fromClubId)} por ${player()}`, body: `${club(p.fromClubId)} aceitou nossa proposta de ${money(num(p.fee))} por ${player()}. O acerto entre clubes está feito — agora falta negociar o contrato com o próprio jogador: salário e duração. Temos ${days} dias para isso, e o negócio caduca se o prazo passar. Você faz isso na aba de Transferências, no cartão de termos pessoais.` }
        : { from: "Director of Football", subject: `Fee agreed with ${club(p.fromClubId)} for ${player()}`, body: `${club(p.fromClubId)} have accepted our ${money(num(p.fee))} offer for ${player()}. The clubs are done — what's left is the player's own contract: wage and length. We have ${days} days, and the deal lapses if that passes. Head to Transfers and open the personal-terms card.` };
    }
    case InboxMessageType.PersonalTermsExpired:
      return pt
        ? { from: "Diretor de Futebol", subject: `Perdemos ${player()}`, body: `Tínhamos o valor acertado com ${club(p.clubId)}, mas o prazo para fechar o contrato com ${player()} venceu sem acordo pessoal. O negócio caiu. Para retomar, é abrir uma nova proposta desde o início.` }
        : { from: "Director of Football", subject: `We've lost ${player()}`, body: `We had the fee agreed with ${club(p.clubId)}, but the window to settle ${player()}'s own contract ran out without a deal. The move is off. Going back in means bidding again from scratch.` };
    case InboxMessageType.TransferExpired:
      return pt
        ? { from: "Diretor de Futebol", subject: `Negociação encerrada: ${player()}`, body: `O prazo da negociação com ${club(p.clubId)} por ${player()} venceu sem resposta. A conversa está encerrada — para retomar, é começar do zero.` }
        : { from: "Director of Football", subject: `Talks lapsed: ${player()}`, body: `The deadline on our talks with ${club(p.clubId)} over ${player()} passed with no answer. That conversation is closed — reopening it means starting again.` };
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
