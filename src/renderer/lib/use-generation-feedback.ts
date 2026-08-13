import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { GenerationJobView } from "~/shared/api";

export function useGenerationFeedback(): void {
  const queryClient = useQueryClient();
  const previous = useRef<Map<string, GenerationJobView>>(new Map());
  const initialized = useRef(false);
  const jobsQuery = useQuery({
    queryKey: ["generation", "jobs"],
    queryFn: () => window.komorebi.generation.recentJobs(20),
    refetchInterval: 2_000,
    refetchIntervalInBackground: true
  });

  useEffect(() => {
    if (!jobsQuery.data) return;

    const next = new Map(jobsQuery.data.map((job) => [job.id, job]));
    for (const job of jobsQuery.data) {
      const prior = previous.current.get(job.id);
      const changed = prior?.status !== job.status || prior?.updatedAt !== job.updatedAt;

      if (!initialized.current && isTerminal(job)) continue;
      if (!changed && initialized.current) continue;

      showJobFeedback(job);

      if (job.status === "succeeded") {
        void queryClient.invalidateQueries({ queryKey: ["checklist", "today"] });
        void queryClient.invalidateQueries({ queryKey: ["checklist", "stats"] });
      }
    }

    previous.current = next;
    initialized.current = true;
  }, [jobsQuery.data, queryClient]);
}

export function showQueuedFeedback(job: GenerationJobView): void {
  toast.loading("Safely queued", {
    id: job.id,
    description: "You can leave this page. Komorebi will keep working."
  });
}

export function showQueueError(error: unknown): void {
  toast.error("Couldn’t safely queue that yet", {
    description: error instanceof Error ? error.message : "Check the connection and try again.",
    duration: 8_000
  });
}

function showJobFeedback(job: GenerationJobView): void {
  switch (job.status) {
    case "queued":
      showQueuedFeedback(job);
      break;
    case "running":
      toast.loading("Composing today’s plan", {
        id: job.id,
        description:
          job.attemptCount > 1
            ? `Recovered and working again · attempt ${job.attemptCount}`
            : "Progress is saved automatically."
      });
      break;
    case "retry_wait":
      toast.loading("Waiting to try again", {
        id: job.id,
        description: retryDescription(job)
      });
      break;
    case "succeeded":
      toast.success("Today’s plan is ready", {
        id: job.id,
        description: "Everything was saved successfully.",
        duration: 5_000
      });
      break;
    case "failed":
      toast.error("Komorebi needs your attention", {
        id: job.id,
        description: job.errorMessage ?? "This job could not continue automatically.",
        duration: Infinity,
        closeButton: true
      });
      break;
  }
}

function retryDescription(job: GenerationJobView): string {
  const retryAt = new Date(job.availableAt);
  const time = Number.isNaN(retryAt.getTime())
    ? "soon"
    : retryAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${job.errorMessage ?? "A dependency is temporarily unavailable."} Retrying at ${time}.`;
}

function isTerminal(job: GenerationJobView): boolean {
  return job.status === "succeeded" || job.status === "failed";
}
