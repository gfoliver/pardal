// UI-chrome strings (interface labels), EN + PT-BR. The engine's @fut/i18n
// handles match narration; this layer handles the app shell / screens so the
// interface is localised from day one.

export type UILocale = "en" | "pt-BR";

export const UI_LOCALES: { id: UILocale; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "pt-BR", label: "PT" },
];

export interface UIStrings {
  // nav
  dashboard: string;
  squad: string;
  tactics: string;
  match: string;
  league: string;
  calendar: string;
  inbox: string;
  transfers: string;
  scouting: string;
  finances: string;
  // career
  career: string;
  newCareer: string;
  continueCareer: string;
  chooseClub: string;
  dataset: string;
  start: string;
  advance: string;
  simulateSeason: string;
  seasonComplete: string;
  standings: string;
  unread: string;
  noMessages: string;
  objective: string;
  confidence: string;
  comingSoonShort: string;
  balance: string;
  // modes / controls
  mode: string;
  simple: string;
  advanced: string;
  theme: string;
  language: string;
  currency: string;
  collapse: string;
  lineups: string;
  // dashboard
  nextMatch: string;
  form: string;
  leaguePosition: string;
  topPerformers: string;
  squadOverview: string;
  play: string;
  quickSim: string;
  // squad
  squadTitle: string;
  squadSubtitle: string;
  player: string;
  position: string;
  age: string;
  overall: string;
  role: string;
  attributes: string;
  pace: string;
  shooting: string;
  passing: string;
  defending: string;
  physical: string;
  // tactics
  tacticsTitle: string;
  tacticsSubtitle: string;
  formation: string;
  mentality: string;
  customize: string;
  teamInstructions: string;
  lineHeight: string;
  pressing: string;
  tempo: string;
  widthInstr: string;
  directness: string;
  marking: string;
  matchSetup: string;
  playerEditor: string;
  positionLabel: string;
  advancedHint: string;
  selectPlayerHint: string;
  autoPick: string;
  movePositions: string;
  movePositionsHint: string;
  kits: string;
  kitHome: string;
  kitAway: string;
  bench: string;
  changePlayer: string;
  // match
  matchTitle: string;
  matchSubtitle: string;
  comingSoon: string;
  matchComingSoonBody: string;
  watchMatch: string;
  newMatch: string;
  finish: string;
  manage: string;
  matchPrep: string;
  matchPrepHint: string;
  kickOff: string;
  editTactics: string;
  simulatingToEnd: string;
  fullTime: string;
  manOfTheMatch: string;
  roundSummary: string;
  otherResults: string;
  goalsScored: string;
  substitution: string;
  tacticChange: string;
  tacticChangeHint: string;
  playerOut: string;
  playerIn: string;
  makeSub: string;
  noSubsLeft: string;
  // transfers / scouting
  club: string;
  value: string;
  potential: string;
  scout: string;
  scouted: string;
  target: string;
  addedToTargets: string;
  scoutedCount: string;
  offerAction: string;
  removeAction: string;
  targetsTab: string;
  myOffersTab: string;
  receivedTab: string;
  emptyTargets: string;
  noOffersMade: string;
  noOffersReceived: string;
  accept: string;
  reject: string;
  personalTerms: string;
  feeAgreedWith: string;
  agreeTerms: string;
  offerFor: string;
  valueBalance: string;
  fee: string;
  cancel: string;
  lodgeOffer: string;
  termsFor: string;
  expectedWageLabel: string;
  wage: string;
  wagePerWeek: string;
  years: string;
  offerContract: string;
  renewContract: string;
  out: string;
  offerLodged: string;
  offerFailed: string;
  playerSigns: string;
  playerHoldsOut: string;
  statusPending: string;
  statusAccepted: string;
  statusRejected: string;
  statusSigned: string;
  statusWithdrawn: string;
  // finances
  cash: string;
  transferBudget: string;
  wageBudget: string;
  wageBill: string;
  revenueCosts: string;
  matchdayIncome: string;
  tvIncome: string;
  netPerRound: string;
  topEarners: string;
  ofWageBill: string;
  perRoundHint: string;
  perRound: string;
  perMonth: string;
  // player detail
  back: string;
  development: string;
  currentAbility: string;
  contractUntil: string;
  marketValue: string;
  potentialUnknown: string;
  addToTargets: string;
  alreadyTarget: string;
  statusKey: string;
  statusFirstTeam: string;
  statusRotation: string;
  statusBackup: string;
  statusProspect: string;
  statusSurplus: string;
  // player detail (rich)
  currentClub: string;
  salary: string;
  expires: string;
  positions: string;
  status: string;
  condition: string;
  morale: string;
  personality: string;
  injuredLabel: string;
  no: string;
  statistics: string;
  games: string;
  goals: string;
  assists: string;
  average: string;
  lastGames: string;
  opponent: string;
  result: string;
  rating: string;
  makeOffer: string;
  offerContractAction: string;
  compare: string;
  attrFin: string;
  attrTec: string;
  attrPas: string;
  attrDes: string;
  attrFis: string;
  attrVel: string;
  // club profile
  level: string;
  reputation: string;
  coach: string;
  highlights: string;
  bestPlayer: string;
  highestPotential: string;
  topScorer: string;
  topAssister: string;
  campaign: string;
  playersLabel: string;
  avgLevel: string;
  avgAge: string;
  totalValue: string;
  avgValueLabel: string;
  avgWage: string;
  foreigners: string;
  u21: string;
  injuredCount: string;
  // generic
  continue: string;
  home: string;
  away: string;
  won: string;
  drawn: string;
  lost: string;
  goalsFor: string;
  goalsAgainst: string;
  points: string;
  viewAll: string;
}

