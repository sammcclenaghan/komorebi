import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, Cpu, Loader2, Monitor, Moon, Palette, RotateCw, Settings as SettingsIcon, Sun } from "lucide-react";
import { cn } from "~/lib/cn";
import type { AppSettings, Theme } from "~/shared/types";
import type { SettingsUpdate } from "~/main/store/settings";

export function Settings() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => window.komorebi.settings.get()
  });

  const update = useMutation({
    mutationFn: (patch: SettingsUpdate) => window.komorebi.settings.update(patch),
    onSuccess: (next) => {
      queryClient.setQueryData(["settings"], next);
    }
  });

  const regenerate = useMutation({
    mutationFn: () => window.komorebi.checklist.regenerate(),
    onSuccess: (data) => {
      queryClient.setQueryData(["checklist", "today"], data);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
    }
  });

  const [confirmingRedo, setConfirmingRedo] = useState(false);

  const schedule = settingsQuery.data?.schedule;
  const theme = settingsQuery.data?.theme;
  const model = settingsQuery.data?.model ?? null;

  return (
    <div className="page-shell">
      <header>
        <div className="flex items-center gap-3 text-[var(--color-ink-3)]">
          <SettingsIcon className="h-4 w-4" strokeWidth={1.5} />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em]">
            settings
          </span>
        </div>

        <h1 className="mt-3 text-[30px] font-semibold leading-[1.15] tracking-tight text-[var(--color-ink)]">
          How Komorebi shows up.
        </h1>
        <p className="mt-3 max-w-lg text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
          Have your day composed and waiting for you, with a nudge when it's ready.
        </p>
      </header>

      <div className="mt-10 space-y-6">
        {settingsQuery.isLoading || !schedule || !theme ? (
          <div
            className="h-[148px] rounded-xl border border-[var(--color-rule)] bg-[var(--color-panel)]"
            style={{ animation: "fade-up 400ms ease-out" }}
          />
        ) : (
        <>
          <section className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)] px-5 py-4">
            <div className="flex items-center gap-3 text-[var(--color-ink-3)]">
              <Bell className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="font-mono text-[9.5px] uppercase tracking-[0.2em]">
                daily schedule
              </span>
            </div>

            <Row
              title="Compose & notify each morning"
              description="At the time below, Komorebi composes today's checklist in the background and sends a notification when it's ready — even with the window closed."
            >
              <Toggle
                checked={schedule.enabled}
                disabled={update.isPending}
                onChange={(enabled) => update.mutate({ enabled })}
              />
            </Row>

            <Row
              title="Time of day"
              description="When your checklist is composed."
              dimmed={!schedule.enabled}
            >
              <input
                type="time"
                value={schedule.time}
                disabled={!schedule.enabled || update.isPending}
                onChange={(e) => update.mutate({ time: e.target.value })}
                className={cn(
                  "rounded-md border border-[var(--color-rule)] bg-[var(--color-panel)] px-2.5 py-1.5",
                  "text-[13px] tabular-nums text-[var(--color-ink)]",
                  "transition focus:border-[var(--color-accent)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              />
            </Row>

            <div className="mt-3 flex h-4 items-center justify-end">
              {update.isPending && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-ink-3)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving…
                </span>
              )}
              {update.isError && (
                <span className="text-[11px] text-[oklch(58%_0.18_25)]">
                  Couldn't save. Try again.
                </span>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)] px-5 py-4">
            <div className="flex items-center gap-3 text-[var(--color-ink-3)]">
              <Palette className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="font-mono text-[9.5px] uppercase tracking-[0.2em]">
                appearance
              </span>
            </div>

            <Row
              title="Theme"
              description="Light is the original paper look. Dark uses warm-tinted neutrals so it still feels like Komorebi. System follows your macOS appearance."
            >
              <ThemePicker
                value={theme}
                disabled={update.isPending}
                onChange={(next) => update.mutate({ theme: next })}
              />
            </Row>
          </section>

          <section className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)] px-5 py-4">
            <div className="flex items-center gap-3 text-[var(--color-ink-3)]">
              <Cpu className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="font-mono text-[9.5px] uppercase tracking-[0.2em]">
                model
              </span>
            </div>

            <Row
              title="Composer model"
              description="The Ollama model that drafts each suggestion. A bigger or instruction-tuned model finds higher-quality resources. Leave blank to use the server default. Must already be available on your Ollama host."
            >
              <ModelField
                value={model}
                disabled={update.isPending}
                onCommit={(next) => update.mutate({ model: next })}
              />
            </Row>
          </section>

          <section className="rounded-xl border border-[oklch(58%_0.18_25)]/30 bg-[var(--color-canvas)] px-5 py-4">
            <div className="flex items-center gap-3 text-[oklch(58%_0.18_25)]">
              <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="font-mono text-[9.5px] uppercase tracking-[0.2em]">
                danger zone
              </span>
            </div>

            <Row
              title="Redo today's list"
              description="Throws away every item composed for today — including any notes you left on them — and composes a fresh action for each of your active goals. This can't be undone."
            >
              {confirmingRedo ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={regenerate.isPending}
                    onClick={() => setConfirmingRedo(false)}
                    className="rounded-md border border-[var(--color-rule)] px-3 py-1.5 text-[12.5px] text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={regenerate.isPending}
                    onClick={() => {
                      regenerate.mutate(undefined, { onSettled: () => setConfirmingRedo(false) });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[oklch(58%_0.18_25)] px-3 py-1.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {regenerate.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
                    )}
                    {regenerate.isPending ? "Composing…" : "Yes, redo the day"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingRedo(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[oklch(58%_0.18_25)]/50 px-3 py-1.5 text-[12.5px] font-medium text-[oklch(58%_0.18_25)] transition-colors hover:bg-[oklch(58%_0.18_25)]/10"
                >
                  <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
                  Redo today's list
                </button>
              )}
            </Row>

            {regenerate.isError && (
              <div className="mt-3 flex justify-end">
                <span className="text-[11px] text-[oklch(58%_0.18_25)]">
                  Couldn't recompose. Try again.
                </span>
              </div>
            )}
          </section>
        </>
        )}
      </div>
    </div>
  );
}

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor }
];

