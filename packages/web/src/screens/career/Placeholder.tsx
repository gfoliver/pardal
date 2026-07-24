import { useApp } from "../../app/AppProviders";
import { Card, CardContent } from "../../components/ui/card";

export function Placeholder({ title }: { title: string }) {
  const { t } = useApp();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card>
        <CardContent className="grid place-items-center py-16 text-sm text-fg-muted">{t.comingSoonShort}</CardContent>
      </Card>
    </div>
  );
}
