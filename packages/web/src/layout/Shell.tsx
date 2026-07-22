import { useState, type ReactNode } from "react";
import { useApp, useToggleTheme } from "../app/AppProviders";
import { Button, Segmented } from "../components/ui";
import {
  IconChevron,
  IconDashboard,
  IconLeague,
  IconMatch,
  IconMenu,
  IconMoon,
  IconSquad,
  IconSun,
  IconTactics,
} from "../components/icons";
import { UI_LOCALES } from "../i18n/strings";
import { DEMO_NEXT } from "../data/demo";

export type ScreenId = "dashboard" | "squad" | "tactics" | "match" | "league";

const NAV: { id: ScreenId; icon: (p: { size?: number }) => ReactNode; key: keyof ReturnType<typeof useApp>["t"] }[] = [
  { id: "dashboard", icon: IconDashboard, key: "dashboard" },
  { id: "squad", icon: IconSquad, key: "squad" },
  { id: "tactics", icon: IconTactics, key: "tactics" },
  { id: "match", icon: IconMatch, key: "match" },
  { id: "league", icon: IconLeague, key: "league" },
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
    <div className="shell" data-collapsed={collapsed}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">O</span>
          <span className="brand-name">
            Onz<b>e</b>
          </span>
        </div>
        <nav className="nav">
          {NAV.map(({ id, icon: Icon, key }) => (
            <a
              key={id}
              className="nav-item"
              aria-current={screen === id ? "page" : undefined}
              onClick={() => onNavigate(id)}
              href={`#${id}`}
            >
              <span className="nav-ico">
                <Icon size={20} />
              </span>
              <span className="nav-label">{t[key]}</span>
            </a>
          ))}
        </nav>
        <div style={{ marginTop: "auto" }}>
          <Button variant="ghost" size="sm" iconOnly onClick={() => setCollapsed((c) => !c)} aria-label="Toggle sidebar">
            <IconMenu size={18} />
          </Button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="topbar-title">{t[screenTitleKey(screen)]}</span>

          <div className="matchchip" title={DEMO_NEXT.competition}>
            <strong>{DEMO_NEXT.homeShort}</strong>
            <span className="vs">vs</span>
            <strong>{DEMO_NEXT.awayShort}</strong>
          </div>

          <div className="topbar-controls">
            <Segmented
              ariaLabel={t.language}
              value={locale}
              onChange={setLocale}
              options={UI_LOCALES.map((l) => ({ value: l.id, label: l.label }))}
            />
            <Button variant="ghost" iconOnly onClick={toggleTheme} aria-label={t.theme}>
              {theme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
            </Button>
          </div>
        </header>

        <main className="content">
          <div className="content-inner">{children}</div>
        </main>
      </div>
    </div>
  );
}

function screenTitleKey(s: ScreenId): keyof ReturnType<typeof useApp>["t"] {
  return s;
}

export { IconChevron };
