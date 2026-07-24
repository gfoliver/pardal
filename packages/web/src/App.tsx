import { useEffect, useState } from "react";
import { useApp } from "./app/AppProviders";
import { useCareer } from "./app/CareerProvider";
import { Shell, type ScreenId } from "./layout/Shell";
import { Start } from "./screens/Start";
import { Home } from "./screens/career/Home";
import { Calendar } from "./screens/career/Calendar";
import { LeagueTable } from "./screens/career/LeagueTable";
import { Placeholder } from "./screens/career/Placeholder";

const VALID: ScreenId[] = ["home", "calendar", "squad", "tactics", "league", "inbox", "transfers", "scouting", "finances"];

function currentFromHash(): ScreenId {
  const h = window.location.hash.replace("#", "").split("/")[0] as ScreenId;
  return VALID.includes(h) ? h : "home";
}

export default function App() {
  const { t } = useApp();
  const { status } = useCareer();
  const [screen, setScreen] = useState<ScreenId>(currentFromHash);

  useEffect(() => {
    const onHash = () => setScreen(currentFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (s: ScreenId) => {
    window.location.hash = s;
    setScreen(s);
  };

  if (status === "loading") {
    return <div className="grid h-full place-items-center text-sm text-fg-muted">…</div>;
  }
  if (status === "no-save") {
    return <Start />;
  }

  return (
    <Shell screen={screen} onNavigate={navigate}>
      {screen === "home" && <Home onNavigate={navigate} />}
      {screen === "calendar" && <Calendar />}
      {screen === "league" && <LeagueTable />}
      {screen === "squad" && <Placeholder title={t.squad} />}
      {screen === "tactics" && <Placeholder title={t.tactics} />}
      {screen === "inbox" && <Placeholder title={t.inbox} />}
      {screen === "transfers" && <Placeholder title={t.transfers} />}
      {screen === "scouting" && <Placeholder title={t.scouting} />}
      {screen === "finances" && <Placeholder title={t.finances} />}
    </Shell>
  );
}
