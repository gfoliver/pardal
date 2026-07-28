import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Inbox as InboxIcon,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  Moon,
  PanelLeft,
  Radio,
  Search,
  Settings2,
  Sun,
  Trophy,
  Users,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import { useApp, useToggleTheme } from "../app/AppProviders";
import { useCareer } from "../app/CareerProvider";
import { Breadcrumb, type Crumb } from "../components/ui/breadcrumb";
import { Crest } from "../components/ui/crest";
import { LogoMark } from "../components/ui/logo";
import { Button } from "../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "../components/ui/sheet";
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
  disabled,
  onOpen,
}: {
  c: { year: number; month: number; day: number };
  advancing: boolean;
  disabled?: boolean;
  onOpen: () => void;
}) {
  const { t, locale } = useApp();
  const l = locale === "pt-BR" ? "pt-BR" : "en-GB";
  const date = new Date(Date.UTC(c.year, c.month - 1, c.day));
  return (
    <button
      onClick={onOpen}
      disabled={disabled}
      aria-label={t.calendar}
      className={cn(
        "flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2 py-1 outline-none transition-colors",
        "hover:border-fg-faint hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-surface-2",
        advancing && "border-primary",
      )}
    >
      <CalendarDays className={cn("size-4 shrink-0", advancing ? "text-primary" : "text-fg-faint")} />
      <div className="flex flex-col leading-none">
        <span className="text-sm font-bold tabular-nums text-fg">
          {date.toLocaleDateString(l, { day: "2-digit", month: "short", timeZone: "UTC" })}
        </span>
        <span className="hidden text-2xs uppercase tracking-caps text-fg-faint sm:block">
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

/** Which nav entry a detail screen belongs under, for the trail and the active bar. */
const PARENT: Partial<Record<ScreenId, ScreenId>> = {
  player: "squad",
  club: "league",
  match: "calendar",
};

export function Shell({
  screen,
  param,
  onNavigate,
  onBack,
  children,
}: {
  screen: ScreenId;
  /** The detail screens' id (a player, a club) — used to name the last crumb. */
  param?: string;
  onNavigate: (s: ScreenId, param?: string) => void;
  /** Absent when there is nowhere to go back to. */
  onBack?: () => void;
  children: ReactNode;
}) {
  const { t, theme, locale, setLocale, currency, setCurrency } = useApp();
  const { career, continueTime, stopTime, advancing, playUserFixture, rolloverSeason, leaveToStart, matchLive } = useCareer();
  const toggleTheme = useToggleTheme();
  const stop = career?.peekNextStop() ?? "seasonEnd";
  const pendingOffers = career?.pendingOffers().length ?? 0;
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const snap = career?.snapshot();
  const club = snap ? snap.clubs[snap.managedClubId] : undefined;
  const next = career?.nextUserFixture() ?? null;
  const unread = career?.unreadCount() ?? 0;

  // Changing screen closes the drawer — on a phone the panel covers the thing you
  // just asked for, so leaving it open would hide the result of your own tap.
  useEffect(() => setDrawer(false), [screen, param]);

  /** A badge count for a nav entry, or 0 for none. */
  const badgeFor = (id: ScreenId) => (id === "inbox" ? unread : id === "transfers" ? pendingOffers : 0);

  const navList = (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ id, icon: Icon, key }) => {
        const active = screen === id || PARENT[screen] === id;
        const badge = badgeFor(id);
        return (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            disabled={matchLive}
            title={matchLive ? t.matchInProgressHint : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium outline-none transition-colors",
              active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted",
            )}
          >
            {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-[var(--brand-emerald)] to-[var(--brand-lime)]" />}
            <Icon className={cn("size-[18px] shrink-0", active && "text-primary")} />
            {!collapsed && <span className="flex-1 text-left">{t[key]}</span>}
            {/* Collapsed there is no room for a number, but "something is waiting"
                still has to survive — so it degrades to a dot rather than vanishing. */}
            {badge > 0 &&
              (collapsed ? (
                <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />
              ) : (
                <span className="rounded-full bg-primary px-1.5 text-2xs font-bold tabular-nums text-primary-foreground">{badge}</span>
              ))}
          </button>
        );
      })}
    </nav>
  );

  const sidebarFooter = (
    <>
      {/* Leaving the save lives down here with the other chrome, not up in
          the header among the things you press every day. */}
      <button
        onClick={leaveToStart}
        disabled={matchLive}
        title={matchLive ? t.matchInProgressHint : undefined}
        className="mt-auto flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-fg-faint outline-none transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-faint"
        aria-label={t.newCareer}
      >
        <LogOut className="size-[18px] shrink-0" />
        {!collapsed && <span>{t.newCareer}</span>}
      </button>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="hidden h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-fg-faint outline-none transition-colors hover:bg-surface-2 hover:text-fg lg:flex"
        aria-label="Toggle sidebar"
        aria-expanded={!collapsed}
      >
        <PanelLeft className={cn("size-[18px] shrink-0 transition-transform", collapsed && "rotate-180")} />
        {!collapsed && <span>{t.collapse}</span>}
      </button>
    </>
  );

  const brand = (
    <div className="flex items-center gap-2.5 px-1">
      {/* Collapsed, the mark IS the brand — no room for the name beside it. */}
      <LogoMark size={34} />
      {!collapsed && (
        <span className="serif text-xl font-semibold tracking-tight">
          Pard<b className="italic text-primary">al</b>
        </span>
      )}
    </div>
  );

  /** Where you are: the section, then the thing inside it. */
  const trail: Crumb[] = (() => {
    const label = (id: ScreenId) => t[NAV.find((n) => n.id === id)?.key ?? "dashboard"];
    const parent = PARENT[screen];
    const crumbs: Crumb[] = [{ label: t.dashboard, onSelect: screen === "home" ? undefined : () => onNavigate("home") }];
    if (parent) crumbs.push({ label: label(parent), onSelect: () => onNavigate(parent) });
    if (screen === "home") return crumbs;
    if (screen === "player") crumbs.push({ label: (param && career?.playerName(param)) || t.player });
    else if (screen === "club") crumbs.push({ label: (param && career?.clubNickname(param)) || t.club });
    else if (screen === "match") crumbs.push({ label: t.matchInProgress });
    else crumbs.push({ label: label(screen) });
    return crumbs;
  })();

  /** The header's primary action. A transfer offer is NOT one of them: it is a
   *  nudge (the sidebar badge), never a gate on the calendar. */
  const primaryAction = matchLive ? (
    // The one button that must NOT be pressable during a match: it would stage
    // the same fixture again and restart it from 0'.
    <Button variant="primary" disabled>
      <Radio className="animate-pulse" />
      <span className="hidden sm:inline">{t.matchInProgress}</span>
    </Button>
  ) : stop === "userMatch" ? (
    <Button variant="primary" onClick={() => { playUserFixture(); onNavigate("match"); }}>
      {t.play}
      <ChevronRight />
    </Button>
  ) : stop === "seasonEnd" ? (
    <Button variant="primary" onClick={rolloverSeason}>
      <span className="truncate">{t.seasonComplete}</span>
      <ChevronRight />
    </Button>
  ) : (
    <Button variant="primary" onClick={advancing ? stopTime : continueTime}>
      {advancing ? "⏸" : t.advance}
      <ChevronRight />
    </Button>
  );

  const prefs = (
    <>
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
    </>
  );

  return (
    <div className={cn("grid h-full min-w-0 lg:grid-cols-[248px_1fr]", collapsed && "lg:grid-cols-[64px_1fr]")}>
      {/* The permanent column, from lg up only. */}
      <aside className="hidden flex-col gap-6 overflow-hidden border-r border-hairline bg-elevated px-3 py-4 lg:flex">
        {brand}
        {/* Everything the sidebar leads to is out of reach until full time — the
            match is only alive on screen, so walking away would end it. */}
        {navList}
        {sidebarFooter}
      </aside>

      {/* …and the same thing as a drawer below it. */}
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="gap-6 px-3 py-4">
          <SheetTitle srOnly>{t.dashboard}</SheetTitle>
          {brand}
          {navList}
          {sidebarFooter}
        </SheetContent>
      </Sheet>

      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-hairline bg-bg/80 px-3 backdrop-blur sm:h-16 sm:gap-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setDrawer(true)}
            disabled={matchLive}
            aria-label={t.dashboard}
          >
            <MenuIcon />
          </Button>

          {/* Back sits at the front, where a back control belongs, and simply is
              not there when there is nowhere to go. */}
          {onBack && !matchLive && (
            <Button variant="ghost" size="icon" onClick={onBack} aria-label={t.back}>
              <ArrowLeft />
            </Button>
          )}

          <div className="flex min-w-0 items-center gap-2.5">
            {club?.crest ? (
              <Crest src={club.crest} code={club.shortName} size={28} />
            ) : (
              <span className="grid size-7 place-items-center rounded-sm bg-surface-3 font-display text-xs font-bold text-primary">
                {club?.shortName[0] ?? "?"}
              </span>
            )}
            {/* The full name needs room the phone header does not have; the crest
                already says which club this is. */}
            <span className="hidden truncate text-sm font-semibold md:inline">{club?.name ?? "—"}</span>
          </div>

          {next && (
            <>
              <Separator orientation="vertical" className="hidden h-6 xl:block" />
              <div className="hidden items-center gap-2 text-xs text-fg-muted xl:flex">
                <Crest src={snap?.clubs[next.fixture.homeTeamId]?.crest} code={snap?.clubs[next.fixture.homeTeamId]?.shortName} size={18} />
                <span className="font-semibold tabular-nums text-fg">{snap?.clubs[next.fixture.homeTeamId]?.shortName}</span>
                <span className="text-fg-faint">vs</span>
                <span className="font-semibold tabular-nums text-fg">{snap?.clubs[next.fixture.awayTeamId]?.shortName}</span>
                <Crest src={snap?.clubs[next.fixture.awayTeamId]?.crest} code={snap?.clubs[next.fixture.awayTeamId]?.shortName} size={18} />
              </div>
            </>
          )}

          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-2.5">
            {/* Language, money and theme are set once and then left alone, so on a
                narrow screen they fold into a menu instead of crowding out the
                two controls you press every day. */}
            <div className="hidden items-center gap-2.5 xl:flex">{prefs}</div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="xl:hidden">
                <Button variant="ghost" size="icon" aria-label={t.language}>
                  <Settings2 />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="flex flex-col gap-2 p-2">
                {prefs}
              </DropdownMenuContent>
            </DropdownMenu>
            {/* The date sits with the button that moves it, so the manager sees
                what he's spending when he advances. */}
            {career && <CurrentDate c={career.civilDate()} advancing={advancing} disabled={matchLive} onOpen={() => onNavigate("calendar")} />}
            {primaryAction}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          {/* No width cap: collapsing the sidebar should hand its space to the
              content, not widen the margins around a fixed-width column. */}
          <div className="animate-fade-in flex flex-col gap-4">
            {screen !== "match" && <Breadcrumb trail={trail} />}
            <div className="min-w-0">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
