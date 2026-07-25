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
import { Crest } from "../components/ui/crest";
import { Button } from "../components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { Separator } from "../components/ui/separator";
import { UI_LOCALES, type UIStrings } from "../i18n/strings";
import { CURRENCIES } from "../lib/currency";
import { cn } from "../lib/utils";

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

const NAV: { id: ScreenId; icon: LucideIcon; key: keyof UIStrings }[] = [
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

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="mt-auto flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-fg-faint outline-none transition-colors hover:bg-surface-2 hover:text-fg"
          aria-label="Toggle sidebar"
          aria-expanded={!collapsed}
        >
          <PanelLeft className={cn("size-[18px] shrink-0 transition-transform", collapsed && "rotate-180")} />
          {!collapsed && <span>{t.collapse}</span>}
        </button>
      </aside>

      <div className="flex h-full min-w-0 flex-col">
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
            <Button variant="ghost" size="icon" onClick={leaveToStart} aria-label={t.newCareer} title={t.newCareer}>
              <LogOut />
            </Button>
            {stop === "decision" ? (
              <Button variant="primary" onClick={() => onNavigate("transfers")}>
                {t.transfers}
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
          <div className="mx-auto max-w-[1180px] animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
