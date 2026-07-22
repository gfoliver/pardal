import { useApp } from "../app/AppProviders";
import { Badge, Card, Masthead } from "../components/ui";
import { IconMatch } from "../components/icons";
import { DEMO_NEXT } from "../data/demo";

export function Match() {
  const { t } = useApp();
  return (
    <>
      <Masthead kicker={t.match} title={t.matchTitle} meta={t.matchSubtitle} />

      <Card>
        <div className="empty">
          <span className="empty-mark">
            <IconMatch size={30} />
          </span>
          <Badge tone="primary">{t.comingSoon}</Badge>
          <h2 style={{ fontSize: "var(--fs-lg)" }}>
            {DEMO_NEXT.homeShort} vs {DEMO_NEXT.awayShort}
          </h2>
          <p className="u-muted" style={{ maxWidth: 440 }}>
            {t.matchComingSoonBody}
          </p>
        </div>
      </Card>
    </>
  );
}
