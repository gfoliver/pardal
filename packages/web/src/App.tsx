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
import { PlayerDetail } from "./screens/career/PlayerDetail";
import { CareerMatch } from "./screens/career/CareerMatch";

const VALID: ScreenId[] = ["home", "calendar", "squad", "tactics", "league", "inbox", "transfers", "scouting", "finances", "player", "match"];

function parseHash(): { screen: ScreenId; param: string } {
  const [seg, param = ""] = window.location.hash.replace("#", "").split("/");
  const screen = VALID.includes(seg as ScreenId) ? (seg as ScreenId) : "home";
  return { screen, param };
}

export default function App() {
  const { status } = useCareer();
  const [route, setRoute] = useState(parseHash);
  const { screen, param } = route;

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (s: ScreenId, param?: string) => {
    window.location.hash = param ? `${s}/${param}` : s;
    setRoute(parseHash());
  };

  if (status === "loading") return <div className="grid h-full place-items-center text-sm text-fg-muted">…</div>;
  if (status === "no-save") return <Start />;

  return (
    <Shell screen={screen} onNavigate={navigate}>
      {screen === "home" && <Home onNavigate={navigate} />}
      {screen === "calendar" && <Calendar />}
      {screen === "league" && <LeagueTable />}
      {screen === "squad" && <Squad onNavigate={navigate} />}
      {screen === "tactics" && <Tactics />}
      {screen === "inbox" && <Inbox />}
      {screen === "match" && <CareerMatch onNavigate={navigate} />}
      {screen === "transfers" && <Transfers onNavigate={navigate} />}
      {screen === "scouting" && <Scouting onNavigate={navigate} />}
      {screen === "finances" && <Finances />}
      {screen === "player" && <PlayerDetail playerId={param} onNavigate={navigate} />}
    </Shell>
  );
}
