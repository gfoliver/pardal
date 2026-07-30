export { SpatialMatch, type SpatialConfig } from "./SpatialMatch.js";
export type { AgentShape, SpatialSnapshot, SpatialPlayerView } from "./types.js";
export { MatchEngine } from "./MatchEngine.js";
export { exp, tanSmall } from "./exp.js";
export { StateHasher } from "./stateHash.js";
export {
  FIELD,
  type SideDir,
  pitchGeometry,
  type PitchGeometry,
  type PitchRect,
  type PitchArc,
} from "./field.js";
export type { Vec2 } from "./math.js";
export {
  conformanceFixture,
  conformanceTrace,
  diffTraces,
  type ConformanceTrace,
  type TraceDivergence,
  type TraceOptions,
  type TraceSample,
} from "./conformance.js";