function ThemePicker({
  value,
  disabled,
  onChange
}: {
  value: Theme;
  disabled?: boolean;
  onChange: (next: Theme) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-[var(--color-rule)] bg-[var(--color-panel)] p-0.5",
        disabled && "opacity-60"
      )}
    >
      {THEME_OPTIONS.map(({ value: optValue, label, Icon }) => {
        const selected = value === optValue;
        return (
          <button
            key={optValue}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(optValue)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[12px] transition-colors",
              selected
                ? "bg-[var(--color-canvas)] text-[var(--color-ink)] shadow-sm"
                : "text-[var(--color-ink-2)] hover:text-[var(--color-ink)]",
              "disabled:cursor-not-allowed"
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** A few solid self-hosted picks; the field still accepts any Ollama tag. */
const MODEL_PRESETS = ["qwen3:32b", "llama3.3:70b", "gpt-oss:120b"];

function ModelField({
  value,
  disabled,
  onCommit
}: {
  value: string | null;
  disabled?: boolean;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");

  // Keep the input in sync when the saved value changes (e.g. another commit).
  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === (value ?? "")) return;
    onCommit(trimmed);
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        type="text"
        value={draft}
        disabled={disabled}
        placeholder="server default"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(value ?? "");
        }}
        className={cn(
          "w-[200px] rounded-md border border-[var(--color-rule)] bg-[var(--color-panel)] px-2.5 py-1.5",
          "font-mono text-[12.5px] text-[var(--color-ink)]",
          "transition focus:border-[var(--color-accent)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      />
      <div className="flex flex-wrap items-center justify-end gap-1">
        {MODEL_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => {
              setDraft(preset);
              if (preset !== (value ?? "")) onCommit(preset);
            }}
            className={cn(
              "rounded border border-[var(--color-rule)] px-1.5 py-0.5 font-mono text-[10.5px] transition-colors",
              value === preset
                ? "bg-[var(--color-canvas)] text-[var(--color-ink)]"
                : "text-[var(--color-ink-3)] hover:text-[var(--color-ink)]",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}

function Row({
  title,
  description,
  dimmed,
  children
}: {
  title: string;
  description: string;
  dimmed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mt-4 flex items-start justify-between gap-6 border-t border-[var(--color-rule)] pt-4",
        dimmed && "opacity-50 transition-opacity"
      )}
    >
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-[var(--color-ink)]">{title}</div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
          {description}
        </p>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[24px] w-[42px] rounded-full transition-colors disabled:opacity-60",
        checked ? "bg-[var(--color-accent)]" : "bg-[var(--color-rule-2)]"
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-[left]",
          checked ? "left-[21px]" : "left-[3px]"
        )}
      />
    </button>
  );
}
