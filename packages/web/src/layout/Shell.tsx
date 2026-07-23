import { useState, type ReactNode } from "react";
import {
  ChevronRight,
  ClipboardList,
  LayoutGrid,
  Moon,
  PanelLeft,
  Sun,
  Swords,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useApp, useToggleTheme } from "../app/AppProviders";
import { Button } from "../components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { Separator } from "../components/ui/separator";
import { UI_LOCALES } from "../i18n/strings";
import { NEXT, YOU } from "../lib/engine/world";
import { cn } from "../lib/utils";

export type ScreenId = "dashboard" | "squad" | "tactics" | "match" | "league";

const NAV: { id: ScreenId; icon: LucideIcon; key: "dashboard" | "squad" | "tactics" | "match" | "league" }[] = [
  { id: "dashboard", icon: LayoutGrid, key: "dashboard" },
  { id: "squad", icon: Users, key: "squad" },
  { id: "tactics", icon: ClipboardList, key: "tactics" },
  { id: "match", icon: Swords, key: "match" },
  { id: "league", icon: Trophy, key: "league" },
];

export function Shell({
  screen,
  onNavigate,
  children,
}: {
  screen: ScreenId;
  onNavigate: (s: ScreenId) => void;
  children: ReactNode;
}) {
  const { t, theme, locale, setLocale } = useApp();
  const toggleTheme = useToggleTheme();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={cn("grid h-full", collapsed ? "grid-cols-[64px_1fr]" : "grid-cols-[248px_1fr]")}>
      {/* Sidebar */}
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
                {!collapsed && <span>{t[key]}</span>}
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

      {/* Main */}
      <div className="flex h-full min-w-0 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-hairline bg-bg/80 px-6 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-sm bg-surface-3 font-display text-xs font-bold text-primary">
              {YOU.short[0]}
            </span>
            <span className="text-sm font-semibold">{YOU.name}</span>
          </div>

          <Separator orientation="vertical" className="h-6" />

          <div className="hidden items-center gap-2 text-xs text-fg-muted sm:flex">
            <span className="caps text-fg-faint">{NEXT.competition}</span>
            <span className="tabular-nums font-semibold text-fg">{NEXT.homeShort}</span>
            <span className="text-fg-faint">vs</span>
            <span className="tabular-nums font-semibold text-fg">{NEXT.awayShort}</span>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <ToggleGroup
              type="single"
              value={locale}
              onValueChange={(v) => v && setLocale(v as typeof locale)}
              aria-label={t.language}
            >
              {UI_LOCALES.map((l) => (
                <ToggleGroupItem key={l.id} value={l.id}>
                  {l.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={t.theme}>
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
            <Button variant="primary" onClick={() => onNavigate("match")}>
              {t.continue}
              <ChevronRight />
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-8">
          <div className={cn("mx-auto animate-fade-in", screen === "match" ? "max-w-[1480px]" : "max-w-[1180px]")}>{children}</div>
        </main>
      </div>
    </div>
  );
}
