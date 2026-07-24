import { useEffect, useState } from "react";
import { useCareer } from "./app/CareerProvider";
import { Shell, type ScreenId } from "./layout/Shell";
import { Start } from "./screens/Start";
import { Home } from "./screens/career/Home";
import { Calendar } from "./screens/career/Calendar";
import { LeagueTable } from "./screens/career/LeagueTable";
import { Squad } from "./screens/career/Squad";
import { Tactics } from "./screens/career/Tactics";
import { Inbox } from "./screens/career/Inbox";
import { Transfers } from "./screens/career/Transfers";
import { Scouting } from "./screens/career/Scouting";
import { Finances } from "./screens/career/Finances";
import { CareerMatch } from "./screens/career/CareerMatch";

const VALID: ScreenId[] = ["home", "calendar", "squad", "tactics", "league", "inbox", "transfers", "scouting", "finances", "match"];

function currentFromHash(): ScreenId {
  const h = window.location.hash.replace("#", "").split("/")[0] as ScreenId;
  return VALID.includes(h) ? h : "home";
}

export default function App() {
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

  if (status === "loading") return <div className="grid h-full place-items-center text-sm text-fg-muted">…</div>;
  if (status === "no-save") return <Start />;

  return (
    <Shell screen={screen} onNavigate={navigate}>
      {screen === "home" && <Home onNavigate={navigate} />}
      {screen === "calendar" && <Calendar />}
      {screen === "league" && <LeagueTable />}
      {screen === "squad" && <Squad />}
      {screen === "tactics" && <Tactics />}
      {screen === "inbox" && <Inbox />}
      {screen === "match" && <CareerMatch onNavigate={navigate} />}
      {screen === "transfers" && <Transfers />}
      {screen === "scouting" && <Scouting />}
      {screen === "finances" && <Finances />}
    </Shell>
  );
}
