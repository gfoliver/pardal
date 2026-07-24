import { useState } from "react";
import { Trash2 } from "lucide-react";
import { InboxMessageType } from "@fut/career";
import { useApp } from "../../app/AppProviders";
import { useCareer } from "../../app/CareerProvider";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { useFormat } from "../../lib/format";
import { cn } from "../../lib/utils";
import { renderInbox } from "./inbox-format";

export function Inbox() {
  const { t, locale } = useApp();
  const { career, dispatch } = useCareer();
  const fmt = useFormat();
  const [selected, setSelected] = useState<string | null>(null);
  if (!career) return null;
  const snap = career.snapshot();
  const messages = snap.inbox.filter((m) => m.type !== InboxMessageType.MatchResult).reverse(); // newest first, no results
  const current = messages.find((m) => m.id === selected) ?? messages[0] ?? null;

  const open = (id: string) => {
    setSelected(id);
    const m = snap.inbox.find((x) => x.id === id);
    if (m && !m.read) dispatch({ type: "readInbox", messageId: id });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.inbox}</h1>
        <p className="text-sm text-fg-muted">{career.unreadCount()} {t.unread}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)]">
        <Card>
          <CardContent className="max-h-[64vh] overflow-y-auto p-1.5">
            {messages.length === 0 ? (
              <p className="p-6 text-center text-sm text-fg-muted">{t.noMessages}</p>
            ) : (
              messages.map((m) => {
                const mail = renderInbox(m, career, locale);
                return (
                  <button
                    key={m.id}
                    onClick={() => open(m.id)}
                    className={cn("flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors", current?.id === m.id ? "bg-surface-2" : "hover:bg-surface-2")}
                  >
                    <div className="flex items-center gap-2">
                      {!m.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                      <span className={cn("flex-1 truncate text-sm", m.read ? "text-fg-muted" : "font-semibold text-fg")}>{mail.subject}</span>
                      <span className="shrink-0 text-2xs text-fg-faint tabular-nums">{fmt.civil(career.civilDate(m.date))}</span>
                    </div>
                    <span className="truncate pl-3.5 text-xs text-fg-faint">{mail.from}</span>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-5">
            {current ? (
              (() => {
                const mail = renderInbox(current, career, locale);
                return (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold text-fg">{mail.subject}</h2>
                        <p className="text-xs text-fg-faint">{mail.from} · {fmt.civil(career.civilDate(current.date), { long: true })}</p>
                      </div>
                      <Button size="icon-sm" variant="ghost" aria-label="Archive" onClick={() => { dispatch({ type: "archiveInbox", messageId: current.id }); setSelected(null); }}>
                        <Trash2 />
                      </Button>
                    </div>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-fg-muted">{mail.body}</p>
                  </div>
                );
              })()
            ) : (
              <p className="grid place-items-center py-16 text-sm text-fg-muted">{t.noMessages}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
