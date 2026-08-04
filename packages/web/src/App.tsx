import { useCallback, useEffect, useRef, useState } from "react";
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
import { Club } from "./screens/career/Club";
import { CareerMatch } from "./screens/career/CareerMatch";

const VALID: ScreenId[] = ["home", "calendar", "squad", "tactics", "league", "inbox", "transfers", "scouting", "finances", "player", "club", "match"];

/** The screen a career always opens on. */
const HOME: ScreenId = "home";

interface Route {
  screen: ScreenId;
  param: string;
}

function parseHash(): Route {
  const [seg, param = ""] = window.location.hash.replace("#", "").split("/");
  const screen = VALID.includes(seg as ScreenId) ? (seg as ScreenId) : HOME;
  return { screen, param };
}

const hashOf = (r: Route) => (r.param ? `${r.screen}/${r.param}` : r.screen);
const same = (a: Route, b: Route) => a.screen === b.screen && a.param === b.param;

export default function App() {
  const { status, matchLive } = useCareer();
  const [route, setRoute] = useState(parseHash);
  /**
   * Where you have BEEN, most recent last — what the back button walks down.
   *
   * Kept in the app rather than leaning on browser history because the two are not
   * the same journey: a live match rewrites the hash on its own, and leaving a
   * career has to wipe the trail rather than let the next one inherit it.
   */
  const [trail, setTrail] = useState<Route[]>([]);
  const { screen, param } = route;

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((s: ScreenId, p?: string) => {
    const next: Route = { screen: s, param: p ?? "" };
    const current = parseHash();
    if (same(current, next)) return; // re-tapping the screen you are on is not a move
    setTrail((prev) => [...prev.slice(-19), current]); // twenty deep is plenty
    window.location.hash = hashOf(next);
    setRoute(next);
  }, []);

  const back = useCallback(() => {
    setTrail((prev) => {
      const to = prev[prev.length - 1] ?? { screen: HOME, param: "" };
      window.location.hash = hashOf(to);
      setRoute(to);
      return prev.slice(0, -1);
    });
  }, []);

  // A live match owns the screen. The sim only exists inside CareerMatch, so
  // rendering anything else would unmount it and lose the game — the back
  // button and a hand-edited hash included. Keeping the branch stable while the
  // match runs is what lets the manager come back to the SAME minute.
  const showMatch = matchLive || screen === "match";
  useEffect(() => {
    if (matchLive && screen !== "match") navigate("match"); // put the address bar back where the app is
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchLive, screen]);

  /*
   * The one screen a refresh cannot put you back on is a match.
   *
   * Every other screen restores from the hash, which is why they survive a reload for free. A live
   * match does not: the played minutes live only in memory, so `#match` can restore nothing but
   * CareerMatch's empty state with a way out. Sending it to the dashboard on boot is the honest
   * version of that, and it must happen ONLY on boot — during a session the match branch has to stay
   * put or the running game unmounts.
   */
  const booted = useRef(false);
  useEffect(() => {
    if (status !== "active" || booted.current) return;
    booted.current = true;
    if (parseHash().screen === "match") {
      window.location.hash = HOME;
      setRoute({ screen: HOME, param: "" });
    }
  }, [status]);

  // Leaving a career must not hand the NEXT one the screen you happened to be on:
  // starting a save and landing on someone else's player profile is disorienting,
  // and the tactics board of a club you no longer manage is worse. Every career
  // opens on its dashboard.
  useEffect(() => {
    if (status !== "no-save") return;
    setTrail([]);
    if (parseHash().screen !== HOME) {
      window.location.hash = HOME;
      setRoute({ screen: HOME, param: "" });
    }
  }, [status]);

  if (status === "loading") return <div className="grid h-full place-items-center text-sm text-fg-muted">…</div>;
  if (status === "no-save") return <Start />;

  return (
    <Shell
      screen={showMatch ? "match" : screen}
      param={param}
      onNavigate={navigate}
      onBack={trail.length > 0 ? back : undefined}
    >
      {showMatch ? (
        <CareerMatch onNavigate={navigate} />
      ) : (
        <>
          {screen === "home" && <Home onNavigate={navigate} />}
          {screen === "calendar" && <Calendar />}
          {screen === "league" && <LeagueTable onNavigate={navigate} />}
          {screen === "squad" && <Squad onNavigate={navigate} />}
          {screen === "tactics" && <Tactics onNavigate={navigate} />}
          {screen === "inbox" && <Inbox />}
          {screen === "transfers" && <Transfers onNavigate={navigate} />}
          {screen === "scouting" && <Scouting onNavigate={navigate} />}
          {screen === "finances" && <Finances />}
          {screen === "player" && <PlayerDetail playerId={param} onNavigate={navigate} />}
          {screen === "club" && <Club clubId={param} onNavigate={navigate} />}
        </>
      )}
    </Shell>
  );
}
