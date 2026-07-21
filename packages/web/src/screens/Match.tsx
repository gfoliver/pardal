import { useApp } from "../app/AppProviders";
import { Badge, Card } from "../components/ui";
import { IconMatch } from "../components/icons";
import { DEMO_NEXT } from "../data/demo";

export function Match() {
  const { t } = useApp();
  return (
    <>
      <div className="page-head">
        <h1>{t.matchTitle}</h1>
        <p>{t.matchSubtitle}</p>
      </div>

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
