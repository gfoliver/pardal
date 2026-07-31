import type { UILocale } from "./strings";
import type { ScreenId } from "../layout/Shell";

/**
 * What each screen is for, and the parts of it nobody would guess.
 *
 * Kept out of `strings.ts` on purpose: that file is a flat map of labels, and this is prose
 * with its own shape. Mixing them would mean a paragraph living next to a button caption and
 * every screen's explanation scattered across a thousand-line object.
 *
 * The rule for what belongs in a `body` line: it has to be something the interface cannot
 * say for itself. "This is the squad list" earns nothing. "The bench ORDER decides who comes
 * on, because the engine substitutes without asking you" is the whole reason this exists.
 */
export interface HelpTopic {
  readonly title: string;
  readonly body: readonly string[];
}

const en: Partial<Record<ScreenId, HelpTopic>> = {
  home: {
    title: "Dashboard",
    body: [
      "**Play match** watches your fixture minute by minute and lets you make substitutions. **Simulate** settles it instantly. The result is the same kind of result either way.",
      "**Board confidence** is your job. It moves with results against the league position they asked for, and if it falls far enough you are sacked.",
      "The money shown is what you can still spend, not what the board allocated — see Finances.",
    ],
  },
  calendar: {
    title: "Calendar",
    body: [
      "Nothing happens until you advance the clock. Scout reports land, offers arrive and expire, and contracts run down on days that actually pass.",
      "Advancing stops at your own fixture rather than playing it, so you always get to set up first.",
      "Rounds you have played show the score; rounds ahead show the pairings.",
    ],
  },
  squad: {
    title: "Squad",
    body: [
      "**OVR** is his rating in his own position. The **potential** bar draws current ability against the ceiling behind it — a long faint tail is a player with room to grow.",
      "**Expires** is how long his contract has left. Let it reach zero and he leaves for nothing, so renew from his profile before then.",
      "The **⋯** menu on each row is where you list a player for transfer, change his shirt number, or open his profile. Right-click does the same on a desktop.",
    ],
  },
  tactics: {
    title: "Tactics",
    body: [
      "Drag a player onto the pitch to pick your eleven, and tap a shirt for his role and position.",
      "The **bench order matters**. The engine makes its own substitutions during a match and works down the bench, so the first name is the first change.",
      "Changing formation costs **familiarity** — the side plays a shape it has drilled better than one you switched to yesterday.",
      "Warnings under the pitch are worth reading: an unavailable starter gets replaced at kick-off whether you like it or not.",
    ],
  },
  league: {
    title: "League table",
    body: [
      "The table is always recomputed from results, never stored, so it cannot drift out of step with the games.",
      "Tap any club to see its squad, finances and form.",
    ],
  },
  inbox: {
    title: "Inbox",
    body: [
      "Offers for your players arrive here **with a deadline**. Ignoring one is a decision: it lapses and the buyer walks.",
      "Scout reports, contract warnings and completed transfers all land here too. Contract warnings come at 180, 90 and 30 days — once each.",
    ],
  },
  transfers: {
    title: "Transfers",
    body: [
      "**Targets** is your shortlist. **My offers** are bids you have made, **Received** are bids for your players, **Listed** are the players you have put up for sale.",
      "A bid you have out still counts against your budget until it is answered — so the money available falls the moment you offer it.",
      "Agreeing a fee is only half a signing. The player then has to agree **personal terms**, and that has its own deadline.",
      "**Listing** a player makes rivals ask about him far more often. Your asking price is met outright if it is defensible; ask far above his worth and they bid what they think instead.",
    ],
  },
  scouting: {
    title: "Scouting",
    body: [
      "You know **nothing** about a player you have not watched — not even his rating. Everything you see about a rival is an estimate that narrows as you learn more.",
      "One scout stays on a player until he reaches 90%, filing a report at 30% and 60% on the way. You never have to send him out again.",
      "You can only watch a few players at once, so taking someone off is how you free a slot. What you have already learned is kept.",
      "90% is as far as observation goes. The rest only comes from working with him day to day.",
    ],
  },
  finances: {
    title: "Finances",
    body: [
      "There is **one budget for the season**, and both transfer fees and the whole wage bill come out of it.",
      "That is why the two figures are the same money said twice: a salary commits a year of it, so signing someone on big wages costs you fee money.",
      "Fees you receive go straight back into the pot, so selling really does fund buying.",
      "Finishing higher earns a bigger budget next season. There is no cash balance — prize money arrives as spending power, not as savings.",
    ],
  },
  player: {
    title: "Player profile",
    body: [
      "For your own players every number is exact. For anyone else, the ratings, value and potential are your scouts' **estimates** — the ranges narrow the more you watch him.",
      "Renew a contract here. He may accept, name his price, or refuse outright.",
      "The season-by-season chart is empty in a first season because there is genuinely nothing to plot yet.",
    ],
  },
  club: {
    title: "Club profile",
    body: [
      "Squad size, average age, wage bill and form for any club in the league — useful for working out who might sell.",
      "A rival's player ratings are still only as good as your scouting on them.",
    ],
  },
};

