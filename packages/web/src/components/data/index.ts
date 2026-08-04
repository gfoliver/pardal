/**
 * The query layer: one way to look at a list, shared by every data screen.
 *
 * A screen declares its fields (`FieldSpec`), asks `useGridState` to remember what the manager has
 * done to them, runs `runQuery`, and hands the result to `DataGrid` with a `FilterBar` above it.
 * Nothing about players, clubs or money lives in here — only searching, filtering and ordering.
 */
export { DataGrid } from "./DataGrid";
export { FilterBar } from "./FilterBar";
export { useGridState, type GridState } from "./useGridState";
export { runQuery, sortRows, searchText, extentOf, isIdle, fold } from "./query";
export { EMPTY_QUERY, type EnumOption, type FieldKind, type FieldSpec, type FieldValue, type Filter, type GridQuery, type Sort } from "./types";