const en: UIStrings = {
  dashboard: "Dashboard",
  squad: "Squad",
  tactics: "Tactics",
  match: "Match",
  league: "League",
  calendar: "Calendar",
  inbox: "Inbox",
  transfers: "Transfers",
  scouting: "Scouting",
  finances: "Finances",
  career: "Career",
  newCareer: "New career",
  continueCareer: "Continue",
  chooseClub: "Choose your club",
  dataset: "Dataset",
  start: "Start",
  advance: "Advance",
  simulateSeason: "Sim season",
  seasonComplete: "Season complete",
  standings: "Standings",
  unread: "unread",
  noMessages: "No messages",
  objective: "Objective",
  confidence: "Confidence",
  comingSoonShort: "Coming soon",
  balance: "Balance",
  mode: "Mode",
  simple: "Simple",
  advanced: "Advanced",
  theme: "Theme",
  language: "Language",
  currency: "Currency",
  collapse: "Collapse",
  lineups: "Lineups",
  nextMatch: "Next match",
  form: "Form",
  leaguePosition: "League position",
  topPerformers: "Top performers",
  squadOverview: "Squad overview",
  play: "Play match",
  quickSim: "Quick sim",
  squadTitle: "Squad",
  squadSubtitle: "Your first team and their attributes",
  player: "Player",
  position: "Pos",
  age: "Age",
  overall: "OVR",
  role: "Role",
  attributes: "Attributes",
  pace: "Pace",
  shooting: "Shooting",
  passing: "Passing",
  defending: "Defending",
  physical: "Physical",
  tacticsTitle: "Tactics",
  tacticsSubtitle: "Shape, roles and team instructions",
  formation: "Formation",
  mentality: "Mentality",
  customize: "Customize",
  teamInstructions: "Team instructions",
  lineHeight: "Line height",
  pressing: "Pressing",
  tempo: "Tempo",
  widthInstr: "Width",
  directness: "Directness",
  marking: "Marking",
  matchSetup: "Match setup",
  playerEditor: "Player",
  positionLabel: "Position",
  advancedHint: "Pick a formation and slot your players. Switch to Advanced to customise each player's position & role and your instructions.",
  selectPlayerHint: "Select a player on the pitch to edit their position and role.",
  autoPick: "Auto-pick",
  movePositions: "Move positions",
  movePositionsHint: "Drag a shirt to reposition it on the pitch.",
  kits: "Kits",
  kitHome: "Kit 1 (home)",
  kitAway: "Kit 2 (away)",
  bench: "Bench",
  changePlayer: "Change player",
  matchTitle: "Match",
  matchSubtitle: "Live match view",
  comingSoon: "Coming soon",
  matchComingSoonBody:
    "The live match visualisation — the pitch state at every decision — plugs into the deterministic engine here next.",
  watchMatch: "Watch match",
  newMatch: "New match",
  finish: "Finish",
  manage: "Manage",
  matchPrep: "Match preparation",
  matchPrepHint: "Check your lineup and tactics, then kick off.",
  kickOff: "Kick off",
  editTactics: "Edit tactics",
  simulatingToEnd: "Simulating…",
  fullTime: "Full time",
  manOfTheMatch: "Man of the match",
  roundSummary: "Round {n}",
  otherResults: "Other results",
  goalsScored: "Goals",
  substitution: "Substitution",
  tacticChange: "Tactic change",
  tacticChangeHint: "Takes a few minutes to take effect.",
  playerOut: "Out",
  playerIn: "In",
  makeSub: "Make substitution",
  noSubsLeft: "No subs left",
  home: "Home",
  away: "Away",
  won: "W",
  drawn: "D",
  lost: "L",
  goalsFor: "GF",
  goalsAgainst: "GA",
  points: "Pts",
  viewAll: "View all",
  club: "Club",
  value: "Value",
  potential: "Potential",
  scout: "Scout",
  scouted: "scouted",
  target: "Target",
  addedToTargets: "{name} added to targets.",
  scoutedCount: "{n} scouted",
  offerAction: "Offer",
  removeAction: "remove",
  targetsTab: "Targets",
  myOffersTab: "My offers",
  receivedTab: "Received",
  emptyTargets: "Scout and add players to your shortlist.",
  noOffersMade: "No offers made.",
  noOffersReceived: "No offers received.",
  accept: "Accept",
  reject: "Reject",
  personalTerms: "Personal terms",
  feeAgreedWith: "fee agreed with {club} ({fee})",
  agreeTerms: "Agree terms",
  offerFor: "Offer for {name}",
  valueBalance: "Value {value} · Balance {balance}",
  fee: "Fee",
  cancel: "Cancel",
  lodgeOffer: "Lodge offer",
  termsFor: "Terms · {name}",
  expectedWageLabel: "Expected wage {wage}/month",
  wage: "Wage",
  wagePerWeek: "Wage / month",
  years: "Years",
  offerContract: "Offer contract",
  renewContract: "Renew contract",
  out: "OUT",
  offerLodged: "Offer lodged for {name}.",
  offerFailed: "Couldn't lodge offer for {name}.",
  playerSigns: "{name} signs!",
  playerHoldsOut: "{name} wants higher wages.",
  statusPending: "Pending",
  statusAccepted: "Accepted",
  statusRejected: "Rejected",
  statusSigned: "Signed",
  statusWithdrawn: "Withdrawn",
  cash: "Cash",
  transferBudget: "Transfer budget",
  wageBudget: "Wage budget",
  wageBill: "Wage bill",
  revenueCosts: "Revenue & costs",
  matchdayIncome: "Matchday (per home game)",
  tvIncome: "TV (per round)",
  netPerRound: "Net (per home round)",
  topEarners: "Top earners",
  ofWageBill: "of wage bill",
  perRoundHint: "Wages are monthly, charged pro-rata each match round; matchday income only on home games.",
  perRound: "per round",
  perMonth: "per month",
  back: "Back",
  development: "Development",
  currentAbility: "Current ability",
  contractUntil: "Contract until",
  marketValue: "Market value",
  potentialUnknown: "Scout this player to reveal their potential.",
  addToTargets: "Add to targets",
  alreadyTarget: "On your shortlist",
  statusKey: "Key player",
  statusFirstTeam: "First team",
  statusRotation: "Rotation",
  statusBackup: "Backup",
  statusProspect: "Prospect",
  statusSurplus: "Surplus",
  currentClub: "Current club",
  salary: "Salary",
  expires: "Expires",
  positions: "Positions",
  status: "Status",
  condition: "Condition",
  morale: "Morale",
  personality: "Personality",
  injuredLabel: "Injured",
  no: "No",
  statistics: "Statistics",
  games: "Games",
  goals: "Goals",
  assists: "Assists",
  average: "Average",
  lastGames: "Recent games",
  opponent: "Opponent",
  result: "Result",
  rating: "Rating",
  makeOffer: "Make offer",
  offerContractAction: "Offer contract",
  compare: "Compare",
  attrFin: "Finishing",
  attrTec: "Technique",
  attrPas: "Passing",
  attrDes: "Tackling",
  attrFis: "Physical",
  attrVel: "Pace",
  level: "Level",
  reputation: "Reputation",
  coach: "Coach",
  highlights: "Highlights",
  bestPlayer: "Best player",
  highestPotential: "Highest potential",
  topScorer: "Top scorer",
  topAssister: "Top assister",
  campaign: "Campaign",
  playersLabel: "Players",
  avgLevel: "Avg level",
  avgAge: "Avg age",
  totalValue: "Total value",
  avgValueLabel: "Avg value",
  avgWage: "Avg wage",
  foreigners: "Foreigners",
  u21: "Under-21",
  injuredCount: "Injured",
  continue: "Continue",
};

