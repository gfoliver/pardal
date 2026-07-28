import { useState, type ReactNode } from "react";
import {
  Banknote,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Inbox as InboxIcon,
  LayoutGrid,
  LogOut,
  Moon,
  PanelLeft,
  Search,
  Sun,
  Trophy,
  Users,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import { useApp, useToggleTheme } from "../app/AppProviders";
import { useCareer } from "../app/CareerProvider";
import { Abbrev } from "../components/ui/abbrev";
import { Crest } from "../components/ui/crest";
import { Button } from "../components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { Separator } from "../components/ui/separator";
import { UI_LOCALES, type UIStringKey } from "../i18n/strings";
import { CURRENCIES } from "../lib/currency";
import { cn } from "../lib/utils";

/**
 * The in-game date, sat beside the button that moves it.
 *
 * Day, month and weekday stacked rather than one run-on string: while the
 * calendar is running the day number is the only part that changes, so it wants
 * to be the thing the eye is already on. Pulses while time is advancing, which
 * is the only feedback that days are actually passing.
 *
 * Clicking it opens the calendar — "what day is it" and "what's coming up" are
 * the same question, so the answer to the first should hand you the second.
 */
function CurrentDate({
  c,
  advancing,
  onOpen,
}: {
  c: { year: number; month: number; day: number };
  advancing: boolean;
  onOpen: () => void;
}) {
  const { t, locale } = useApp();
  const l = locale === "pt-BR" ? "pt-BR" : "en-GB";
  const date = new Date(Date.UTC(c.year, c.month - 1, c.day));
  return (
    <button
      onClick={onOpen}
      aria-label={t.calendar}
      className={cn(
        "hidden items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1 outline-none transition-colors sm:flex",
        "hover:border-fg-faint hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring",
        advancing && "border-primary",
      )}
    >
      <CalendarDays className={cn("size-4 shrink-0", advancing ? "text-primary" : "text-fg-faint")} />
      <div className="flex flex-col leading-none">
        <span className="text-sm font-bold tabular-nums text-fg">
          {date.toLocaleDateString(l, { day: "2-digit", month: "short", timeZone: "UTC" })}
        </span>
        <span className="text-2xs uppercase tracking-caps text-fg-faint">
          {date.toLocaleDateString(l, { weekday: "short", timeZone: "UTC" })} · {c.year}
        </span>
      </div>
    </button>
  );
}

export type ScreenId =
  | "home"
  | "calendar"
  | "squad"
  | "tactics"
  | "league"
  | "inbox"
  | "transfers"
  | "scouting"
  | "finances"
  | "player"
  | "club"
  | "match";

const NAV: { id: ScreenId; icon: LucideIcon; key: UIStringKey }[] = [
  { id: "home", icon: LayoutGrid, key: "dashboard" },
  { id: "calendar", icon: CalendarDays, key: "calendar" },
  { id: "squad", icon: Users, key: "squad" },
  { id: "tactics", icon: ClipboardList, key: "tactics" },
  { id: "league", icon: Trophy, key: "league" },
  { id: "inbox", icon: InboxIcon, key: "inbox" },
  { id: "transfers", icon: ArrowLeftRight, key: "transfers" },
  { id: "scouting", icon: Search, key: "scouting" },
  { id: "finances", icon: Banknote, key: "finances" },
];

export function Shell({
  screen,
  onNavigate,
  children,
}: {
  screen: ScreenId;
  onNavigate: (s: ScreenId, param?: string) => void;
  children: ReactNode;
}) {
  const { t, theme, locale, setLocale, currency, setCurrency } = useApp();
  const { career, continueTime, stopTime, advancing, playUserFixture, rolloverSeason, leaveToStart } = useCareer();
  const toggleTheme = useToggleTheme();
  const stop = career?.peekNextStop() ?? "seasonEnd";
  const pendingOffers = career?.pendingOffers().length ?? 0;
  const [collapsed, setCollapsed] = useState(false);

  const snap = career?.snapshot();
  const club = snap ? snap.clubs[snap.managedClubId] : undefined;
  const next = career?.nextUserFixture() ?? null;
  const unread = career?.unreadCount() ?? 0;

  return (
    <div className={cn("grid h-full", collapsed ? "grid-cols-[64px_1fr]" : "grid-cols-[248px_1fr]")}>
      <aside className="flex flex-col gap-6 overflow-hidden border-r border-hairline bg-elevated px-3 py-4">
        <div className="flex items-center gap-2.5 px-1">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-gradient-to-br from-[var(--brand-emerald)] to-[var(--brand-lime)] font-display text-lg font-bold text-[#04140e]">
            O
          </span>
          {!collapsed && (
            <span className="serif text-xl font-semibold tracking-tight">
              Onz<b className="italic text-primary">e</b>
            </span>
          )}
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ id, icon: Icon, key }) => {
            const active = screen === id;
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium outline-none transition-colors",
                  active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-[var(--brand-emerald)] to-[var(--brand-lime)]" />}
                <Icon className={cn("size-[18px] shrink-0", active && "text-primary")} />
                {!collapsed && <span className="flex-1 text-left">{t[key]}</span>}
                {!collapsed && id === "inbox" && unread > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-2xs font-bold text-primary-foreground tabular-nums">{unread}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Leaving the save lives down here with the other chrome, not up in
            the header among the things you press every day. */}
        <button
          onClick={leaveToStart}
          className="mt-auto flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-fg-faint outline-none transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label={t.newCareer}
        >
          <LogOut className="size-[18px] shrink-0" />
          {!collapsed && <span>{t.newCareer}</span>}
        </button>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-fg-faint outline-none transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="Toggle sidebar"
          aria-expanded={!collapsed}
        >
          <PanelLeft className={cn("size-[18px] shrink-0 transition-transform", collapsed && "rotate-180")} />
          {!collapsed && <span>{t.collapse}</span>}
        </button>
      </aside>

      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-hairline bg-bg/80 px-6 backdrop-blur">
          <div className="flex items-center gap-2.5">
            {club?.crest ? (
              <Crest src={club.crest} code={club.shortName} size={28} />
            ) : (
              <span className="grid size-7 place-items-center rounded-sm bg-surface-3 font-display text-xs font-bold text-primary">
                {club?.shortName[0] ?? "?"}
              </span>
            )}
            <span className="text-sm font-semibold">{club?.name ?? "—"}</span>
          </div>

          {next && (
            <>
              <Separator orientation="vertical" className="h-6" />
              <div className="hidden items-center gap-2 text-xs text-fg-muted sm:flex">
                <Crest src={snap?.clubs[next.fixture.homeTeamId]?.crest} code={snap?.clubs[next.fixture.homeTeamId]?.shortName} size={18} />
                <span className="tabular-nums font-semibold text-fg">{snap?.clubs[next.fixture.homeTeamId]?.shortName}</span>
                <span className="text-fg-faint">vs</span>
                <span className="tabular-nums font-semibold text-fg">{snap?.clubs[next.fixture.awayTeamId]?.shortName}</span>
                <Crest src={snap?.clubs[next.fixture.awayTeamId]?.crest} code={snap?.clubs[next.fixture.awayTeamId]?.shortName} size={18} />
              </div>
            </>
          )}

          <div className="ml-auto flex items-center gap-2.5">
            <ToggleGroup type="single" value={locale} onValueChange={(v) => v && setLocale(v as typeof locale)} aria-label={t.language}>
              {UI_LOCALES.map((l) => (
                <ToggleGroupItem key={l.id} value={l.id}>
                  {l.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ToggleGroup type="single" value={currency} onValueChange={(v) => v && setCurrency(v as typeof currency)} aria-label={t.currency}>
              {CURRENCIES.map((c) => (
                <ToggleGroupItem key={c.id} value={c.id}>
                  {c.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={t.theme}>
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
            {/* The date sits with the button that moves it, so the manager sees
                what he's spending when he advances. */}
            {career && <CurrentDate c={career.civilDate()} advancing={advancing} onOpen={() => onNavigate("calendar")} />}
            {/* Offers no longer block the calendar, so this is a nudge rather
                than a gate — the match button still wins when there's a game. */}
            {stop !== "userMatch" && pendingOffers > 0 ? (
              <Button variant="primary" onClick={() => onNavigate("transfers")}>
                {t.transfers} ({pendingOffers})
                <ChevronRight />
              </Button>
            ) : stop === "userMatch" ? (
              <Button variant="primary" onClick={() => { playUserFixture(); onNavigate("match"); }}>
                {t.play}
                <ChevronRight />
              </Button>
            ) : stop === "seasonEnd" ? (
              <Button variant="primary" onClick={rolloverSeason}>
                {t.seasonComplete}
                <ChevronRight />
              </Button>
            ) : (
              <Button variant="primary" onClick={advancing ? stopTime : continueTime}>
                {advancing ? "⏸" : t.advance}
                <ChevronRight />
              </Button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-8">
          {/* No width cap: collapsing the sidebar should hand its space to the
              content, not widen the margins around a fixed-width column. */}
          <div className="animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
