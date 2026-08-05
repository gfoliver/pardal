import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Shield, Trash2, User } from "lucide-react";
import { InboxMessageType, type InboxMessage, type NegotiationView } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Sheet, SheetContent, SheetTitle } from "../../components/ui/sheet";
import { FilterBar, runQuery, useGridState, type FieldSpec } from "../../components/data";
import { hasDecision, NegotiationActions } from "../../components/career/NegotiationActions";
import { NegotiationThread } from "../../components/career/NegotiationThread";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useFormat } from "../../lib/format";
import { cn } from "../../lib/utils";
import type { ScreenId } from "../../layout/Shell";
import { inboxCategory, renderInbox } from "./inbox-format";

/** A message with its rendered text, so searching and reading use the same words. */
interface Mail {
  readonly msg: InboxMessage;
  readonly subject: string;
  readonly from: string;
  readonly body: string;
}

/** The ids a message can name, in the order they should be offered as links. */
const ID_PARAMS = ["playerId", "clubId", "fromClubId", "toClubId", "opponentId"] as const;

/** Something a message named that has a screen of its own. */
interface MailLink {
  readonly key: string;
  readonly screen: ScreenId;
  readonly id: string;
  readonly label: string;
  readonly player: boolean;
}

export function Inbox({ onNavigate }: { onNavigate: (s: ScreenId, param?: string) => void }) {
  const { t, locale } = useApp();
  const { career, dispatch } = useCareer();
  const fmt = useFormat();
  const [selected, setSelected] = useState<string | null>(null);
  /** Below `lg` the reading pane stops sitting beside the list — which is exactly where it stops working. */
  const narrow = !useMediaQuery("(min-width: 1024px)");

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
        label: t.mailCategory,
        kind: "enum",
        // Filtered by CATEGORY, not by message type. Twenty-four options, each a capitalised enum name
        // in English, was a filter nobody could use; six translated ones are the questions a manager
        // actually asks of a mailbox. See `inboxCategory` for why this cannot go stale.
        value: (m) => inboxCategory(m.msg.type),
        options: (all) => {
          const seen = new Set(all.map((m) => inboxCategory(m.msg.type)));
          // Ordered by the words the manager reads, not by the enum underneath.
          return [...seen].map((k) => ({ value: k, label: t[k] })).sort((a, b) => a.label.localeCompare(b.label));
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
  /*
   * Which mail is being read — and the fallback is the difference between the two layouts.
   *
   * Beside the list, an empty pane is dead space, so the newest mail opens by itself. In a sheet the
   * same fallback would throw a modal over the mailbox the moment you arrived, before you had asked for
   * anything. So a narrow screen starts with nothing open.
   */
  const current = shown.find((m) => m.msg.id === selected) ?? (narrow ? null : shown[0]) ?? null;

  const open = (id: string) => {
    setSelected(id);
    const m = snap?.inbox.find((x) => x.id === id);
    if (m && !m.read) dispatch({ type: "readInbox", messageId: id });
  };
  const archive = (id: string) => {
    dispatch({ type: "archiveInbox", messageId: id });
    setSelected(null);
  };

  /*
   * The deal this message is about, if it is still live.
   *
   * Read fresh on every render rather than memoised: accepting a bid from inside this screen changes
   * the answer immediately, and a memo keyed on the snapshot would leave the buttons on screen for a
   * negotiation that no longer exists.
   *
   * Matched by PLAYER, because a message does not carry a negotiation id — and by player is also how a
   * manager thinks about it ("the bid for Gabriel"). A deal that has since lapsed simply is not found,
   * which is the correct outcome: the mail becomes a record of something that happened.
   */
  const currentPlayerId = typeof current?.msg.params.playerId === "string" ? current.msg.params.playerId : undefined;
  const deal = currentPlayerId
    ? [...career.pendingOffers(), ...career.myOffers()].find((n) => n.playerId === currentPlayerId)
    : undefined;
  /** Fee agreed: the decision left is a contract, not a fee, and the personal-terms card owns it. */
  const needsTerms = deal?.stage === "feeAgreed";

  /**
   * Everything this message names that has a screen of its own.
   *
   * The mailbox is where a manager first hears a name, and until now hearing it was all he could do:
   * "an offer from Palmeiras for Gabriel" with no way to look at either. Ids are read from the same
   * `params` the body is rendered from, so a link can never point at someone the message does not
   * mention.
   *
   * Gated on `hasPlayer`/`hasClub` rather than on the NAME, because every name accessor falls back to
   * the id — a check for a non-empty name always passes, and the failure it was meant to catch would
   * have shipped a button labelled "t3-p07".
   */
  const links: MailLink[] = current
    ? ID_PARAMS.flatMap<MailLink>((key) => {
        const id = current.msg.params[key];
        if (typeof id !== "string" || id === "") return [];
        if (key === "playerId") {
          return career.hasPlayer(id)
            ? [{ key, screen: "player", id, label: career.playerName(id), player: true }]
            : [];
        }
        return career.hasClub(id) ? [{ key, screen: "club", id, label: career.clubName(id), player: false }] : [];
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.inbox}</h1>
        <p className="text-sm text-fg-muted">{career.unreadCount()} {t.unread}</p>
      </div>

      {/* The query layer without the grid: a mailbox is a list with a reading pane, and no columns to
          pick, but "find the mail about this player" is the same problem every other screen has. */}
      <FilterBar specs={specs} rows={mails} state={state} shown={shown.length} total={mails.length} columns={false} />

      {/*
        `grid-cols-1` is load-bearing, not decoration.

        Without a base track this grid fell back to ONE IMPLICIT `auto` column, whose minimum is its
        item's min-content width — and the item is a `Card`, which has no overflow of its own, so a
        single long subject sized the track to 604px inside a 288px container and the whole screen
        scrolled sideways. Measured at 320px. The `lg:` template was already written as `minmax(0,…)`
        for exactly this reason; the mobile track had simply never been stated. Tailwind's
        `grid-cols-1` is `repeat(1, minmax(0, 1fr))`, so it caps the track at the container.

        `truncate` on the row does NOT prevent this: `white-space: nowrap` makes the text's min-content
        width its FULL width, which is the number that propagates up.
      */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)]">
        <Card>
          {/*
            `overflow-x-hidden` is STATED, not left to the default.

            CSS forces a `visible` axis to `auto` when the other is `auto`, so `overflow-y-auto` on its
            own made this list horizontally scrollable — which is what the manager hit on a phone. A row
            that runs long now truncates, which is what the `truncate` on each of its lines was for.
          */}
          <CardContent
            className={cn("overflow-y-auto overflow-x-hidden p-1.5", narrow ? "max-h-[70vh]" : "max-h-[64vh]")}
          >
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
                    {/* Numeric here: the spelled-out month spent a third of the row on the one field
                        nobody scans a mailbox by. The full date is in the mail itself. */}
                    <span className="shrink-0 text-2xs tabular-nums text-fg-faint">
                      {fmt.civil(career.civilDate(m.date), { style: "numeric" })}
                    </span>
                  </div>
                  <span className="truncate pl-3.5 text-xs text-fg-faint">{from}</span>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* The reading pane, beside the list. Below `lg` it used to drop BELOW the list, which is what
            the manager objected to: on a phone, tapping a subject scrolled nothing into view and the
            mail you had just opened was off the bottom of the screen. There it is a sheet instead. */}
        {!narrow && (
          <Card>
            <CardContent className="py-5">
              {current ? (
                <MailView
                  mail={current}
                  deal={deal}
                  needsTerms={needsTerms}
                  links={links}
                  onNavigate={onNavigate}
                  onArchive={archive}
                  heading={<h2 className="text-lg font-semibold text-fg">{current.subject}</h2>}
                />
              ) : (
                <p className="grid place-items-center py-16 text-sm text-fg-muted">{t.noMessages}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/*
        Same content, opened over the list rather than under it.

        Nothing is pre-selected on a narrow screen — see `current` — so arriving at the mailbox shows the
        mailbox, not a modal. The subject is the sheet's title rather than a heading inside it, because a
        dialog that announces itself as something other than what it contains is a dialog a screen reader
        cannot introduce.
      */}
      {narrow && (
        <Sheet open={current !== null} onOpenChange={(o) => !o && setSelected(null)}>
          <SheetContent side="bottom" className="flex max-h-[85vh] flex-col p-4">
            {current && (
              <MailView
                mail={current}
                deal={deal}
                needsTerms={needsTerms}
                links={links}
                onNavigate={onNavigate}
                onArchive={archive}
                inSheet
                // `pr-11` clears the close button: it sits 6px from the edge and is 36px wide, so
                // anything less than 42px of padding lets a long subject run under it.
                heading={<SheetTitle className="pr-11 text-base">{current.subject}</SheetTitle>}
              />
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

/**
 * One mail, read. Drawn identically in the desktop pane and the phone sheet — the only difference is
 * which element carries the subject, which the caller supplies.
 */
function MailView({ mail, deal, needsTerms, links, heading, inSheet = false, onNavigate, onArchive }: {
  mail: Mail;
  deal?: NegotiationView;
  needsTerms: boolean;
  links: readonly MailLink[];
  /** The subject, as an `h2` in a card or a `SheetTitle` in a sheet. */
  heading: ReactNode;
  /**
   * Drawn inside the phone sheet rather than the desktop pane.
   *
   * One flag, because the two differences always move together: the body needs its own scroll area (the
   * sheet's height is capped at 85vh), and archiving has to move out of the top-right corner — that is
   * where the sheet's own close button is, and the two overlapped. Putting "delete" under the thumb
   * reaching for "dismiss" is how a mail gets archived by accident, so at the bottom it becomes a
   * labelled button rather than a bare icon.
   */
  inSheet?: boolean;
  onNavigate: (s: ScreenId, param?: string) => void;
  onArchive: (id: string) => void;
}) {
  const { t } = useApp();
  const { career } = useCareer();
  const fmt = useFormat();
  if (!career) return null;

  return (
    <div className={cn("flex flex-col gap-3", inSheet && "min-h-0 flex-1")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {heading}
          <p className="text-xs text-fg-faint">
            {mail.from} · {fmt.civil(career.civilDate(mail.msg.date), { style: "long" })}
          </p>
        </div>
        {!inSheet && (
          <Button size="icon-sm" variant="ghost" aria-label={t.archive} onClick={() => onArchive(mail.msg.id)}>
            <Trash2 />
          </Button>
        )}
      </div>

      <div className={cn("flex flex-col gap-3", inSheet && "min-h-0 flex-1 overflow-y-auto")}>
        <p className="whitespace-pre-line text-sm leading-relaxed text-fg-muted">{mail.body}</p>

        {/*
          The decision, taken here.

          This screen's whole job is to say a decision is waiting; sending the manager to another tab to
          take it made the mailbox a notice board. The thread and its verbs are the SAME components
          Transfers draws, so accepting a bid from the mail and accepting it from the transfer list are
          one behaviour rather than two that agree for now.
        */}
        {deal && hasDecision(deal) && (
          <NegotiationThread n={deal} onNavigate={onNavigate} actions={<NegotiationActions n={deal} />} />
        )}

        {/* Fee agreed. Not answerable with a number, so this points at the card that owns it rather than
            growing a second personal-terms form here. */}
        {needsTerms && (
          <Button variant="secondary" size="sm" className="gap-1.5 self-start" onClick={() => onNavigate("transfers")}>
            {t.personalTerms}
            <ArrowRight className="size-3.5" />
          </Button>
        )}

        {links.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-hairline pt-2.5">
            {links.map((l) => (
              <Button
                key={l.key}
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => onNavigate(l.screen, l.id)}
                title={l.player ? t.viewProfile : l.label}
              >
                {l.player ? <User className="size-3.5" /> : <Shield className="size-3.5" />}
                <span className="max-w-[12rem] truncate">{l.label}</span>
              </Button>
            ))}
          </div>
        )}

        {/* Last, and named. In the desktop pane this is the icon beside the subject; here that corner
            belongs to the sheet's close button, so it moves to the end of what you were reading —
            where reaching it is a decision rather than a mis-tap. */}
        {inSheet && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 gap-1.5 self-start text-fg-muted"
            onClick={() => onArchive(mail.msg.id)}
          >
            <Trash2 className="size-3.5" />
            {t.archive}
          </Button>
        )}
      </div>
    </div>
  );
}