const ptBR: UIStrings = {
  dashboard: "Painel",
  squad: "Elenco",
  tactics: "Tática",
  match: "Partida",
  league: "Liga",
  calendar: "Calendário",
  inbox: "Caixa de entrada",
  transfers: "Transferências",
  scouting: "Observação",
  finances: "Finanças",
  career: "Carreira",
  newCareer: "Nova carreira",
  continueCareer: "Continuar",
  chooseClub: "Escolha seu clube",
  dataset: "Base de dados",
  start: "Começar",
  advance: "Avançar",
  simulateSeason: "Simular temporada",
  seasonComplete: "Temporada encerrada",
  standings: "Classificação",
  unread: "não lidas",
  noMessages: "Nenhuma mensagem",
  objective: "Objetivo",
  confidence: "Confiança",
  comingSoonShort: "Em breve",
  balance: "Saldo",
  mode: "Modo",
  simple: "Simples",
  advanced: "Avançado",
  theme: "Tema",
  language: "Idioma",
  currency: "Moeda",
  collapse: "Recolher",
  lineups: "Escalações",
  nextMatch: "Próxima partida",
  form: "Forma",
  leaguePosition: "Posição na liga",
  topPerformers: "Destaques",
  squadOverview: "Visão do elenco",
  play: "Jogar partida",
  quickSim: "Simular",
  squadTitle: "Elenco",
  squadSubtitle: "Seu time principal e seus atributos",
  player: "Jogador",
  position: "Pos",
  age: "Idade",
  overall: "GER",
  role: "Função",
  attributes: "Atributos",
  pace: "Ritmo",
  shooting: "Finalização",
  passing: "Passe",
  defending: "Defesa",
  physical: "Físico",
  tacticsTitle: "Tática",
  tacticsSubtitle: "Formação, funções e instruções",
  formation: "Formação",
  mentality: "Mentalidade",
  customize: "Customizar",
  teamInstructions: "Instruções da equipe",
  lineHeight: "Linha defensiva",
  pressing: "Pressão",
  tempo: "Ritmo",
  widthInstr: "Largura",
  directness: "Verticalidade",
  marking: "Marcação",
  matchSetup: "Configuração da partida",
  playerEditor: "Jogador",
  positionLabel: "Posição",
  advancedHint: "Escolha uma formação e encaixe seus jogadores. Ative o Avançado para customizar posição e função de cada jogador e suas instruções.",
  selectPlayerHint: "Selecione um jogador no campo para editar posição e função.",
  autoPick: "Escalação automática",
  movePositions: "Mover posições",
  movePositionsHint: "Arraste uma camisa para reposicioná-la no campo.",
  kits: "Uniformes",
  kitHome: "Uniforme 1 (casa)",
  kitAway: "Uniforme 2 (fora)",
  bench: "Reservas",
  changePlayer: "Trocar jogador",
  matchTitle: "Partida",
  matchSubtitle: "Visão da partida ao vivo",
  comingSoon: "Em breve",
  matchComingSoonBody:
    "A visualização da partida ao vivo — o estado do campo a cada decisão — será conectada ao motor determinístico aqui.",
  watchMatch: "Assistir",
  newMatch: "Nova partida",
  finish: "Encerrar",
  manage: "Gerir",
  matchPrep: "Preparação da partida",
  matchPrepHint: "Confira sua escalação e tática, depois inicie a partida.",
  kickOff: "Iniciar partida",
  editTactics: "Ajustar tática",
  simulatingToEnd: "Simulando…",
  fullTime: "Fim de jogo",
  manOfTheMatch: "Melhor da partida",
  roundSummary: "Rodada {n}",
  otherResults: "Outros resultados",
  goalsScored: "Gols",
  substitution: "Substituição",
  tacticChange: "Mudança tática",
  tacticChangeHint: "Leva alguns minutos para surtir efeito.",
  playerOut: "Sai",
  playerIn: "Entra",
  makeSub: "Substituir",
  noSubsLeft: "Sem substituições",
  home: "Casa",
  away: "Fora",
  won: "V",
  drawn: "E",
  lost: "D",
  goalsFor: "GP",
  goalsAgainst: "GC",
  points: "Pts",
  viewAll: "Ver tudo",
  club: "Clube",
  value: "Valor",
  potential: "Potencial",
  scout: "Observar",
  scouted: "observado",
  target: "Alvo",
  addedToTargets: "{name} adicionado aos alvos.",
  scoutedCount: "{n} observados",
  offerAction: "Propor",
  removeAction: "remover",
  targetsTab: "Alvos",
  myOffersTab: "Minhas propostas",
  receivedTab: "Recebidas",
  emptyTargets: "Observe e adicione jogadores à sua lista.",
  noOffersMade: "Nenhuma proposta feita.",
  noOffersReceived: "Nenhuma proposta recebida.",
  accept: "Aceitar",
  reject: "Recusar",
  personalTerms: "Termos pessoais",
  feeAgreedWith: "acordo com {club} ({fee})",
  agreeTerms: "Acertar termos",
  offerFor: "Proposta por {name}",
  valueBalance: "Valor {value} · Saldo {balance}",
  fee: "Valor da proposta",
  cancel: "Cancelar",
  lodgeOffer: "Enviar proposta",
  termsFor: "Termos · {name}",
  expectedWageLabel: "Salário esperado {wage}/mês",
  wage: "Salário",
  wagePerWeek: "Salário / mês",
  years: "Anos",
  offerContract: "Propor contrato",
  renewContract: "Renovar contrato",
  out: "FORA",
  offerLodged: "Proposta enviada por {name}.",
  offerFailed: "Não foi possível propor por {name}.",
  playerSigns: "{name} assinou!",
  playerHoldsOut: "{name} quer salário maior.",
  statusPending: "Pendente",
  statusAccepted: "Aceita",
  statusRejected: "Recusada",
  statusSigned: "Assinado",
  statusWithdrawn: "Retirada",
  cash: "Caixa",
  transferBudget: "Orçamento de transferências",
  wageBudget: "Orçamento salarial",
  wageBill: "Folha salarial",
  revenueCosts: "Receitas e custos",
  matchdayIncome: "Bilheteria (por jogo em casa)",
  tvIncome: "TV (por rodada)",
  netPerRound: "Saldo (por rodada em casa)",
  topEarners: "Maiores salários",
  ofWageBill: "da folha",
  perRoundHint: "Salários são mensais, cobrados proporcionalmente a cada rodada; a bilheteria só nos jogos em casa.",
  perRound: "por rodada",
  perMonth: "por mês",
  back: "Voltar",
  development: "Desenvolvimento",
  currentAbility: "Habilidade atual",
  contractUntil: "Contrato até",
  marketValue: "Valor de mercado",
  potentialUnknown: "Observe este jogador para revelar o potencial.",
  addToTargets: "Adicionar aos alvos",
  alreadyTarget: "Na sua lista",
  statusKey: "Jogador-chave",
  statusFirstTeam: "Titular",
  statusRotation: "Rotação",
  statusBackup: "Reserva",
  statusProspect: "Promessa",
  statusSurplus: "Excedente",
  currentClub: "Clube atual",
  salary: "Salário",
  expires: "Expira",
  positions: "Posições",
  status: "Status",
  condition: "Condição",
  morale: "Moral",
  personality: "Personalidade",
  injuredLabel: "Lesionado",
  no: "Não",
  statistics: "Estatísticas",
  games: "Jogos",
  goals: "Gols",
  assists: "Assist.",
  average: "Média",
  lastGames: "Últimos jogos",
  opponent: "Adversário",
  result: "Resultado",
  rating: "Nota",
  makeOffer: "Fazer proposta",
  offerContractAction: "Oferecer contrato",
  compare: "Comparar",
  attrFin: "Finalização",
  attrTec: "Técnica",
  attrPas: "Passe",
  attrDes: "Desarme",
  attrFis: "Físico",
  attrVel: "Velocidade",
  level: "Nível",
  reputation: "Reputação",
  coach: "Treinador",
  highlights: "Destaques",
  bestPlayer: "Melhor jogador",
  highestPotential: "Maior potencial",
  topScorer: "Artilheiro",
  topAssister: "Garçom",
  campaign: "Campanha",
  playersLabel: "Jogadores",
  avgLevel: "Nível médio",
  avgAge: "Idade média",
  totalValue: "Valor total",
  avgValueLabel: "Valor médio",
  avgWage: "Salário médio",
  foreigners: "Estrangeiros",
  u21: "Sub-21",
  injuredCount: "Lesionados",
  continue: "Continuar",
};

export const UI_STRINGS: Record<UILocale, UIStrings> = { en, "pt-BR": ptBR };
