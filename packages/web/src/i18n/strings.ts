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
  // modes / controls
  mode: string;
  simple: string;
  advanced: string;
  theme: string;
  language: string;
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
  // match
  matchTitle: string;
  matchSubtitle: string;
  comingSoon: string;
  matchComingSoonBody: string;
  watchMatch: string;
  newMatch: string;
  finish: string;
  manage: string;
  substitution: string;
  tacticChange: string;
  tacticChangeHint: string;
  playerOut: string;
  playerIn: string;
  makeSub: string;
  noSubsLeft: string;
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
  mode: "Mode",
  simple: "Simple",
  advanced: "Advanced",
  theme: "Theme",
  language: "Language",
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
  matchTitle: "Match",
  matchSubtitle: "Live match view",
  comingSoon: "Coming soon",
  matchComingSoonBody:
    "The live match visualisation — the pitch state at every decision — plugs into the deterministic engine here next.",
  watchMatch: "Watch match",
  newMatch: "New match",
  finish: "Finish",
  manage: "Manage",
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
  continue: "Continue",
};

const ptBR: UIStrings = {
  dashboard: "Painel",
  squad: "Elenco",
  tactics: "Tática",
  match: "Partida",
  league: "Liga",
  mode: "Modo",
  simple: "Simples",
  advanced: "Avançado",
  theme: "Tema",
  language: "Idioma",
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
  matchTitle: "Partida",
  matchSubtitle: "Visão da partida ao vivo",
  comingSoon: "Em breve",
  matchComingSoonBody:
    "A visualização da partida ao vivo — o estado do campo a cada decisão — será conectada ao motor determinístico aqui.",
  watchMatch: "Assistir",
  newMatch: "Nova partida",
  finish: "Encerrar",
  manage: "Gerir",
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
  continue: "Continuar",
};

export const UI_STRINGS: Record<UILocale, UIStrings> = { en, "pt-BR": ptBR };
