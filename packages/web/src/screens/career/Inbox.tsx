import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { InboxMessageType, type InboxMessage } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { FilterBar, runQuery, useGridState, type FieldSpec } from "../../components/data";
import { useFormat } from "../../lib/format";
import { cap } from "../../lib/labels";
import { cn } from "../../lib/utils";
import { renderInbox } from "./inbox-format";

/** A message with its rendered text, so searching and reading use the same words. */
interface Mail {
  readonly msg: InboxMessage;
  readonly subject: string;
  readonly from: string;
  readonly body: string;
}

export function Inbox() {
  const { t, locale } = useApp();
  const { career, dispatch } = useCareer();
  const fmt = useFormat();
  const [selected, setSelected] = useState<string | null>(null);

  const snap = career?.snapshot();
  /*
   * Rendered once, then searched.
   *
   * The subject and body are BUILT from a message's params — "Bid accepted for X" is not stored
   * anywhere — so searching the raw messages would find nothing a manager can see. Rendering first
   * means a search for a player's name finds the mail that mentions him.
   */
  const mails = useMemo<Mail[]>(() => {
    if (!career || !snap) return [];
    return snap.inbox
      .filter((m) => m.type !== InboxMessageType.MatchResult) // results have their own screen
      .reverse() // newest first
      .map((m) => ({ msg: m, ...renderInbox(m, career, locale) }));
  }, [career, snap, locale]);

  const specs = useMemo<FieldSpec<Mail>[]>(
    () => [
      {
        id: "subject",
        label: t.inbox,
        kind: "text",
        required: true,
        value: (m) => m.subject,
        // The whole mail is searchable, not just its subject — the useful search is a player's or a
        // club's name, and those live in the body.
        search: (m) => `${m.from} ${m.body}`,
      },
      {
        id: "type",
        label: t.filtersLabel,
        kind: "enum",
        value: (m) => m.msg.type,
        // Humanised from the enum rather than translated: the alternative is a dictionary of thirty
        // labels that silently rots as message types are added. Worth revisiting if it grates.
        options: (all) => {
          const seen = new Set(all.map((m) => m.msg.type as string));
          return [...seen].sort().map((v) => ({ value: v, label: cap(v) }));
        },
      },
      {
        id: "unread",
        label: t.unread,
        kind: "bool",
        // "What have I not dealt with" is the question this screen is opened for.
        value: (m) => !m.msg.read,
      },
    ],
    [t],
  );

  const state = useGridState("inbox", specs, { field: "subject", dir: "asc" });
  /*
   * Filtered, but NOT sorted by the grid: newest-first is the order a mailbox has, and letting a
   * stored sort reorder it would be a stored sort nobody asked for. Only the search and the filters
   * apply — hence the query with its sort dropped.
   */
  const shown = useMemo(
    () => runQuery(mails, specs, { ...state.query, sort: null }),
    [mails, specs, state.query],
  );

  if (!career) return null;
  const current = shown.find((m) => m.msg.id === selected) ?? shown[0] ?? null;

  const open = (id: string) => {
    setSelected(id);
    const m = snap?.inbox.find((x) => x.id === id);
    if (m && !m.read) dispatch({ type: "readInbox", messageId: id });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.inbox}</h1>
        <p className="text-sm text-fg-muted">{career.unreadCount()} {t.unread}</p>
      </div>

      {/* The query layer without the grid: a mailbox is a list with a reading pane, and no columns to
          pick, but "find the mail about this player" is the same problem every other screen has. */}
      <FilterBar specs={specs} rows={mails} state={state} shown={shown.length} total={mails.length} columns={false} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)]">
        <Card>
          <CardContent className="max-h-[64vh] overflow-y-auto p-1.5">
            {shown.length === 0 ? (
              <p className="p-6 text-center text-sm text-fg-muted">{state.narrowed ? t.noMatches : t.noMessages}</p>
            ) : (
              shown.map(({ msg: m, subject, from }) => (
                <button
                  key={m.id}
                  onClick={() => open(m.id)}
                  className={cn("flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors", current?.msg.id === m.id ? "bg-surface-2" : "hover:bg-surface-2")}
                >
                  <div className="flex items-center gap-2">
                    {!m.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                    <span className={cn("flex-1 truncate text-sm", m.read ? "text-fg-muted" : "font-semibold text-fg")}>{subject}</span>
                    <span className="shrink-0 text-2xs text-fg-faint tabular-nums">{fmt.civil(career.civilDate(m.date))}</span>
                  </div>
                  <span className="truncate pl-3.5 text-xs text-fg-faint">{from}</span>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-5">
            {current ? (
              // Already rendered for the list and the search, so it is not rendered a second time here.
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-fg">{current.subject}</h2>
                    <p className="text-xs text-fg-faint">{current.from} · {fmt.civil(career.civilDate(current.msg.date), { long: true })}</p>
                  </div>
                  <Button size="icon-sm" variant="ghost" aria-label={t.archive} onClick={() => { dispatch({ type: "archiveInbox", messageId: current.msg.id }); setSelected(null); }}>
                    <Trash2 />
                  </Button>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-fg-muted">{current.body}</p>
              </div>
            ) : (
              <p className="grid place-items-center py-16 text-sm text-fg-muted">{t.noMessages}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
