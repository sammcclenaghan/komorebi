import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { cn } from "~/lib/cn";
import { Button } from "./ui/Button";

export function WeeklyCheckIn() {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const query = useQuery({
    queryKey: ["coach", "weekly-check-in"],
    queryFn: () => window.komorebi.coach.weeklyCheckIn()
  });
  const send = useMutation({
    mutationFn: (content: string) => window.komorebi.coach.sendCheckInMessage(content),
    onSuccess: (data) => {
      queryClient.setQueryData(["coach", "weekly-check-in"], data);
      setText("");
    }
  });

  if (query.isLoading || query.isError || !query.data) return null;

  const { due, messages } = query.data;
  const submit = () => {
    const content = text.trim();
    if (!content || send.isPending) return;
    send.mutate(content);
  };

  return (
    <aside
      className={cn(
        "mt-5 rounded-xl border px-4 py-4",
        due
          ? "border-[var(--color-accent)]/30 bg-[var(--color-accent-tint)]"
          : "border-[var(--color-rule)] bg-[var(--color-panel)]"
      )}
      style={{ animation: "fade-up 340ms backwards var(--ease-out-strong)" }}
    >
      <div className="flex items-start gap-3">
        <MessageCircle
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent-strong)]"
          strokeWidth={1.5}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-2xs uppercase tracking-[0.22em] text-[var(--color-ink-3)]">
            weekly check-in
          </div>
          {messages.length === 0 ? (
            <div className="mt-1">
              <p className="text-base font-medium text-[var(--color-ink)]">
                How is the path feeling?
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--color-ink-2)]">
                Talk through what worked, what you avoided, and whether the tasks or resources need to change.
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[92%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                    message.role === "user"
                      ? "ml-auto bg-[var(--color-ink)] text-[var(--color-canvas)]"
                      : "border border-[var(--color-rule)] bg-[var(--color-canvas)] text-[var(--color-ink)]"
                  )}
                >
                  {message.content}
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-end gap-2">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
              }}
              rows={2}
              maxLength={2000}
              placeholder={messages.length ? "Keep talking…" : "The recommendations haven't been useful because…"}
              className="input min-h-[68px] flex-1 resize-none bg-[var(--color-canvas)]"
              disabled={send.isPending}
            />
            <Button
              size="sm"
              className="h-9 w-9 shrink-0 px-0"
              onClick={submit}
              disabled={!text.trim() || send.isPending}
              aria-label="Send to coach"
            >
              {send.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" strokeWidth={2} />
              )}
            </Button>
          </div>
          {send.isError && (
            <p className="mt-2 text-xs text-[var(--color-danger)]">
              {send.error instanceof Error ? send.error.message : "The coach couldn't reply. Try again."}
            </p>
          )}
          <p className="mt-2 text-2xs text-[var(--color-ink-3)]">
            What you share here steers future tasks. Ctrl/⌘ + Enter to send.
          </p>
        </div>
      </div>
    </aside>
  );
}
