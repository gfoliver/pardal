import { Swords } from "lucide-react";
import { useApp } from "../app/AppProviders";
import { PageHeader } from "../components/ui/page-header";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { DEMO_NEXT } from "../data/demo";

export function Match() {
  const { t } = useApp();
  return (
    <>
      <PageHeader kicker={t.match} title={t.matchTitle} meta={t.matchSubtitle} />

      <Card>
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
          <span className="grid size-14 place-items-center rounded-lg bg-primary-soft text-primary">
            <Swords className="size-7" />
          </span>
          <Badge variant="primary">{t.comingSoon}</Badge>
          <h2 className="serif text-xl font-semibold">
            {DEMO_NEXT.homeShort} vs {DEMO_NEXT.awayShort}
          </h2>
          <p className="max-w-md text-sm text-fg-muted">{t.matchComingSoonBody}</p>
        </div>
      </Card>
    </>
  );
}
