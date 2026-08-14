import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { cn } from "~/lib/cn";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardFooter } from "../components/ui/Card";
import { ErrorState } from "../components/ui/EmptyState";
import { Input, SegmentedControl, Textarea } from "../components/ui/Field";
import { PageHeader } from "../components/ui/PageHeader";
import { Skeleton } from "../components/ui/Skeleton";
import { Spinner } from "../components/ui/Spinner";
import { Switch } from "../components/ui/Switch";
import { ConfirmDialog } from "../components/ui/Modal";
import type { Theme } from "~/shared/schema";
import type { SettingsUpdate } from "~/shared/api";
import {
  GENERATION_JOBS_KEY,
  isActiveGenerationJob,
  showQueuedFeedback,
  showQueueError
} from "../lib/use-generation-feedback";

export function Settings() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => window.komorebi.settings.get()
  });

  const update = useMutation({
    mutationFn: (patch: SettingsUpdate) => window.komorebi.settings.update(patch),
    onSuccess: (next, patch) => {
      queryClient.setQueryData(["settings"], next);
      if ("ollamaHost" in patch) {
        toast.success(
          next.ollamaHost
            ? "Ollama host updated"
            : "Using the server's default Ollama host"
        );
      }
    },
    onError: (error, patch) => {
      if ("ollamaHost" in patch) {
        toast.error("Couldn't update the Ollama host", {
          description: error instanceof Error ? error.message : "Try again."
        });
      }
    }
  });

  const regenerate = useMutation({
    mutationFn: () =>
      window.komorebi.generation.enqueueChecklistRegeneration({
        requestId: crypto.randomUUID()
      }),
    onSuccess: showQueuedFeedback,
    onError: showQueueError
  });
  const generationJobsQuery = useQuery({
    queryKey: GENERATION_JOBS_KEY,
    queryFn: () => window.komorebi.generation.recentJobs(20)
  });
  const regenerationActive = (generationJobsQuery.data ?? []).some(
    (job) => job.kind === "checklist-regenerate" && isActiveGenerationJob(job)
  );

  const [confirmingRedo, setConfirmingRedo] = useState(false);

  const memoryQuery = useQuery({
    queryKey: ["coach", "memory"],
    queryFn: () => window.komorebi.coach.memory()
  });

  const schedule = settingsQuery.data?.schedule;
  const theme = settingsQuery.data?.theme;
  const model = settingsQuery.data?.model ?? null;
  const ollamaHost = settingsQuery.data?.ollamaHost ?? null;
  const profile = settingsQuery.data?.profile ?? null;

  const redoing = regenerate.isPending || regenerationActive;

  return (
    <div className="page">
      <PageHeader
        title="Settings"
        description="How your day gets composed, who it sounds like, and where the model runs."
      />

      <div className="mt-8 space-y-6">
        {settingsQuery.isError ? (
          <ErrorState
            title="Couldn't load your settings."
            message={(settingsQuery.error as Error).message ?? "Unknown error"}
            onRetry={() => void settingsQuery.refetch()}
            retrying={settingsQuery.isFetching}
          />
        ) : settingsQuery.isLoading || !schedule || !theme ? (
          <>
            <Skeleton className="h-[196px] rounded-xl" />
            <Skeleton className="h-[232px] rounded-xl" />
          </>
        ) : (
          <>
            <Card>
              <CardBody
                title="Daily schedule"
                description="Komorebi composes tomorrow's checklist in the background and notifies you when it's ready, so the day is waiting for you rather than the other way around."
              >
                <div className="divide-y divide-alpha-400 border-y border-alpha-400">
                  <SettingRow
                    label="Compose each morning"
                    hint="Runs whether or not the app is open."
                  >
                    <Switch
                      label="Compose each morning"
                      checked={schedule.enabled}
                      disabled={update.isPending}
                      onChange={(enabled) => update.mutate({ schedule: { enabled } })}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Time of day"
                    hint="Local time, in your browser's timezone."
                    dimmed={!schedule.enabled}
                  >
                    <Input
                      type="time"
                      aria-label="Time of day"
                      value={schedule.time}
                      disabled={!schedule.enabled || update.isPending}
                      onChange={(e) => update.mutate({ schedule: { time: e.target.value } })}
                      className="w-auto tabular-nums"
                    />
                  </SettingRow>
                </div>
              </CardBody>
              <CardFooter note={update.isError ? undefined : "Saved as you change it."}>
                {update.isPending && (
                  <span className="inline-flex items-center gap-2 text-copy-13 text-gray-900">
                    <Spinner size={14} />
                    Saving
                  </span>
                )}
                {update.isError && (
                  <span className="text-copy-13 text-red-900">Couldn't save. Try again.</span>
                )}
              </CardFooter>
            </Card>

            <TextSettingCard
              title="What you want, in your own words"
              description={`Priorities, constraints, taste — “ship a game by December, evenings only, I learn by building, keep tasks under 30 minutes.” This sits in front of the model above everything it infers from your history.`}
              note="Applies to every task composed from now on."
              value={profile ?? ""}
              placeholder="Tell your coach what you actually want…"
              multiline
              maxLength={2000}
              saving={update.isPending}
              onCommit={(next) => update.mutate({ profile: next })}
            />

            <Card>
              <CardBody
                title="What your coach has learned"
                description="Distilled at most once a day from your ratings, skip reasons and notes, then fed into every generation. It rewrites itself as your feedback accumulates."
              >
                {memoryQuery.data?.markdown ? (
                  <p className="max-w-2xl text-copy-14 whitespace-pre-line text-gray-1000">
                    {memoryQuery.data.markdown}
                  </p>
                ) : (
                  <p className="text-copy-14 text-gray-700">
                    Nothing yet. Rate, skip and leave notes on a few tasks, and your coach
                    will start keeping notes with tomorrow's checklist.
                  </p>
                )}
              </CardBody>
              {memoryQuery.data?.updatedDate && (
                <CardFooter note={`Last updated ${memoryQuery.data.updatedDate}.`} />
              )}
            </Card>

            <Card>
              <CardBody
                title="Appearance"
                description="System follows your device. Dark is a true black, so the app disappears into a dim room instead of glowing in it."
              >
                <SegmentedControl
                  label="Theme"
                  value={theme}
                  options={THEME_OPTIONS}
                  disabled={update.isPending}
                  onChange={(next) => update.mutate({ theme: next })}
                />
              </CardBody>
            </Card>

            <TextSettingCard
              title="Ollama host"
              description="The address Komorebi generates against. Inside Docker this has to be reachable from the container — usually your Ollama machine's LAN address, not localhost."
              note="Leave blank to use the server's own host."
              value={ollamaHost ?? ""}
              placeholder="http://192.168.1.20:11434"
              mono
              validate={validateHost}
              saving={update.isPending}
              onCommit={(next) => update.mutate({ ollamaHost: next || null })}
            />

            <TextSettingCard
              title="Composer model"
              description="The model that drafts each suggestion. Bigger instruction-tuned models find better resources and hold your context more faithfully. It must already be pulled on the host above."
              note="Leave blank to use the server's default model."
              value={model ?? ""}
              placeholder="qwen3:32b"
              mono
              presets={MODEL_PRESETS}
              saving={update.isPending}
              onCommit={(next) => update.mutate({ model: next })}
            />

            <Card tone="error">
              <CardBody
                title="Redo today's list"
                description="Throws away every item composed for today, including the notes you left on them, and composes a fresh action for each active goal."
              />
              <CardFooter note="This can't be undone.">
                <Button
                  variant="error-secondary"
                  size="sm"
                  loading={redoing}
                  onClick={() => setConfirmingRedo(true)}
                >
                  Redo today's list
                </Button>
              </CardFooter>
            </Card>
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
        body="Every item composed for today, including any notes you left on them, will be thrown away and replaced with a fresh action for each active goal. This can't be undone."
        confirmLabel="Redo the day"
      />
    </div>
  );
}

/**
 * One setting inside a card: what it is on the left, the control on the
 * right. Peer rows share the label, hint and control positions exactly, so
 * a column of them reads as a single object.
 */
function SettingRow({
  label,
  hint,
  dimmed,
  children
}: {
  label: string;
  hint?: string;
  /** The setting has no effect right now, but is still worth showing. */
  dimmed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-6 py-3.5",
        dimmed && "opacity-50 transition-opacity"
      )}
    >
      <div className="min-w-0">
        <div className="text-label-14 font-medium text-gray-1000">{label}</div>
        {hint && <p className="mt-0.5 text-copy-13 text-gray-900">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/**
 * A card whose whole job is one text value: the control in the body, the
 * commitment in the footer. Editing is explicit — nothing is written while
 * you're mid-sentence — and Discard appears only once there's something to
 * discard.
 */
function TextSettingCard({
  title,
  description,
  note,
  value,
  placeholder,
  mono,
  multiline,
  maxLength,
  presets,
  saving,
  validate,
  onCommit
}: {
  title: string;
  description: string;
  note: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  multiline?: boolean;
  maxLength?: number;
  /** Tap-to-fill suggestions; the field still accepts anything. */
  presets?: string[];
  saving?: boolean;
  /** Returns an error message, or null when the draft is committable. */
  validate?: (draft: string) => string | null;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the saved value changes underneath us (another commit, or a
  // refetch), so the field never shows a stale draft as if it were saved.
  useEffect(() => {
    setDraft(value);
    setError(null);
  }, [value]);

  const trimmed = draft.trim();
  const dirty = trimmed !== value;

  const commit = () => {
    const message = validate?.(trimmed) ?? null;
    setError(message);
    if (message) return;
    onCommit(trimmed);
  };

  const discard = () => {
    setDraft(value);
    setError(null);
  };

  return (
    <Card>
      <CardBody title={title} description={description}>
        {multiline ? (
          <Textarea
            value={draft}
            rows={4}
            maxLength={maxLength}
            placeholder={placeholder}
            invalid={Boolean(error)}
            className="max-w-2xl"
            onChange={(e) => setDraft(e.target.value)}
          />
        ) : (
          <Input
            value={draft}
            mono={mono}
            maxLength={maxLength}
            placeholder={placeholder}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            invalid={Boolean(error)}
            className="max-w-md"
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dirty) commit();
              if (e.key === "Escape") discard();
            }}
          />
        )}

        {error && <p className="mt-2 text-copy-13 text-red-900">{error}</p>}

        {presets && presets.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {presets.map((preset) => (
              <Button
                key={preset}
                variant="secondary"
                size="xs"
                className="font-mono"
                aria-pressed={value === preset}
                onClick={() => {
                  setDraft(preset);
                  setError(null);
                  if (preset !== value) onCommit(preset);
                }}
              >
                {preset}
              </Button>
            ))}
          </div>
        )}
      </CardBody>

      <CardFooter note={note}>
        {dirty && (
          <Button variant="tertiary" size="sm" onClick={discard}>
            Discard
          </Button>
        )}
        <Button size="sm" disabled={!dirty} loading={saving && dirty} onClick={commit}>
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

/** Blank means "fall back to the server", so only non-empty input is checked. */
function validateHost(draft: string): string | null {
  if (!draft) return null;
  try {
    const parsed = new URL(draft.replace(/\/+$/, ""));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    if (!parsed.hostname) throw new Error();
  } catch {
    return "Enter a complete http:// or https:// address, including the port.";
  }
  return null;
}

const THEME_OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor }
];

/** A few solid self-hosted picks; the field still accepts any Ollama tag. */
const MODEL_PRESETS = ["qwen3:32b", "llama3.3:70b", "gpt-oss:120b"];