const ptBR: Partial<Record<ScreenId, HelpTopic>> = {
  home: {
    title: "Painel",
    body: [
      "**Jogar partida** acompanha o seu jogo minuto a minuto e permite fazer substituições. **Simular** resolve na hora. O resultado tem o mesmo peso nos dois casos.",
      "A **confiança da diretoria** é o seu emprego. Ela se move conforme os resultados contra a posição que eles pediram, e se cair o bastante você é demitido.",
      "O dinheiro mostrado é o que ainda dá para gastar, não o que a diretoria liberou — veja Finanças.",
    ],
  },
  calendar: {
    title: "Calendário",
    body: [
      "Nada acontece até você avançar o tempo. Relatórios de observação chegam, propostas aparecem e vencem, e contratos correm nos dias que de fato passam.",
      "O avanço para antes do seu jogo em vez de jogá-lo, então você sempre tem a chance de se preparar.",
      "Rodadas já jogadas mostram o placar; as próximas mostram os confrontos.",
    ],
  },
  squad: {
    title: "Elenco",
    body: [
      "**GER** é o rating dele na posição dele. A barra de **potencial** desenha a habilidade atual contra o teto atrás dela — um rastro claro e longo é um jogador com espaço para crescer.",
      "**Expira** é o tempo de contrato restante. Se chegar a zero ele sai de graça, então renove no perfil dele antes disso.",
      "O menu **⋯** de cada linha é onde você lista um jogador para transferência, muda a camisa ou abre o perfil. No desktop, o clique direito faz o mesmo.",
    ],
  },
  tactics: {
    title: "Tática",
    body: [
      "Arraste um jogador para o campo para montar o time, e toque na camisa para escolher função e posição.",
      "A **ordem do banco importa**. A engine faz substituições sozinha durante a partida e desce pelo banco, então o primeiro nome é a primeira mudança.",
      "Mudar de formação custa **familiaridade** — o time joga melhor um desenho que já treinou do que um que você trocou ontem.",
      "Vale ler os avisos abaixo do campo: um titular indisponível será substituído no apito, com ou sem a sua vontade.",
    ],
  },
  league: {
    title: "Classificação",
    body: [
      "A tabela é sempre recalculada a partir dos resultados, nunca armazenada, então não tem como sair de sincronia com os jogos.",
      "Toque em qualquer clube para ver elenco, finanças e forma.",
    ],
  },
  inbox: {
    title: "Caixa de entrada",
    body: [
      "Propostas pelos seus jogadores chegam aqui **com prazo**. Ignorar é uma decisão: a proposta vence e o comprador vai embora.",
      "Relatórios de observação, avisos de contrato e transferências concluídas também caem aqui. Os avisos de contrato vêm a 180, 90 e 30 dias — uma vez cada.",
    ],
  },
  transfers: {
    title: "Transferências",
    body: [
      "**Alvos** é a sua lista de interesse. **Minhas propostas** são os lances que você fez, **Recebidas** são lances pelos seus jogadores, **Listados** são os que você colocou à venda.",
      "Uma proposta em aberto continua comprometendo o orçamento até ser respondida — por isso o disponível cai no momento em que você oferece.",
      "Acertar o valor é metade de uma contratação. Depois o jogador precisa aceitar os **termos pessoais**, e isso tem prazo próprio.",
      "**Listar** um jogador faz os rivais perguntarem por ele muito mais. O seu valor pedido é aceito de imediato se for defensável; peça muito acima do que ele vale e eles propõem o que acham.",
    ],
  },
  scouting: {
    title: "Observação",
    body: [
      "Você não sabe **nada** sobre um jogador que não observou — nem o rating. Tudo o que você vê de um rival é estimativa, e ela estreita conforme você aprende.",
      "Um olheiro fica com o jogador até chegar a 90%, entregando relatório aos 30% e aos 60% no caminho. Você nunca precisa mandá-lo de novo.",
      "Só dá para observar alguns jogadores por vez, então retirar alguém é como se libera uma vaga. O que já foi aprendido fica.",
      "90% é o limite da observação. O resto só vem convivendo com ele no dia a dia.",
    ],
  },
  finances: {
    title: "Finanças",
    body: [
      "Existe **um orçamento para a temporada**, e dele saem tanto as compras quanto toda a folha salarial.",
      "É por isso que os dois valores são o mesmo dinheiro dito duas vezes: um salário compromete um ano dele, então contratar alguém de salário alto custa dinheiro de compra.",
      "O que você recebe em vendas volta direto para o bolso, então vender realmente financia comprar.",
      "Terminar mais alto rende um orçamento maior na próxima temporada. Não existe caixa — a premiação chega como poder de compra, não como poupança.",
    ],
  },
  player: {
    title: "Perfil do jogador",
    body: [
      "Nos seus jogadores todo número é exato. Em qualquer outro, rating, valor e potencial são **estimativas** dos seus olheiros — as faixas estreitam quanto mais você observa.",
      "É aqui que se renova contrato. Ele pode aceitar, pedir o preço dele, ou recusar de vez.",
      "O gráfico por temporada fica vazio na primeira temporada porque genuinamente ainda não há o que plotar.",
    ],
  },
  club: {
    title: "Perfil do clube",
    body: [
      "Tamanho do elenco, idade média, folha e forma de qualquer clube da liga — útil para descobrir quem talvez venda.",
      "O rating dos jogadores de um rival continua valendo só o quanto você o observou.",
    ],
  },
};

export const HELP: Record<UILocale, Partial<Record<ScreenId, HelpTopic>>> = { en, "pt-BR": ptBR };

/** The help for a screen in the current language, or nothing when there is none to give. */
export function helpFor(locale: UILocale, screen: ScreenId): HelpTopic | undefined {
  return HELP[locale][screen];
}
