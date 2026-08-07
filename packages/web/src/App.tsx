import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./app/AppProviders";
import { useCareer } from "./app/CareerProvider";
import { LoadingScreen, Spinner } from "./components/ui/spinner";
import { Shell } from "./layout/Shell";
import { SECTIONS, isScreenId, type ScreenId, type SectionId } from "./layout/screens";

/**
 * Every screen is loaded when it is first opened, not when the app boots.
 *
 * The main bundle was 938 kB with all of this inside it, and most of that weight is code a given
 * session may never reach: the spatial match engine, which only exists behind `CareerMatch`, and
 * recharts, which only the player profile draws. Downloading the simulator before the manager has
 * decided to play a match is paying for it on the wrong screen.
 *
 * `lazy` needs a default export and these are all named, hence the `.then` on each — kept explicit and
 * one per line rather than hidden behind a helper, because the string literal has to stay statically
 * analysable for the bundler to see the split point at all.
 */
const Start = lazy(() => import("./screens/Start").then((m) => ({ default: m.Start })));
const Home = lazy(() => import("./screens/career/Home").then((m) => ({ default: m.Home })));
const Calendar = lazy(() => import("./screens/career/Calendar").then((m) => ({ default: m.Calendar })));
const LeagueTable = lazy(() => import("./screens/career/LeagueTable").then((m) => ({ default: m.LeagueTable })));
const Squad = lazy(() => import("./screens/career/Squad").then((m) => ({ default: m.Squad })));
const Tactics = lazy(() => import("./screens/career/Tactics").then((m) => ({ default: m.Tactics })));
const Inbox = lazy(() => import("./screens/career/Inbox").then((m) => ({ default: m.Inbox })));
const Transfers = lazy(() => import("./screens/career/Transfers").then((m) => ({ default: m.Transfers })));
const Scouting = lazy(() => import("./screens/career/Scouting").then((m) => ({ default: m.Scouting })));
const Finances = lazy(() => import("./screens/career/Finances").then((m) => ({ default: m.Finances })));
const PlayerDetail = lazy(() => import("./screens/career/PlayerDetail").then((m) => ({ default: m.PlayerDetail })));
const Club = lazy(() => import("./screens/career/Club").then((m) => ({ default: m.Club })));
const CareerMatch = lazy(() => import("./screens/career/CareerMatch").then((m) => ({ default: m.CareerMatch })));
const Friendly = lazy(() => import("./screens/mp/Friendly").then((m) => ({ default: m.Friendly })));

/** A screen is on its way. Small and centred: this is a chunk, not a network round-trip to a server. */
function ScreenFallback() {
  return (
    <div className="grid place-items-center py-24">
      <Spinner className="size-6 text-fg-faint" />
    </div>
  );
}

/** The screen a career always opens on. */
const HOME: ScreenId = "home";

interface Route {
  screen: ScreenId;
  param: string;
}

