import { useMemo, useState } from "react";
import { Bookmark, Check, ListFilter, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { useApp } from "../../app/AppProviders";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useFormat } from "../../lib/format";
import { cn } from "../../lib/utils";
import { extentOf, isIdle } from "./query";
import type { EnumOption, FieldSpec, Filter } from "./types";
import type { GridState } from "./useGridState";

/**
 * How the manager narrows a list.
 *
 * One text box that searches EVERYTHING, plus as many field filters as he cares to stack. The
 * ordering on screen is deliberate: search first because it answers most questions in one gesture,
 * then the filters he has set as removable chips, then the menus that add more — filters, columns, and
 * the named views that put all three away under one name. A filter you cannot see is a filter you
 * cannot undo, so nothing narrows this list without leaving a chip.
 */

/** Which filter shape a field takes. `text` fields are searched, not filtered. */
function filterableKind(kind: FieldSpec<unknown>["kind"]): "range" | "enum" | "bool" | null {
  if (kind === "number" || kind === "money" || kind === "days") return "range";
  if (kind === "enum") return "enum";
  if (kind === "bool") return "bool";
  return null;
}

/**
 * Money in millions and contracts in years, because that is how the numbers are said out loud.
 *
 * A manager thinks "under twelve million", not "under 12000000", and typing the zeros is both slow
 * and easy to get wrong by a factor of ten.
 *
 * A `days` field converts only if it declared its own `perYear`. Falling back to 365 would be wrong
 * by 85 days in this game — a season is `totalDays` — so without it the filter stays in days.
 */
function scaleOf<T>(spec: FieldSpec<T>): { factor: number; unitKey: "inMillions" | "inYears" | null; step: number } {
  if (spec.kind === "money") return { factor: 1_000_000, unitKey: "inMillions", step: 0.5 };
  if (spec.kind === "days" && spec.perYear) return { factor: spec.perYear, unitKey: "inYears", step: 0.5 };
  return { factor: 1, unitKey: null, step: 1 };
}

function RangeEditor<T>({ spec, rows, filter, onChange }: {
  spec: FieldSpec<T>;
  rows: readonly T[];
  filter: Extract<Filter, { kind: "range" }> | undefined;
  onChange: (f: Filter) => void;
}) {
  const { t } = useApp();
  const { factor, unitKey, step } = scaleOf(spec);
  const extent = useMemo(() => extentOf(rows, spec), [rows, spec]);

  // Empty string, not 0 — an empty bound means "unbounded", and typing 0 has to stay possible.
  const show = (v: number | undefined) => (v === undefined ? "" : String(Math.round((v / factor) * 100) / 100));
  const parse = (raw: string): number | undefined => {
    if (raw.trim() === "") return undefined;
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) ? n * factor : undefined;
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center gap-1.5 text-xs text-fg-muted">
          {t.rangeFrom}
          <Input
            type="text"
            inputMode="decimal"
            step={step}
            defaultValue={show(filter?.min)}
            // `extent` as the placeholder rather than a prefilled value: it tells the manager what
            // the data actually spans without pretending he set a bound.
            placeholder={extent ? show(extent.min) : undefined}
            onChange={(e) => onChange({ kind: "range", field: spec.id, min: parse(e.target.value), max: filter?.max })}
            className="h-7 min-w-0 flex-1 text-xs tabular-nums"
          />
        </label>
        <label className="flex flex-1 items-center gap-1.5 text-xs text-fg-muted">
          {t.rangeTo}
          <Input
            type="text"
            inputMode="decimal"
            step={step}
            defaultValue={show(filter?.max)}
            placeholder={extent ? show(extent.max) : undefined}
            onChange={(e) => onChange({ kind: "range", field: spec.id, min: filter?.min, max: parse(e.target.value) })}
            className="h-7 min-w-0 flex-1 text-xs tabular-nums"
          />
        </label>
      </div>
      {unitKey && <span className="text-2xs text-fg-faint">{t[unitKey]}</span>}
    </div>
  );
}

/**
 * What an `enum` field can be set to.
 *
 * From the DATA when the field does not supply its own, so a nationality list contains the
 * nationalities actually in the save rather than every country in the world.
 *
 * Shared with the chip on purpose. A chip printing the stored VALUE where the menu printed a label is
 * how "Categoria: mailBoard" reached the screen — the value there is a translation key, and it was
 * only ever readable before because positions and nationalities happen to look like words.
 */
