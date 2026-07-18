import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@base-ui/react/switch";
import { AlertCircle, AlertTriangle, Bell, Cpu, Loader2, Monitor, Moon, Palette, RotateCw, Settings as SettingsIcon, Sun } from "lucide-react";
import { cn } from "~/lib/cn";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/Modal";
import type { Theme } from "~/shared/schema";
import type { SettingsUpdate } from "~/shared/api";

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
          <span className="font-mono text-2xs uppercase tracking-[0.22em]">
            settings
          </span>
        </div>

        <h1 className="mt-3 text-4xl font-semibold text-[var(--color-ink)]">
          How Komorebi shows up.
        </h1>
        <p className="mt-3 max-w-lg text-base leading-relaxed text-[var(--color-ink-2)]">
          Have your day composed and waiting for you, with a nudge when it's ready.
        </p>
      </header>

      <div className="mt-10 space-y-6">
        {settingsQuery.isError ? (
          <SettingsError
            message={(settingsQuery.error as Error).message ?? "Unknown error"}
            onRetry={() => settingsQuery.refetch()}
          />
        ) : settingsQuery.isLoading || !schedule || !theme ? (
          <div
            className="h-[148px] rounded-xl border border-[var(--color-rule)] bg-[var(--color-panel)]"
            style={{ animation: "fade-up 400ms ease-out" }}
          />
        ) : (
        <>
          <section className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)] px-5 py-4">
            <div className="flex items-center gap-3 text-[var(--color-ink-3)]">
              <Bell className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="font-mono text-2xs uppercase tracking-[0.2em]">
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
                onChange={(enabled) => update.mutate({ schedule: { enabled } })}
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
                onChange={(e) => update.mutate({ schedule: { time: e.target.value } })}
                className={cn(
                  "input w-auto bg-[var(--color-panel)] px-2.5 py-1.5 tabular-nums md:text-base",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              />
            </Row>

            <div className="mt-3 flex h-4 items-center justify-end">
              {update.isPending && (
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink-3)]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving…
                </span>
              )}
              {update.isError && (
                <span className="text-xs text-[var(--color-danger)]">
                  Couldn't save. Try again.
                </span>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)] px-5 py-4">
            <div className="flex items-center gap-3 text-[var(--color-ink-3)]">
              <Palette className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="font-mono text-2xs uppercase tracking-[0.2em]">
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
              <span className="font-mono text-2xs uppercase tracking-[0.2em]">
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

          <section className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-canvas)] px-5 py-4">
            <div className="flex items-center gap-3 text-[var(--color-danger)]">
              <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="font-mono text-2xs uppercase tracking-[0.2em]">
                danger zone
              </span>
            </div>

            <Row
              title="Redo today's list"
              description="Throws away every item composed for today — including any notes you left on them — and composes a fresh action for each of your active goals. This can't be undone."
            >
              <Button
                variant="danger-outline"
                size="sm"
                disabled={regenerate.isPending}
                onClick={() => setConfirmingRedo(true)}
              >
                {regenerate.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
                )}
                {regenerate.isPending ? "Composing…" : "Redo today's list"}
              </Button>
            </Row>

            {regenerate.isError && (
              <div className="mt-3 flex justify-end">
                <span className="text-xs text-[var(--color-danger)]">
                  Couldn't recompose. Try again.
                </span>
              </div>
            )}
          </section>
        </>
        )}
      </div>

      <ConfirmDialog
        open={confirmingRedo}
        onClose={() => setConfirmingRedo(false)}
        onConfirm={() => {
          setConfirmingRedo(false);
          regenerate.mutate();
        }}
        title="Redo today's list?"
        body="Every item composed for today — including any notes you left on them — will be thrown away and replaced with a fresh action for each active goal. This can't be undone."
        confirmLabel="Yes, redo the day"
        confirmIcon={<RotateCw className="h-3.5 w-3.5" strokeWidth={2} />}
      />
    </div>
  );
}

function SettingsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto mt-12 max-w-md text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-rule)] bg-[var(--color-panel)] text-[var(--color-accent-strong)]">
        <AlertCircle className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <h3 className="mt-5 text-2xl font-semibold text-[var(--color-ink)]">
        Couldn't load settings.
      </h3>
      <p className="mt-3 font-mono text-xs text-[var(--color-ink-3)]">{message}</p>
      <button
        onClick={onRetry}
        className="pressable mt-6 rounded-md bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-canvas)] hover:bg-[var(--color-accent)] active:bg-[var(--color-accent)]"
      >
        Try again
      </button>
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
              "pressable inline-flex items-center gap-1.5 rounded px-2.5 py-2 text-sm",
              selected
                ? "bg-[var(--color-canvas)] text-[var(--color-ink)] shadow-sm"
                : "text-[var(--color-ink-2)] hover:text-[var(--color-ink)] active:text-[var(--color-ink)]",
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
          "input w-[200px] bg-[var(--color-panel)] px-2.5 py-1.5 font-mono md:text-sm",
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
              "pressable rounded border border-[var(--color-rule)] px-2 py-1.5 font-mono text-2xs",
              value === preset
                ? "bg-[var(--color-canvas)] text-[var(--color-ink)]"
                : "text-[var(--color-ink-3)] hover:text-[var(--color-ink)] active:text-[var(--color-ink)]",
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
        <div className="text-base font-medium text-[var(--color-ink)]">{title}</div>
        <p className="mt-1 text-sm leading-relaxed text-[var(--color-ink-2)]">
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
    <Switch.Root
      checked={checked}
      disabled={disabled}
      onCheckedChange={(next) => onChange(next)}
      className={cn(
        "pressable hit-target relative block h-[24px] w-[42px] rounded-full",
        "bg-[var(--color-rule-2)] data-[checked]:bg-[var(--color-accent)]",
        "data-[disabled]:opacity-60"
      )}
    >
      <Switch.Thumb
        className={cn(
          "absolute top-[3px] left-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-[left]",
          "data-[checked]:left-[21px]"
        )}
      />
    </Switch.Root>
  );
}
