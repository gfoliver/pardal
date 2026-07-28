// UI-chrome strings (interface labels), EN + PT-BR. The engine's @fut/i18n
// handles match narration; this layer handles the app shell / screens so the
// interface is localised from day one.

import type { AttrName, Position, RoleKey } from "@fut/domain";

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
  // saved tactics
  newTactic: string;
  duplicateTactic: string;
  renameTactic: string;
  deleteTactic: string;
  tacticName: string;
  maxTacticsHint: string;
  // strategy presets
  preset: string;
  presetCustom: string;
  presetHighPress: string;
  presetPossession: string;
  presetCounter: string;
  presetLowBlock: string;
  presetBalanced: string;
  presetDirect: string;
  // familiarity + fit
  familiarity: string;
  fitShort: string;
  avgFit: string;
  // diagnostics
  diagnostics: string;
  diagStarterUnavailable: string;
  diagOutOfPosition: string;
  diagNoBenchGk: string;
  diagOverlappingSlots: string;
  diagBenchShort: string;
  // layout
  viewPitch: string;
  viewDetailed: string;
  reserves: string;
  naturalPos: string;
  nationalityShort: string;
  loadSavedTactic: string;
  subSlot: string;
  starters: string;
  reservesTitle: string;
  squadOut: string;
  lineupTab: string;
  tacticsTab: string;
  // slider endpoints
  tempoLow: string;
  tempoHigh: string;
  pressingLow: string;
  pressingHigh: string;
  lineHeightLow: string;
  lineHeightHigh: string;
  widthLow: string;
  widthHigh: string;
  directnessLow: string;
  directnessHigh: string;
  // mentality (short) + marking
  mentalityVeryDefensive: string;
  mentalityDefensive: string;
  mentalityBalanced: string;
  mentalityAttacking: string;
  mentalityVeryAttacking: string;
  /** Unabbreviated, for the tooltip behind each short label. */
  mentalityVeryDefensiveFull: string;
  mentalityDefensiveFull: string;
  mentalityBalancedFull: string;
  mentalityAttackingFull: string;
  mentalityVeryAttackingFull: string;
  markingZonal: string;
  markingMan: string;
  /**
   * Positions and roles are domain enums, so they're keyed by the enum itself
   * rather than spelled out as flat keys — TypeScript then refuses a locale that
   * forgets one. `positionShort` is the pitch/table abbreviation (CB, ZAG…).
   */
  positionShort: Record<Position, string>;
  positionNames: Record<Position, string>;
  roleNames: Record<RoleKey, string>;
  /** Every individual attribute, keyed by the domain's own `AttrName`. */
  attrNames: Record<AttrName, string>;
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
  /** Header state + tooltip while a watched match is being played. */
  matchInProgress: string;
  matchInProgressHint: string;
  /** The penalty replay: title, the four verdicts, and the replay button. */
  penaltyKick: string;
  pkScored: string;
  pkSaved: string;
  pkPost: string;
  pkWide: string;
  pkReplay: string;
  editTactics: string;
  simulatingToEnd: string;
  fullTime: string;
  manOfTheMatch: string;
  roundSummary: string;
  otherResults: string;
  changeShirtNumber: string;
  shirtNumber: string;
  shirtTakenBy: string;
  resultWin: string;
  resultDraw: string;
  resultLoss: string;
  /** League screen tabs: played rounds and the ones still to come. */
  results: string;
  fixtures: string;
  round: string;
  noResultsYet: string;
  seasonFinished: string;
  goalsScored: string;
  substitution: string;
  tacticChange: string;
  tacticChangeHint: string;
  playerOut: string;
  playerIn: string;
  makeSub: string;
  noSubsLeft: string;
  matchTactics: string;
  injuryForcesChange: string;
  playOnShort: string;
  injuredMark: string;
  today: string;
  matchTacticsHint: string;
  resumeMatch: string;
  subsLeft: string;
  swapPlayers: string;
  onPitch: string;
  // transfers / scouting
  club: string;
  value: string;
  potential: string;
  scout: string;
  scouted: string;
  target: string;
  addedToTargets: string;
  scoutedCount: string;
  // scouting desk
  knowledge: string;
  scoutSlots: string;
  underObservation: string;
  daysLeft: string;
  scoutAtCapacity: string;
  scoutAlreadyWatching: string;
  scoutFullyKnown: string;
  scoutOwnPlayer: string;
  // negotiation
  stageOffered: string;
  stageCountered: string;
  stageFeeAgreed: string;
  stagePersonalTerms: string;
  stageExpired: string;
  reasonBelowValuation: string;
  reasonKeyPlayer: string;
  reasonSquadTooThin: string;
  reasonAlreadyRefused: string;
  roundBid: string;
  roundAsk: string;
  counterAction: string;
  askForAction: string;
  askContext: string;
  withdrawAction: string;
  acceptAsking: string;
  counterContext: string;
  // contract renewal
  heWants: string;
  heHoldsOut: string;
  offerInsulting: string;
  matchDemands: string;
  contractRunsOut: string;
  expiringTab: string;
  noExpiring: string;
  viewProfile: string;
  actionsLabel: string;
  allFilter: string;
  expiringCount: string;
  developmentTitle: string;
  noHistory: string;
  attributesUnknown: string;
  attrGroupPhysical: string;
  attrGroupMental: string;
  attrGroupTechnical: string;
  attrGroupGoalkeeping: string;
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
  newTactic: "New tactic",
  duplicateTactic: "Duplicate",
  renameTactic: "Rename",
  deleteTactic: "Delete",
  tacticName: "Tactic name",
  maxTacticsHint: "Up to 6 saved tactics",
  preset: "Strategy",
  presetCustom: "Custom",
  presetHighPress: "High press",
  presetPossession: "Possession",
  presetCounter: "Counter-attack",
  presetLowBlock: "Low block",
  presetBalanced: "Balanced",
  presetDirect: "Direct play",
  familiarity: "Familiarity",
  fitShort: "FIT",
  avgFit: "Avg fit",
  diagnostics: "Diagnostics",
  diagStarterUnavailable: "{name} is unavailable",
  diagOutOfPosition: "{name} is out of position",
  diagNoBenchGk: "No fit goalkeeper on the bench",
  diagOverlappingSlots: "Two players are on the same spot",
  diagBenchShort: "Bench is thin",
  viewPitch: "Pitch",
  viewDetailed: "Detailed",
  reserves: "Reserves",
  naturalPos: "Natural",
  nationalityShort: "Nat",
  loadSavedTactic: "Load saved tactic",
  subSlot: "Sub",
  starters: "Starters",
  reservesTitle: "Substitutes",
  squadOut: "Squad (not in the 18)",
  lineupTab: "Lineup",
  tacticsTab: "Tactics",
  tempoLow: "Patient",
  tempoHigh: "Fast",
  pressingLow: "Contain",
  pressingHigh: "Full press",
  lineHeightLow: "Deep",
  lineHeightHigh: "High",
  widthLow: "Narrow",
  widthHigh: "Wide",
  directnessLow: "Short",
  directnessHigh: "Direct",
  mentalityVeryDefensive: "V. Def",
  mentalityDefensive: "Def",
  mentalityBalanced: "Bal",
  mentalityAttacking: "Ofn",
  mentalityVeryAttacking: "V. Ofn",
  mentalityVeryDefensiveFull: "Very defensive",
  mentalityDefensiveFull: "Defensive",
  mentalityBalancedFull: "Balanced",
  mentalityAttackingFull: "Attacking",
  mentalityVeryAttackingFull: "Very attacking",
  markingZonal: "Zonal",
  markingMan: "Man",
  positionShort: {
    goalkeeper: "GK", centreBack: "CB", fullBack: "FB", wingBack: "WB", defensiveMidfielder: "DM",
    centralMidfielder: "CM", attackingMidfielder: "AM", winger: "WG", striker: "ST",
  },
  positionNames: {
    goalkeeper: "Goalkeeper", centreBack: "Centre back", fullBack: "Full back", wingBack: "Wing back",
    defensiveMidfielder: "Defensive midfielder", centralMidfielder: "Central midfielder",
    attackingMidfielder: "Attacking midfielder", winger: "Winger", striker: "Striker",
  },
  roleNames: {
    goalkeeper: "Goalkeeper", stopper: "Stopper", ballPlayingDefender: "Ball-playing defender",
    defensiveFullBack: "Defensive full-back", wingBack: "Wing-back", ballWinningMidfielder: "Ball-winning midfielder",
    deepLyingPlaymaker: "Deep-lying playmaker", boxToBox: "Box-to-box", attackingMidfielder: "Attacking midfielder",
    winger: "Winger", insideForward: "Inside forward", wideMidfielder: "Wide midfielder", targetMan: "Target man",
    poacher: "Poacher", falseNine: "False nine", infiltratingForward: "Infiltrating forward",
  },
  attrNames: {
    pace: "Pace", stamina: "Stamina", strength: "Strength", agility: "Agility",
    decisions: "Decisions", composure: "Composure", workRate: "Work rate", teamwork: "Teamwork",
    aggression: "Aggression", anticipation: "Anticipation", positioning: "Positioning", vision: "Vision",
    passing: "Passing", technique: "Technique", dribbling: "Dribbling", finishing: "Finishing",
    shotPower: "Shot power", tackling: "Tackling", marking: "Marking", crossing: "Crossing",
    reflexes: "Reflexes", handling: "Handling", gkPositioning: "GK positioning", oneOnOnes: "One-on-ones",
  },
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
  matchInProgress: "Match in progress",
  matchInProgressHint: "The match is being played — this is locked until full time.",
  penaltyKick: "Penalty",
  pkScored: "Scored",
  pkSaved: "Saved",
  pkPost: "Off the woodwork",
  pkWide: "Off target",
  pkReplay: "Replay",
  editTactics: "Edit tactics",
  simulatingToEnd: "Simulating…",
  fullTime: "Full time",
  manOfTheMatch: "Man of the match",
  changeShirtNumber: "Change squad number",
  shirtNumber: "Squad number",
  shirtTakenBy: "{name} wears it — they'll swap numbers.",
  resultWin: "Win",
  resultDraw: "Draw",
  resultLoss: "Loss",
  results: "Results",
  fixtures: "Fixtures",
  round: "Round",
  noResultsYet: "No matches played yet",
  seasonFinished: "Every fixture has been played",
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
  matchTactics: "In-match tactics",
  injuryForcesChange: "{name} is hurt and can't continue. Bring someone on, or play a man short.",
  playOnShort: "Play a man short",
  injuredMark: "Injured",
  today: "Today",
  matchTacticsHint: "Tap two players to swap them, or a bench player to bring him on.",
  resumeMatch: "Back to the match",
  subsLeft: "Subs left",
  swapPlayers: "Swap",
  onPitch: "On the pitch",
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
  knowledge: "Known",
  scoutSlots: "{used} of {total} scouts out",
  underObservation: "Under observation",
  daysLeft: "{n}d left",
  scoutAtCapacity: "All your scouts are already out",
  scoutAlreadyWatching: "Already under observation",
  scoutFullyKnown: "You know all a scout can tell you",
  scoutOwnPlayer: "He's your player — you know him already",
  stageOffered: "Awaiting reply",
  stageCountered: "They countered",
  stageFeeAgreed: "Fee agreed",
  stagePersonalTerms: "Personal terms",
  stageExpired: "Lapsed",
  reasonBelowValuation: "They value him well above your offer.",
  reasonKeyPlayer: "He's central to their side — they won't discuss it.",
  reasonSquadTooThin: "They can't sell: it would leave them short in that position.",
  reasonAlreadyRefused: "They've already turned this down.",
  roundBid: "bid",
  roundAsk: "ask",
  counterAction: "Counter",
  askForAction: "Name a price",
  askContext: "They've bid {theirs}. Name what it would take.",
  withdrawAction: "Withdraw",
  acceptAsking: "Accept {fee}",
  counterContext: "You offered {ours}; they're asking {theirs}.",
  heWants: "He's asking {wage} over {years} years.",
  heHoldsOut: "He turned it down — he won't sign below {wage}.",
  offerInsulting: "He's insulted by that. Come back with something serious.",
  matchDemands: "Meet his demands",
  contractRunsOut: "His contract runs out in {n} days.",
  expiringTab: "Expiring",
  noExpiring: "No contracts running out soon.",
  viewProfile: "View profile",
  actionsLabel: "Actions",
  allFilter: "All",
  expiringCount: "{n} running out",
  developmentTitle: "Development",
  noHistory: "No seasons on record yet.",
  attributesUnknown: "Send a scout to learn anything about this player.",
  attrGroupPhysical: "Physical",
  attrGroupMental: "Mental",
  attrGroupTechnical: "Technical",
  attrGroupGoalkeeping: "Goalkeeping",
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
  newTactic: "Nova tática",
  duplicateTactic: "Duplicar",
  renameTactic: "Renomear",
  deleteTactic: "Excluir",
  tacticName: "Nome da tática",
  maxTacticsHint: "Até 6 táticas salvas",
  preset: "Estratégia",
  presetCustom: "Personalizada",
  presetHighPress: "Pressão alta",
  presetPossession: "Posse de bola",
  presetCounter: "Contra-ataque",
  presetLowBlock: "Bloco baixo",
  presetBalanced: "Equilibrada",
  presetDirect: "Jogo direto",
  familiarity: "Familiaridade",
  fitShort: "ENC",
  avgFit: "Enc. média",
  diagnostics: "Diagnóstico",
  diagStarterUnavailable: "{name} está indisponível",
  diagOutOfPosition: "{name} está fora de posição",
  diagNoBenchGk: "Sem goleiro reserva apto",
  diagOverlappingSlots: "Dois jogadores na mesma posição",
  diagBenchShort: "Banco curto",
  viewPitch: "Campo",
  viewDetailed: "Detalhado",
  reserves: "Reservas",
  naturalPos: "Natural",
  nationalityShort: "Nac",
  loadSavedTactic: "Carregar tática salva",
  subSlot: "Sub",
  starters: "Titulares",
  reservesTitle: "Reservas",
  squadOut: "Elenco (fora dos 18)",
  lineupTab: "Escalação",
  tacticsTab: "Táticas",
  tempoLow: "Paciente",
  tempoHigh: "Rápido",
  pressingLow: "Conter",
  pressingHigh: "Pressão total",
  lineHeightLow: "Recuada",
  lineHeightHigh: "Alta",
  widthLow: "Estreito",
  widthHigh: "Aberto",
  directnessLow: "Curto",
  directnessHigh: "Direto",
  mentalityVeryDefensive: "M. Def",
  mentalityDefensive: "Def",
  mentalityBalanced: "Equi",
  mentalityAttacking: "Ofen",
  mentalityVeryAttacking: "M. Ofen",
  mentalityVeryDefensiveFull: "Muito defensiva",
  mentalityDefensiveFull: "Defensiva",
  mentalityBalancedFull: "Equilibrada",
  mentalityAttackingFull: "Ofensiva",
  mentalityVeryAttackingFull: "Muito ofensiva",
  markingZonal: "Zonal",
  markingMan: "Homem a homem",
  positionShort: {
    goalkeeper: "GOL", centreBack: "ZAG", fullBack: "LAT", wingBack: "ALA", defensiveMidfielder: "VOL",
    centralMidfielder: "MC", attackingMidfielder: "MEI", winger: "PON", striker: "ATA",
  },
  positionNames: {
    goalkeeper: "Goleiro", centreBack: "Zagueiro", fullBack: "Lateral", wingBack: "Ala",
    defensiveMidfielder: "Volante", centralMidfielder: "Meio-campista",
    attackingMidfielder: "Meia atacante", winger: "Ponta", striker: "Atacante",
  },
  roleNames: {
    goalkeeper: "Goleiro", stopper: "Zagueiro marcador", ballPlayingDefender: "Zagueiro construtor",
    defensiveFullBack: "Lateral defensivo", wingBack: "Ala", ballWinningMidfielder: "Volante de marcação",
    deepLyingPlaymaker: "Meia recuado", boxToBox: "Box to box", attackingMidfielder: "Meia atacante",
    winger: "Ponta", insideForward: "Ponta invertido", wideMidfielder: "Meia pela ponta", targetMan: "Centroavante de referência",
    poacher: "Finalizador", falseNine: "Falso 9", infiltratingForward: "Atacante infiltrador",
  },
  attrNames: {
    pace: "Velocidade", stamina: "Fôlego", strength: "Força", agility: "Agilidade",
    decisions: "Decisão", composure: "Frieza", workRate: "Empenho", teamwork: "Coletividade",
    aggression: "Agressividade", anticipation: "Antecipação", positioning: "Posicionamento", vision: "Visão de jogo",
    passing: "Passe", technique: "Técnica", dribbling: "Drible", finishing: "Finalização",
    shotPower: "Força do chute", tackling: "Desarme", marking: "Marcação", crossing: "Cruzamento",
    reflexes: "Reflexos", handling: "Encaixe", gkPositioning: "Posicionamento (GOL)", oneOnOnes: "Mano a mano",
  },
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
  matchInProgress: "Partida em andamento",
  matchInProgressHint: "A partida está em andamento — isto fica travado até o fim do jogo.",
  penaltyKick: "Pênalti",
  pkScored: "Convertido",
  pkSaved: "Defendido",
  pkPost: "Na trave",
  pkWide: "Para fora",
  pkReplay: "Rever",
  editTactics: "Ajustar tática",
  simulatingToEnd: "Simulando…",
  fullTime: "Fim de jogo",
  manOfTheMatch: "Melhor da partida",
  changeShirtNumber: "Alterar número da camisa",
  shirtNumber: "Número da camisa",
  shirtTakenBy: "{name} usa esse número — vocês vão trocar.",
  resultWin: "Vitória",
  resultDraw: "Empate",
  resultLoss: "Derrota",
  results: "Resultados",
  fixtures: "Próximos jogos",
  round: "Rodada",
  noResultsYet: "Nenhuma partida disputada ainda",
  seasonFinished: "Todas as rodadas já foram disputadas",
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
  matchTactics: "Tática na partida",
  injuryForcesChange: "{name} se machucou e não tem condições de seguir. Faça a substituição ou jogue com um a menos.",
  playOnShort: "Seguir com um a menos",
  injuredMark: "Lesionado",
  today: "Hoje",
  matchTacticsHint: "Toque em dois jogadores para trocá-los, ou num reserva para colocá-lo em campo.",
  resumeMatch: "Voltar ao jogo",
  subsLeft: "Substituições",
  swapPlayers: "Trocar",
  onPitch: "Em campo",
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
  knowledge: "Conhec.",
  scoutSlots: "{used} de {total} olheiros em campo",
  underObservation: "Em observação",
  daysLeft: "faltam {n}d",
  scoutAtCapacity: "Todos os seus olheiros já estão ocupados",
  scoutAlreadyWatching: "Já está sendo observado",
  scoutFullyKnown: "Você já sabe tudo que um olheiro consegue dizer",
  scoutOwnPlayer: "É seu jogador — você já o conhece",
  stageOffered: "Aguardando resposta",
  stageCountered: "Contraproposta",
  stageFeeAgreed: "Valor acertado",
  stagePersonalTerms: "Termos pessoais",
  stageExpired: "Expirou",
  reasonBelowValuation: "Eles avaliam o jogador bem acima da sua proposta.",
  reasonKeyPlayer: "Ele é peça central do time — não querem nem conversar.",
  reasonSquadTooThin: "Não podem vender: ficariam desfalcados na posição.",
  reasonAlreadyRefused: "Já recusaram essa conversa.",
  roundBid: "proposta",
  roundAsk: "pedem",
  counterAction: "Contrapropor",
  askForAction: "Pedir valor",
  askContext: "Eles ofereceram {theirs}. Diga por quanto sai.",
  withdrawAction: "Retirar",
  acceptAsking: "Aceitar {fee}",
  counterContext: "Você ofereceu {ours}; eles pedem {theirs}.",
  heWants: "Ele pede {wage} por {years} anos.",
  heHoldsOut: "Ele recusou — não assina por menos de {wage}.",
  offerInsulting: "Ele se sentiu desrespeitado. Volte com algo sério.",
  matchDemands: "Aceitar exigências",
  contractRunsOut: "O contrato dele acaba em {n} dias.",
  expiringTab: "Vencendo",
  noExpiring: "Nenhum contrato perto do fim.",
  viewProfile: "Ver perfil",
  actionsLabel: "Ações",
  allFilter: "Todos",
  expiringCount: "{n} vencendo",
  developmentTitle: "Evolução",
  noHistory: "Ainda não há temporadas registradas.",
  attributesUnknown: "Mande um olheiro para saber alguma coisa sobre este jogador.",
  attrGroupPhysical: "Físico",
  attrGroupMental: "Mental",
  attrGroupTechnical: "Técnico",
  attrGroupGoalkeeping: "Goleiro",
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

/**
 * The catalog keys whose value is a plain string.
 *
 * A few entries (`positionShort`, `positionNames`, `roleNames`) are records
 * keyed by a domain enum, so `keyof UIStrings` is not safe to index with when
 * the result goes straight into JSX — `t[someKey]` would be typed as
 * `string | Record<…>` and React cannot render the record half. Anything that
 * takes a key as a PARAMETER should take this instead.
 */
export type UIStringKey = { [K in keyof UIStrings]: UIStrings[K] extends string ? K : never }[keyof UIStrings];