function enumOptions<T>(spec: FieldSpec<T>, rows: readonly T[]): readonly EnumOption[] {
  if (spec.options) return spec.options(rows);
  const seen = new Map<string, string>();
  for (const row of rows) {
    const v = spec.value(row);
    if (typeof v === "string" && v !== "") seen.set(v, v);
  }
  return [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function EnumEditor<T>({ spec, rows, filter, onToggle }: {
  spec: FieldSpec<T>;
  rows: readonly T[];
  filter: Extract<Filter, { kind: "enum" }> | undefined;
  /** ONE value at a time. See `GridState.toggleEnum` for why this is not "here is the new filter". */
  onToggle: (value: string) => void;
}) {
  const options = useMemo(() => enumOptions(spec, rows), [rows, spec]);
  const on = new Set(filter?.values ?? []);

  return (
    <div className="flex flex-col gap-0.5">
      {options.map((o) => (
        // A LABEL, not a button. Radix's Checkbox renders a `<button>`, and a button inside a button
        // is invalid HTML — React says so out loud, and the nested control is unreachable by keyboard.
        // A label forwards its own clicks to the checkbox, which is the behaviour we were faking.
        <label
          key={o.value}
          className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-surface-2"
        >
          <Checkbox checked={on.has(o.value)} onCheckedChange={() => onToggle(o.value)} />
          <span className="truncate">{o.label}</span>
        </label>
      ))}
    </div>
  );
}

/** One active filter, as a chip that says what it does and can be edited or dropped. */
function Chip<T>({ spec, filter, rows, state }: {
  spec: FieldSpec<T>;
  filter: Filter;
  rows: readonly T[];
  state: GridState<T>;
}) {
  const { t } = useApp();
  const label = spec.longLabel ?? spec.label;

  const summary = useMemo(() => {
    if (filter.kind === "bool") return label;
    if (filter.kind === "enum") {
      // Named by the same labels the menu offered, never by the stored value.
      const byValue = new Map(enumOptions(spec, rows).map((o) => [o.value, o.label]));
      // Two named, the rest counted — a chip listing eleven nationalities is not a chip any more.
      const named = filter.values.slice(0, 2).map((v) => byValue.get(v) ?? v).join(", ");
      return `${label}: ${named}${filter.values.length > 2 ? ` +${filter.values.length - 2}` : ""}`;
    }
    const { factor } = scaleOf(spec);
    const n = (v: number) => String(Math.round((v / factor) * 100) / 100);
    if (filter.min !== undefined && filter.max !== undefined) return `${label} ${n(filter.min)}–${n(filter.max)}`;
    if (filter.min !== undefined) return `${label} ≥ ${n(filter.min)}`;
    return `${label} ≤ ${n(filter.max!)}`;
  }, [filter, label, spec, rows]);

  return (
    <span className="inline-flex items-center overflow-hidden rounded-md border border-primary/40 bg-primary-soft text-xs">
      {filter.kind === "bool" ? (
        <span className="px-2 py-1 font-medium text-fg">{summary}</span>
      ) : (
        <Popover>
          <PopoverTrigger className="px-2 py-1 font-medium text-fg outline-none hover:bg-primary/10">
            {summary}
          </PopoverTrigger>
          <PopoverContent>
            <p className="mb-2 text-xs font-semibold text-fg">{label}</p>
            {filter.kind === "range" ? (
              <RangeEditor spec={spec} rows={rows} filter={filter} onChange={state.setFilter} />
            ) : (
              <EnumEditor spec={spec} rows={rows} filter={filter} onToggle={(v) => state.toggleEnum(spec.id, v)} />
            )}
          </PopoverContent>
        </Popover>
      )}
      <button
        type="button"
        aria-label={`${t.clearFilters}: ${label}`}
        onClick={() => state.clearFilter(spec.id)}
        className="grid h-full w-5 place-items-center text-fg-muted hover:bg-primary/10 hover:text-fg"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/** The menu that adds a filter, listing every field that can carry one. */
function AddFilter<T>({ specs, rows, state }: { specs: readonly FieldSpec<T>[]; rows: readonly T[]; state: GridState<T> }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<FieldSpec<T> | null>(null);

  const set = new Set(state.query.filters.map((f) => f.field));
  const available = specs.filter((s) => filterableKind(s.kind) !== null && !set.has(s.id));

  const start = (spec: FieldSpec<T>) => {
    const kind = filterableKind(spec.kind)!;
    // A boolean needs no panel — asking for "injured" is already the whole filter.
    if (kind === "bool") {
      state.setFilter({ kind: "bool", field: spec.id, value: true });
      setOpen(false);
      return;
    }
    // The others open empty and constrain nothing until he types, so the list never blanks mid-edit.
    state.setFilter(kind === "range" ? { kind: "range", field: spec.id } : { kind: "enum", field: spec.id, values: [] });
    setPending(spec);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          // An untouched filter is dropped on close rather than left as a chip doing nothing.
          const idle = state.query.filters.find((f) => f.field === pending?.id && isIdle(f));
          if (idle) state.clearFilter(idle.field);
          setPending(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <ListFilter className="size-3.5" />
          <span className="hidden sm:inline">{t.filtersLabel}</span>
          <Plus className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        {pending ? (
          <>
            <p className="mb-2 text-xs font-semibold text-fg">{pending.longLabel ?? pending.label}</p>
            {filterableKind(pending.kind) === "range" ? (
              <RangeEditor
                spec={pending}
                rows={rows}
                filter={state.query.filters.find((f) => f.field === pending.id && f.kind === "range") as Extract<Filter, { kind: "range" }>}
                onChange={state.setFilter}
              />
            ) : (
              <EnumEditor
                spec={pending}
                rows={rows}
                filter={state.query.filters.find((f) => f.field === pending.id && f.kind === "enum") as Extract<Filter, { kind: "enum" }>}
                onToggle={(v) => state.toggleEnum(pending.id, v)}
              />
            )}
            <Button variant="primary" size="sm" className="mt-3 w-full" onClick={() => setOpen(false)}>
              <Check className="size-3.5" />
            </Button>
          </>
        ) : available.length === 0 ? (
          <p className="text-xs text-fg-muted">{t.filtersLabel}</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {available.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => start(s)}
                className="rounded-sm px-1.5 py-1 text-left text-sm hover:bg-surface-2"
              >
                {s.longLabel ?? s.label}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Which columns are on. Required ones are shown but cannot be switched off. */
function ColumnPicker<T>({ specs, state }: { specs: readonly FieldSpec<T>[]; state: GridState<T> }) {
  const { t } = useApp();
  const on = new Set(state.visibleIds);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <SlidersHorizontal className="size-3.5" />
          <span className="hidden sm:inline">{t.columnsLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-0.5">
          {specs.map((s) => (
            // See `EnumEditor`: a label, because a Radix Checkbox is itself a button.
            <label
              key={s.id}
              className={cn(
                "flex items-center gap-2 rounded-sm px-1 py-1 text-sm",
                s.required ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-surface-2",
              )}
            >
              <Checkbox
                checked={on.has(s.id)}
                disabled={s.required}
                onCheckedChange={() => state.toggleColumn(s.id)}
              />
              <span className="truncate">{s.longLabel ?? s.label}</span>
            </label>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={state.reset}>
          {t.resetLayout}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The manager's named arrangements: pick one, or put a name on the one he is looking at.
 *
 * The trigger shows the ACTIVE view's name rather than a generic label, so the bar answers "what am I
 * looking at" without being opened — and goes back to the label the moment he changes anything, which
 * is the honest way to say "this is no longer that view".
 */
function ViewMenu<T>({ state }: { state: GridState<T> }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const active = state.activeView;

  const save = () => {
    if (name.trim() === "") return;
    state.saveView(name);
    setName("");
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setName("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("gap-1.5", active && "bg-primary-soft text-fg")}>
          <Bookmark className="size-3.5" />
          <span className="hidden max-w-[9rem] truncate sm:inline">{active ?? t.viewsLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        {state.views.length === 0 ? (
          <p className="text-xs text-fg-muted">{t.noSavedViews}</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {state.views.map((v) => (
              <span key={v.name} className="flex items-center overflow-hidden rounded-sm hover:bg-surface-2">
                <button
                  type="button"
                  onClick={() => {
                    state.applyView(v.name);
                    setOpen(false);
                  }}
                  className={cn("min-w-0 flex-1 truncate px-1.5 py-1 text-left text-sm", v.name === active && "font-semibold text-fg")}
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  aria-label={`${t.deleteView}: ${v.name}`}
                  onClick={() => state.deleteView(v.name)}
                  className="grid size-6 shrink-0 place-items-center text-fg-faint hover:text-fg"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center gap-1.5 border-t border-hairline pt-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            // Enter saves, because typing a name and reaching for the mouse is a gesture too many.
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            placeholder={active ?? t.viewNamePlaceholder}
            className="h-7 min-w-0 flex-1 text-xs"
          />
          <Button variant="primary" size="sm" disabled={name.trim() === ""} onClick={save}>
            {t.saveView}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar<T>({ specs, rows, state, shown, total, columns = true, className }: {
  /** ALL declared fields, not just the visible ones — a hidden column is still filterable. */
  specs: readonly FieldSpec<T>[];
  /** The unfiltered rows, so range placeholders and enum options describe the whole set. */
  rows: readonly T[];
  state: GridState<T>;
  shown: number;
  total: number;
  /**
   * Offer the column picker. False for a list that has no columns to pick.
   *
   * Searching and filtering are useful wherever there is a list; a table is only one way to draw one.
   * The inbox is a reading list with a preview pane and wants the query layer without the grid.
   */
  columns?: boolean;
  className?: string;
}) {
  const { t } = useApp();
  const fmt = useFormat();
  const byId = new Map(specs.map((s) => [s.id, s]));
  const chips = state.query.filters.filter((f) => !isIdle(f));

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-faint" />
          <Input
            value={state.query.text}
            onChange={(e) => state.setText(e.target.value)}
            placeholder={t.searchAll}
            className="h-8 pl-8"
          />
        </div>
        <AddFilter specs={specs} rows={rows} state={state} />
        {columns && <ColumnPicker specs={specs} state={state} />}
        <ViewMenu state={state} />
        <span className="ml-auto shrink-0 text-xs tabular-nums text-fg-faint">
          {shown === total ? fmt.t(t.rowCount, { n: total }) : fmt.t(t.rowCountFiltered, { n: shown, total })}
        </span>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((f) => {
            const spec = byId.get(f.field);
            // A stored filter can name a field a later build removed. Skipped, not crashed on.
            return spec ? <Chip key={f.field} spec={spec} filter={f} rows={rows} state={state} /> : null;
          })}
          <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={state.clearAllFilters}>
            {t.clearFilters}
          </Button>
        </div>
      )}
    </div>
  );
}
