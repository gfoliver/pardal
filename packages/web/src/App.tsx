import { useEffect, useState } from "react";
import { Shell, type ScreenId } from "./layout/Shell";
import { Dashboard } from "./screens/Dashboard";
import { Squad } from "./screens/Squad";
import { Tactics } from "./screens/Tactics";
import { Match } from "./screens/Match";
import { League } from "./screens/League";

const VALID: ScreenId[] = ["dashboard", "squad", "tactics", "match", "league"];

function currentFromHash(): ScreenId {
  const h = window.location.hash.replace("#", "") as ScreenId;
  return VALID.includes(h) ? h : "dashboard";
}

export default function App() {
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

  return (
    <Shell screen={screen} onNavigate={navigate}>
      {screen === "dashboard" && <Dashboard onNavigate={navigate} />}
      {screen === "squad" && <Squad />}
      {screen === "tactics" && <Tactics />}
      {screen === "match" && <Match />}
      {screen === "league" && <League />}
    </Shell>
  );
}
