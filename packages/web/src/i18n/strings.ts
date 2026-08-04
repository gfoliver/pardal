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
  datasetGone: string;
  loadingDataset: string;
  loadingCareer: string;
  startingCareer: string;
  careerLoadFailed: string;
  datasetLoadFailed: string;
  tryAgain: string;
  freeAgentsTab: string;
  emptyFreeAgents: string;
  wantsWage: string;
  wontConsiderBelow: string;
  yourOffer: string;
  oneRival: string;
  manyRivals: string;
  decidesIn: string;
  offerTerms: string;
  raiseOffer: string;
  withdraw: string;
  offerPlaced: string;
  cannotAffordWage: string;
  chooseLeague: string;
  clubOne: string;
  clubOther: string;
  deleteSave: string;
  noSaves: string;
  noSavesHint: string;
  takeOver: string;
  startingXi: string;
  pickAClub: string;
  seasonBudgetHint: string;
  squadStrength: string;
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
  /** Other positions a player is natural in (no out-of-position penalty). */
  alsoPlays: string;
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
  nationality: string;
  otherPositions: string;
  /** The line a player belongs to — GK/DEF/MID/ATT. Distinct from his exact position. */
  positionLine: string;
  /** "3 of 30 observed" — how much of a rival's squad we can actually rate. */
  observedOf: string;
  archive: string;
  overviewTab: string;
  squadTab: string;
  /** Column headers on the free-agent list. Short forms of `decidesIn` / `oneRival`. */
  decidesInLabel: string;
  rivalsLabel: string;
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
  /** Bring a substitute on for the selected player. */
  substitute: string;
  confirmSubBody: string;
  confirmSubCost: string;
  confirmPlayOnBody: string;
  confirmDeleteTacticBody: string;
  confirmDeleteSaveTitle: string;
  confirmDeleteSaveBody: string;
  deleteAction: string;
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
  observationRunsOn: string;
  stopWatching: string;
  daysLeft: string;
  scoutAlreadyWatching: string;
  scoutFullyKnown: string;
  scoutOwnPlayer: string;
  // the observation queue
  scoutQueueAction: string;
  scoutQueueHint: string;
  scoutAlreadyQueued: string;
  scoutQueueTitle: string;
  scoutQueueEmptyHint: string;
  removeFromQueue: string;
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
  // data grid — the shared query layer every list is built on
  searchAll: string;
  searchEverything: string;
  mySquadGroup: string;
  playersGroup: string;
  clubsGroup: string;
  filtersLabel: string;
  columnsLabel: string;
  addFilter: string;
  clearFilters: string;
  resetLayout: string;
  viewsLabel: string;
  saveView: string;
  deleteView: string;
  viewNamePlaceholder: string;
  noSavedViews: string;
  compareLabel: string;
  compareTitle: string;
  selectedCount: string;
  selectionCap: string;
  clearSelection: string;
  // mailbox categories — see `inboxCategory`; `transfers`, `squad` and `scouting` are reused
  mailCategory: string;
  mailContracts: string;
  mailBoard: string;
  mailWindow: string;
  mailMatches: string;
  rangeFrom: string;
  rangeTo: string;
  noMatches: string;
  noMatchesHint: string;
  rowCount: string;
  rowCountFiltered: string;
  inMillions: string;
  inYears: string;
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
  // Transfer list
  listedTab: string;
  listForTransfer: string;
  unlistPlayer: string;
  unlistedPlayer: string;
  changeAskingPrice: string;
  askingPrice: string;
  askingPriceHint: string;
  listedBadge: string;
  listedFor: string;
  emptyListed: string;
  bidOnTable: string;
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
  // Why a bid could not be lodged. "Couldn't lodge offer" alone told the manager nothing
  // about whether to bid again, sell first, or give up.
  offerNotForSale: string;
  offerAlreadyBidding: string;
  offerOverBudget: string;
  offerNoFee: string;
  noValuationYet: string;
  askingFor: string;
  settledOffers: string;
  playerSigns: string;
  playerHoldsOut: string;
  statusPending: string;
  statusAccepted: string;
  statusRejected: string;
  statusSigned: string;
  statusWithdrawn: string;
  // finances — one annual pot, spent on fees and wages
  annualBudget: string;
  budgetHint: string;
  availableForTransfers: string;
  availableForWages: string;
  wageRoomHint: string;
  promisedInBids: string;
  committedOf: string;
  overBudget: string;
  financialSummary: string;
  salesIncome: string;
  payrollForSeason: string;
  monthsOfWages: string;
  feesSpent: string;
  remaining: string;
  transferBudget: string;
  wageBill: string;
  topEarners: string;
  ofWageBill: string;
  perMonth: string;
  // player detail
  back: string;
  help: string;
  development: string;
  currentAbility: string;
  contractUntil: string;
  // Compact duration units, for table columns where a sentence will not fit.
  yearsShort: string;
  monthsShort: string;
  daysShort: string;
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
  /** Stands in for a figure we genuinely do not have — never for one we have and are hiding. */
  unknownShort: string;
  personality: string;
  injuredLabel: string;
  no: string;
  statistics: string;
  games: string;
  goals: string;
  assists: string;
  average: string;
  matchLog: string;
  matchDate: string;
  venue: string;
  outcome: string;
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
  goalDifference: string;
  played: string;
  pointsPerGame: string;
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
  datasetGone: "dataset no longer available",
  loadingDataset: "Loading squads…",
  loadingCareer: "Opening your career…",
  startingCareer: "Building the squads…",
  careerLoadFailed: "That career would not open. Check your connection and try again.",
  datasetLoadFailed: "Could not load the squads.",
  tryAgain: "Try again",
  freeAgentsTab: "Free agents",
  emptyFreeAgents: "Nobody is out of contract right now.",
  wantsWage: "Wants",
  wontConsiderBelow: "Won't consider less than {wage} a month.",
  yourOffer: "You: {wage}",
  oneRival: "1 other club in",
  manyRivals: "{n} other clubs in",
  decidesIn: "decides in {n}d",
  offerTerms: "Offer terms",
  raiseOffer: "Raise offer",
  withdraw: "Withdraw",
  offerPlaced: "Terms put to {name} — he'll weigh up the offers before deciding.",
  cannotAffordWage: "We haven't the wage room for that.",
  chooseLeague: "Choose a league",
  clubOne: "1 club",
  clubOther: "{n} clubs",
  deleteSave: "Delete career",
  noSaves: "No careers yet",
  noSavesHint: "Start one below — it saves itself as you play.",
  takeOver: "Take over {club}",
  startingXi: "Starting XI",
  pickAClub: "Pick a club to see what you would inherit.",
  seasonBudgetHint: "fees and wages both come out of this",
  squadStrength: "Squad strength",
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
  alsoPlays: "Also plays",
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
  squadOut: "Squad",
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
  nationality: "Nat",
  otherPositions: "Also",
  positionLine: "Line",
  observedOf: "{n} of {total} observed",
  archive: "Archive",
  overviewTab: "Overview",
  squadTab: "Squad",
  decidesInLabel: "Decides",
  rivalsLabel: "Rivals",
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
  substitute: "Substitute",
  confirmSubBody: "{out} comes off, {in} comes on.",
  confirmSubCost: "This cannot be undone, and spends one of your {n} remaining changes.",
  confirmPlayOnBody: "{name} stays off and you finish the match a man short. There is no going back on this.",
  confirmDeleteTacticBody: "\"{name}\" is deleted for good, with its shape, roles and instructions.",
  confirmDeleteSaveTitle: "Delete this career?",
  confirmDeleteSaveBody: "{name} — {date}. Every season, transfer and result in this save is erased, and it cannot be recovered.",
  deleteAction: "Delete",
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
  goalDifference: "GD",
  played: "Played",
  pointsPerGame: "PPG",
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
  observationRunsOn: "A scout keeps filing reports up to 90%. Stop him to free the slot.",
  stopWatching: "Stop watching",
  daysLeft: "{n}d left",
  scoutAlreadyWatching: "Already under observation",
  scoutFullyKnown: "You know all a scout can tell you",
  scoutOwnPlayer: "He's your player — you know him already",
  scoutQueueAction: "Queue",
  scoutQueueHint: "Every scout is out. He starts as soon as one is free.",
  scoutAlreadyQueued: "Already in the line",
  scoutQueueTitle: "Next in line",
  scoutQueueEmptyHint: "Picked up in this order as scouts come free.",
  removeFromQueue: "Take out of the line",
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
  contractRunsOut: "His contract runs out in {n}.",
  expiringTab: "Expiring",
  noExpiring: "No contracts running out soon.",
  viewProfile: "View profile",
  actionsLabel: "Actions",
  allFilter: "All",
  searchAll: "Search anything…",
  searchEverything: "Search players and clubs",
  mySquadGroup: "My squad",
  playersGroup: "Players",
  clubsGroup: "Clubs",
  filtersLabel: "Filters",
  columnsLabel: "Columns",
  addFilter: "Add a filter",
  clearFilters: "Clear",
  resetLayout: "Reset layout",
  viewsLabel: "Views",
  saveView: "Save",
  deleteView: "Delete view",
  viewNamePlaceholder: "Name this view…",
  noSavedViews: "No saved views yet. Filter the list, then name it.",
  compareLabel: "Compare",
  compareTitle: "Side by side",
  selectedCount: "{n} picked",
  selectionCap: "(max {n})",
  clearSelection: "Clear",
  mailCategory: "Category",
  mailContracts: "Contracts",
  mailBoard: "Board",
  mailWindow: "Transfer window",
  mailMatches: "Matches",
  rangeFrom: "from",
  rangeTo: "to",
  noMatches: "Nothing matches",
  noMatchesHint: "Loosen a filter or clear the search.",
  rowCount: "{n} rows",
  rowCountFiltered: "{n} of {total}",
  inMillions: "millions",
  inYears: "years",
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
  // Short on purpose: it shares a strip with three others on a 375px phone.
  listedTab: "Listed",
  listForTransfer: "List for transfer",
  unlistPlayer: "Take off the list",
  unlistedPlayer: "{name} is off the transfer list.",
  changeAskingPrice: "Change asking price",
  askingPrice: "Asking price",
  askingPriceHint: "He is worth {value}. Ask much more than that and clubs bid their own valuation instead.",
  listedBadge: "Listed",
  listedFor: "Listed {n} days",
  emptyListed: "Nobody is on the transfer list. List a player to have clubs come asking about him.",
  bidOnTable: "Bid: {fee}",
  emptyTargets: "Scout and add players to your shortlist.",
  noOffersMade: "No offers made.",
  noOffersReceived: "No offers received.",
  accept: "Accept",
  reject: "Reject",
  personalTerms: "Personal terms",
  feeAgreedWith: "fee agreed with {club} ({fee})",
  agreeTerms: "Agree terms",
  offerFor: "Offer for {name}",
  valueBalance: "Value {value} · Available {balance}",
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
  offerNotForSale: "He isn't at a club you can buy from.",
  offerAlreadyBidding: "You already have a bid in for him. Raise it in My offers instead.",
  offerOverBudget: "More than your budget allows. Sell someone, or bid less.",
  offerNoFee: "Name a fee first.",
  noValuationYet: "Your scouts have no valuation for him yet · Available {balance}",
  askingFor: "Your price for {name}",
  settledOffers: "Closed ({n})",
  playerSigns: "{name} signs!",
  playerHoldsOut: "{name} wants higher wages.",
  statusPending: "Pending",
  statusAccepted: "Accepted",
  statusRejected: "Rejected",
  statusSigned: "Signed",
  statusWithdrawn: "Withdrawn",
  annualBudget: "Annual budget",
  budgetHint: "One budget for the season. Fees and the whole payroll come out of it, and what you sell goes back in.",
  availableForTransfers: "Available for transfers",
  availableForWages: "Room for wages",
  wageRoomHint: "The same money as your transfer budget — a salary commits a year of it.",
  promisedInBids: "{fee} promised in bids still open",
  committedOf: "{committed} committed",
  overBudget: "Committed beyond the budget. The board will not sanction another signing.",
  financialSummary: "Summary",
  salesIncome: "Received from sales",
  payrollForSeason: "Payroll for the season",
  monthsOfWages: "{n} months",
  feesSpent: "Fees paid",
  remaining: "Remaining",
  transferBudget: "Transfer budget",
  wageBill: "Wage bill",
  topEarners: "Top earners",
  ofWageBill: "of wage bill",
  perMonth: "per month",
  back: "Back",
  help: "How this screen works",
  development: "Development",
  currentAbility: "Current ability",
  contractUntil: "Contract until",
  yearsShort: "{n}y",
  monthsShort: "{n}mo",
  daysShort: "{n}d",
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
  unknownShort: "unknown",
  personality: "Personality",
  injuredLabel: "Injured",
  no: "No",
  statistics: "Statistics",
  games: "Games",
  goals: "Goals",
  assists: "Assists",
  average: "Average",
  matchLog: "Match log",
  matchDate: "Date",
  venue: "Venue",
  outcome: "Outcome",
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
  datasetGone: "base de dados indisponível",
  loadingDataset: "Carregando os elencos…",
  loadingCareer: "Abrindo sua carreira…",
  startingCareer: "Montando os elencos…",
  careerLoadFailed: "Não foi possível abrir essa carreira. Verifique a conexão e tente de novo.",
  datasetLoadFailed: "Não foi possível carregar os elencos.",
  tryAgain: "Tentar de novo",
  freeAgentsTab: "Agentes livres",
  emptyFreeAgents: "Ninguém está sem contrato no momento.",
  wantsWage: "Pede",
  wontConsiderBelow: "Não aceita menos de {wage} por mês.",
  yourOffer: "Sua oferta: {wage}",
  oneRival: "mais 1 clube na disputa",
  manyRivals: "mais {n} clubes na disputa",
  decidesIn: "decide em {n}d",
  offerTerms: "Propor contrato",
  raiseOffer: "Melhorar oferta",
  withdraw: "Desistir",
  offerPlaced: "Proposta feita a {name} — ele vai avaliar as ofertas antes de decidir.",
  cannotAffordWage: "Não temos espaço na folha para esse salário.",
  chooseLeague: "Escolha a liga",
  clubOne: "1 clube",
  clubOther: "{n} clubes",
  deleteSave: "Excluir carreira",
  noSaves: "Nenhuma carreira ainda",
  noSavesHint: "Comece uma abaixo — ela se salva sozinha enquanto você joga.",
  takeOver: "Assumir o {club}",
  startingXi: "Onze inicial",
  pickAClub: "Escolha um clube para ver o que você herdaria.",
  seasonBudgetHint: "compras e salários saem daqui",
  squadStrength: "Força do elenco",
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
  alsoPlays: "Também joga",
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
  squadOut: "Elenco",
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
  nationality: "Nac",
  otherPositions: "Tb.",
  positionLine: "Setor",
  observedOf: "{n} de {total} observados",
  archive: "Arquivar",
  overviewTab: "Visão geral",
  squadTab: "Elenco",
  decidesInLabel: "Decide",
  rivalsLabel: "Rivais",
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
  substitute: "Substituir",
  confirmSubBody: "{out} sai, {in} entra.",
  confirmSubCost: "Não há como desfazer, e gasta uma das suas {n} alterações restantes.",
  confirmPlayOnBody: "{name} não volta e você termina a partida com um jogador menos. Não há como voltar atrás.",
  confirmDeleteTacticBody: "\"{name}\" será excluída de vez, com formação, funções e instruções.",
  confirmDeleteSaveTitle: "Excluir esta carreira?",
  confirmDeleteSaveBody: "{name} — {date}. Todas as temporadas, transferências e resultados deste save serão apagados, sem recuperação.",
  deleteAction: "Excluir",
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
  goalDifference: "SG",
  played: "Jogos",
  pointsPerGame: "PPJ",
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
  observationRunsOn: "O olheiro segue enviando relatórios até 90%. Retire-o para liberar a vaga.",
  stopWatching: "Retirar da observação",
  daysLeft: "faltam {n}d",
  scoutAlreadyWatching: "Já está sendo observado",
  scoutFullyKnown: "Você já sabe tudo que um olheiro consegue dizer",
  scoutOwnPlayer: "É seu jogador — você já o conhece",
  scoutQueueAction: "Na fila",
  scoutQueueHint: "Todos os olheiros estão ocupados. Ele entra assim que um liberar.",
  scoutAlreadyQueued: "Já está na fila",
  scoutQueueTitle: "Próximos da fila",
  scoutQueueEmptyHint: "Serão puxados nesta ordem conforme os olheiros liberarem.",
  removeFromQueue: "Tirar da fila",
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
  contractRunsOut: "O contrato dele acaba em {n}.",
  expiringTab: "Vencendo",
  noExpiring: "Nenhum contrato perto do fim.",
  viewProfile: "Ver perfil",
  actionsLabel: "Ações",
  allFilter: "Todos",
  searchAll: "Buscar qualquer coisa…",
  searchEverything: "Buscar jogadores e clubes",
  mySquadGroup: "Meu elenco",
  playersGroup: "Jogadores",
  clubsGroup: "Clubes",
  filtersLabel: "Filtros",
  columnsLabel: "Colunas",
  addFilter: "Adicionar filtro",
  clearFilters: "Limpar",
  resetLayout: "Restaurar padrão",
  viewsLabel: "Visões",
  saveView: "Salvar",
  deleteView: "Excluir visão",
  viewNamePlaceholder: "Dê um nome a esta visão…",
  noSavedViews: "Nenhuma visão salva. Filtre a lista e dê um nome.",
  compareLabel: "Comparar",
  compareTitle: "Lado a lado",
  selectedCount: "{n} selecionados",
  selectionCap: "(máx. {n})",
  clearSelection: "Limpar",
  mailCategory: "Categoria",
  mailContracts: "Contratos",
  mailBoard: "Diretoria",
  mailWindow: "Janela de transferências",
  mailMatches: "Partidas",
  rangeFrom: "de",
  rangeTo: "até",
  noMatches: "Nada corresponde",
  noMatchesHint: "Afrouxe um filtro ou limpe a busca.",
  rowCount: "{n} linhas",
  rowCountFiltered: "{n} de {total}",
  inMillions: "milhões",
  inYears: "anos",
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
  listedTab: "Listados",
  listForTransfer: "Listar para transferência",
  unlistPlayer: "Retirar da lista",
  unlistedPlayer: "{name} saiu da lista de transferências.",
  changeAskingPrice: "Alterar valor pedido",
  askingPrice: "Valor pedido",
  askingPriceHint: "Ele vale {value}. Pedindo muito acima disso, os clubes propõem o que eles acham que ele vale.",
  listedBadge: "Listado",
  listedFor: "Listado há {n} dias",
  emptyListed: "Ninguém está na lista de transferências. Liste um jogador para os clubes virem perguntar por ele.",
  bidOnTable: "Proposta: {fee}",
  emptyTargets: "Observe e adicione jogadores à sua lista.",
  noOffersMade: "Nenhuma proposta feita.",
  noOffersReceived: "Nenhuma proposta recebida.",
  accept: "Aceitar",
  reject: "Recusar",
  personalTerms: "Termos pessoais",
  feeAgreedWith: "acordo com {club} ({fee})",
  agreeTerms: "Acertar termos",
  offerFor: "Proposta por {name}",
  valueBalance: "Valor {value} · Disponível {balance}",
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
  offerNotForSale: "Ele não está em um clube de quem você possa comprar.",
  offerAlreadyBidding: "Você já tem uma proposta por ele. Melhore-a em Minhas propostas.",
  offerOverBudget: "Acima do que o orçamento permite. Venda alguém, ou ofereça menos.",
  offerNoFee: "Informe um valor primeiro.",
  noValuationYet: "Seus olheiros ainda não têm avaliação dele · Disponível {balance}",
  askingFor: "Seu preço por {name}",
  settledOffers: "Encerradas ({n})",
  playerSigns: "{name} assinou!",
  playerHoldsOut: "{name} quer salário maior.",
  statusPending: "Pendente",
  statusAccepted: "Aceita",
  statusRejected: "Recusada",
  statusSigned: "Assinado",
  statusWithdrawn: "Retirada",
  annualBudget: "Orçamento anual",
  budgetHint: "Um orçamento para a temporada. Dele saem as compras e toda a folha salarial; o que você vende volta para ele.",
  availableForTransfers: "Disponível para transferências",
  availableForWages: "Espaço para salários",
  wageRoomHint: "É o mesmo dinheiro do orçamento de transferências — um salário compromete um ano dele.",
  promisedInBids: "{fee} comprometido em propostas em aberto",
  committedOf: "{committed} comprometido",
  overBudget: "Comprometido além do orçamento. A diretoria não aprova outra contratação.",
  financialSummary: "Resumo",
  salesIncome: "Recebido em vendas",
  payrollForSeason: "Folha da temporada",
  monthsOfWages: "{n} meses",
  feesSpent: "Gasto em compras",
  remaining: "Saldo do orçamento",
  transferBudget: "Orçamento de transferências",
  wageBill: "Folha salarial",
  topEarners: "Maiores salários",
  ofWageBill: "da folha",
  perMonth: "por mês",
  back: "Voltar",
  help: "Como esta tela funciona",
  development: "Desenvolvimento",
  currentAbility: "Habilidade atual",
  contractUntil: "Contrato até",
  yearsShort: "{n}a",
  monthsShort: "{n}m",
  daysShort: "{n}d",
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
  unknownShort: "desconhecido",
  personality: "Personalidade",
  injuredLabel: "Lesionado",
  no: "Não",
  statistics: "Estatísticas",
  games: "Jogos",
  goals: "Gols",
  assists: "Assist.",
  average: "Média",
  matchLog: "Histórico de partidas",
  matchDate: "Data",
  venue: "Local",
  outcome: "Resultado",
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