/**
 * REAL PATHS, not a hash.
 *
 * `/squad`, `/club/tm-614` — an address a person can read, a link they can send, and something a server
 * sees. A fragment never leaves the browser, which is fine for a single-player save and useless the moment
 * a URL has to invite somebody into a room.
 *
 * The cost is that the host must serve `index.html` for every path it does not recognise: Vite's dev
 * server does it by default, and `public/_redirects` says so for the deployed build. Without that, a deep
 * link 404s and the failure looks like the app rather than the host.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function parseLocation(): Route {
  const path = window.location.pathname.startsWith(BASE)
    ? window.location.pathname.slice(BASE.length)
    : window.location.pathname;
  const [seg = "", param = ""] = path.replace(/^\//, "").split("/");
  const screen = isScreenId(seg) ? seg : HOME;
  return { screen, param: decodeURIComponent(param) };
}

const pathOf = (r: Route) => `${BASE}/${r.param ? `${r.screen}/${encodeURIComponent(r.param)}` : r.screen}`;
const same = (a: Route, b: Route) => a.screen === b.screen && a.param === b.param;

export default function App() {
  const { t } = useApp();
  const { status, matchLive } = useCareer();
  const [route, setRoute] = useState(parseLocation);
  /**
   * Where you have BEEN, most recent last — what the back button walks down.
   *
   * Kept in the app rather than leaning on browser history because the two are not
   * the same journey: a live match rewrites the location on its own, and leaving a
   * career has to wipe the trail rather than let the next one inherit it.
   */
  const [trail, setTrail] = useState<Route[]>([]);
  const { screen, param } = route;

  /**
   * Which section we actually reached a detail screen from.
   *
   * Walks the trail backwards for the last entry that has a nav home. `Shell` used to guess this from
   * a static map — `player -> squad` — so a rival opened from Scouting read "Dashboard > Squad >
   * Name", which claimed he was in your squad. Undefined when the trail holds no section (a pasted or
   * restored path), and Shell shows no section crumb rather than inventing one.
   */
  const origin = useMemo<SectionId | undefined>(() => {
    for (let i = trail.length - 1; i >= 0; i--) {
      const id = trail[i]!.screen;
      if ((SECTIONS as readonly string[]).includes(id)) return id as SectionId;
    }
    return undefined;
  }, [trail]);

  /**
   * Mirrors `route` so the hash listener can tell OUR navigations from the browser's.
   *
   * Assigned in `navigate`/`back` as well as on render, because `popstate` is dispatched as its own
   * task and must not race a pending re-render.
   */
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    const onHash = () => {
      const next = parseLocation();
      // Our own navigation already applied this; the event is just the echo.
      if (same(routeRef.current, next)) return;
      /*
       * A hash change we did not initiate — the browser's back or forward button.
       *
       * The trail used to be left untouched here, so after a browser-back it still held the screen
       * you had just returned FROM: pressing the app's own back button then walked you forward. If
       * the incoming route is exactly where we last were, this is a back step, so consume that entry.
       */
      setTrail((prev) => (prev.length > 0 && same(prev[prev.length - 1]!, next) ? prev.slice(0, -1) : prev));
      routeRef.current = next;
      setRoute(next);
    };
    window.addEventListener("popstate", onHash);
    return () => window.removeEventListener("popstate", onHash);
  }, []);

  const navigate = useCallback((s: ScreenId, p?: string) => {
    const next: Route = { screen: s, param: p ?? "" };
    const current = parseLocation();
    if (same(current, next)) return; // re-tapping the screen you are on is not a move
    setTrail((prev) => [...prev.slice(-19), current]); // twenty deep is plenty
    history.pushState(null, "", pathOf(next));
    routeRef.current = next;
    setRoute(next);
  }, []);

  const back = useCallback(() => {
    setTrail((prev) => {
      const to = prev[prev.length - 1] ?? { screen: HOME, param: "" };
      history.pushState(null, "", pathOf(to));
      routeRef.current = to;
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
   * Every other screen restores from its path, which is why they survive a reload for free. A live
   * match does not: the played minutes live only in memory, so `/match` can restore nothing but
   * CareerMatch's empty state with a way out. Sending it to the dashboard on boot is the honest
   * version of that, and it must happen ONLY on boot — during a session the match branch has to stay
   * put or the running game unmounts.
   */
  const booted = useRef(false);
  useEffect(() => {
    if (status !== "active" || booted.current) return;
    booted.current = true;
    if (parseLocation().screen === "match") {
      history.replaceState(null, "", pathOf({ screen: HOME, param: "" }));
      setRoute({ screen: HOME, param: "" });
    }
  }, [status]);

  /*
   * Leaving a career must not hand the NEXT one the screen you happened to be on: starting a save and
   * landing on someone else's player profile is disorienting, and the tactics board of a club you no
   * longer manage is worse. Every career opens on its dashboard.
   *
   * EXCEPT THE ROOM, which is not a career screen at all. There is no save while the start screen is up,
   * so this fired on every fresh load — and an invite link, which is exactly a fresh load, was rewritten
   * to the dashboard before it could be read. Anything reachable without a career has to be exempt here,
   * which is what `isDetail` distinguishes.
   */
  useEffect(() => {
    if (status !== "no-save") return;
    setTrail([]);
    if (parseLocation().screen !== HOME && parseLocation().screen !== "friendly") {
      history.replaceState(null, "", pathOf({ screen: HOME, param: "" }));
      setRoute({ screen: HOME, param: "" });
    }
  }, [status]);

  /*
   * A ROOM COMES FIRST, before any question about saves.
   *
   * `/friendly/ABC234` is a link somebody was sent, and following it is a decision: it must not be
   * intercepted by "you have a career, resume it" or by the start screen's menu. It is also the one screen
   * here that works with no save at all.
   */
  if (screen === "friendly") {
    return (
      <Suspense fallback={<LoadingScreen label={t.loadingDataset} />}>
        <Friendly code={param || undefined} onExit={() => navigate(HOME)} />
      </Suspense>
    );
  }

  // The first thing anyone sees, and it used to be a bare ellipsis — which reads the same whether the
  // app is booting or has given up. This boot reads the session, opens IndexedDB and, if it is resuming
  // a career, fetches the squad data.
  if (status === "loading") return <LoadingScreen label={t.loadingCareer} />;
  // The same screen while the chunk arrives, so the boot reads as one wait rather than two.
  if (status === "no-save") {
    return (
      <Suspense fallback={<LoadingScreen label={t.loadingCareer} />}>
        <Start onOpenFriendly={() => navigate("friendly")} />
      </Suspense>
    );
  }

  return (
    <Shell
      screen={showMatch ? "match" : screen}
      param={param}
      origin={origin}
      onNavigate={navigate}
      onBack={trail.length > 0 ? back : undefined}
    >
      {/*
        Two boundaries, not one, and the reason is the running match.

        A boundary that suspends replaces its children with the fallback, and React discards their state
        when it does. The match branch is the one subtree in the app whose state cannot be rebuilt — the
        played minutes exist only in memory — so it gets a boundary of its own that nothing else can make
        suspend. Sharing one would mean a screen chunk arriving late could take a match with it.
      */}
      {showMatch ? (
        <Suspense fallback={<ScreenFallback />}>
          <CareerMatch onNavigate={navigate} />
        </Suspense>
      ) : (
        <Suspense fallback={<ScreenFallback />}>
          {screen === "home" && <Home onNavigate={navigate} />}
          {screen === "calendar" && <Calendar />}
          {screen === "league" && <LeagueTable onNavigate={navigate} />}
          {screen === "squad" && <Squad onNavigate={navigate} />}
          {screen === "tactics" && <Tactics onNavigate={navigate} />}
          {screen === "inbox" && <Inbox onNavigate={navigate} />}
          {screen === "transfers" && <Transfers onNavigate={navigate} />}
          {screen === "scouting" && <Scouting onNavigate={navigate} />}
          {screen === "finances" && <Finances />}
          {screen === "player" && <PlayerDetail playerId={param} onNavigate={navigate} />}
          {screen === "club" && <Club clubId={param} onNavigate={navigate} />}
        </Suspense>
      )}
    </Shell>
  );
}
