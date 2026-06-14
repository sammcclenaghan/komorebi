import type { IntegrationView } from "~/main/integrations/service";
import type { ConnectionSummary } from "~/main/integrations/composio";
import type { ChecklistDay, GenerationProgress, HistoryDay } from "~/main/checklist/orchestrator";
import type { AppSettings, Goal, GoalPriority, Reflection, Suggestion, SuggestionRating, SuggestionStatus } from "~/shared/types";
import type { SettingsUpdate } from "~/main/store/settings";
import type { WeatherSummary } from "~/main/weather/service";
import type { LinkPreview } from "~/main/links/preview";

export type KomorebiApi = {
  getVersion: () => Promise<string>;
  integrations: {
    list: () => Promise<IntegrationView[]>;
    refresh: () => Promise<ConnectionSummary[]>;
    beginConnect: (slug: string) => Promise<{ connectionId: string; redirectUrl: string | null }>;
    awaitConnect: (slug: string) => Promise<ConnectionSummary | null>;
    disconnect: (slug: string) => Promise<void>;
  };
  goals: {
    list: () => Promise<Goal[]>;
    add: (input: {
      title: string;
      description?: string;
      context?: string;
      priority?: GoalPriority;
    }) => Promise<Goal>;
    update: (input: {
      id: string;
      updates: Partial<Pick<Goal, "title" | "description" | "context" | "status" | "priority">>;
    }) => Promise<Goal>;
    delete: (id: string) => Promise<void>;
  };
  checklist: {
    today: () => Promise<ChecklistDay>;
    generate: () => Promise<ChecklistDay>;
    onProgress: (handler: (event: GenerationProgress) => void) => () => void;
  };
  suggestions: {
    get: (id: string) => Promise<Suggestion | null>;
    setStatus: (input: { id: string; status: SuggestionStatus }) => Promise<Suggestion>;
    setRating: (input: { id: string; rating: SuggestionRating }) => Promise<Suggestion>;
    skipAndRegenerate: (id: string) => Promise<Suggestion>;
  };
  reflections: {
    list: (suggestionId: string) => Promise<Reflection[]>;
    add: (input: {
      suggestionId: string;
      text: string;
      rating?: "up" | "down" | null;
    }) => Promise<Reflection>;
  };
  weather: {
    current: (location: string) => Promise<WeatherSummary | null>;
  };
  links: {
    preview: (url: string) => Promise<LinkPreview>;
  };
  history: {
    list: (daysBack?: number) => Promise<HistoryDay[]>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    update: (update: SettingsUpdate) => Promise<AppSettings>;
  };
  onNavigate: (handler: (view: string) => void) => () => void;
};
