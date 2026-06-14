import type { KomorebiApi } from "~/shared/komorebi-api";
import type { GenerationProgress } from "~/main/checklist/orchestrator";

const TOKEN_KEY = "komorebi-api-token";

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeApiToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit & { search?: Record<string, string | number | undefined> }
): Promise<T> {
  const params = new URLSearchParams();
  if (init?.search) {
    for (const [key, value] of Object.entries(init.search)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
  }

  const qs = params.toString();
  const url = `${import.meta.env.VITE_API_BASE ?? ""}${path}${qs ? `?${qs}` : ""}`;
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function openRedirect(url: string | null): void {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function createHttpClient(): KomorebiApi {
  const navigateHandlers = new Set<(view: string) => void>();
  let progressSource: EventSource | null = null;
  const progressHandlers = new Set<(event: GenerationProgress) => void>();

  function ensureProgressSource(): EventSource {
    if (progressSource) return progressSource;

    const token = getToken();
    const base = import.meta.env.VITE_API_BASE ?? "";
    const url = token
      ? `${base}/api/checklist/progress?token=${encodeURIComponent(token)}`
      : `${base}/api/checklist/progress`;

    // EventSource can't set Authorization — use query param fallback when token is set.
    progressSource = new EventSource(url);

    progressSource.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as GenerationProgress;
        for (const handler of progressHandlers) handler(event);
      } catch (err) {
        console.error("[komorebi] progress parse failed:", err);
      }
    };

    progressSource.onerror = () => {
      progressSource?.close();
      progressSource = null;
      setTimeout(() => {
        if (progressHandlers.size > 0) ensureProgressSource();
      }, 2000);
    };

    return progressSource;
  }

  return {
    getVersion: () => apiFetch<string>("/api/version"),

    integrations: {
      list: () => apiFetch("/api/integrations"),
      refresh: () => apiFetch("/api/integrations/refresh", { method: "POST" }),
      beginConnect: async (slug) => {
        const result = await apiFetch<{ connectionId: string; redirectUrl: string | null }>(
          `/api/integrations/${encodeURIComponent(slug)}/connect`,
          { method: "POST" }
        );
        openRedirect(result.redirectUrl);
        return result;
      },
      awaitConnect: (slug) =>
        apiFetch(`/api/integrations/${encodeURIComponent(slug)}/await`, { method: "POST" }),
      disconnect: (slug) =>
        apiFetch(`/api/integrations/${encodeURIComponent(slug)}/disconnect`, { method: "POST" })
    },

    goals: {
      list: () => apiFetch("/api/goals"),
      add: (input) => apiFetch("/api/goals", { method: "POST", body: JSON.stringify(input) }),
      update: (input) =>
        apiFetch(`/api/goals/${encodeURIComponent(input.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ updates: input.updates })
        }),
      delete: (id) =>
        apiFetch(`/api/goals/${encodeURIComponent(id)}`, { method: "DELETE" })
    },

    checklist: {
      today: () => apiFetch("/api/checklist/today"),
      generate: () => apiFetch("/api/checklist/generate", { method: "POST" }),
      onProgress: (handler) => {
        progressHandlers.add(handler);
        ensureProgressSource();
        return () => {
          progressHandlers.delete(handler);
          if (progressHandlers.size === 0) {
            progressSource?.close();
            progressSource = null;
          }
        };
      }
    },

    suggestions: {
      get: (id) => apiFetch(`/api/suggestions/${encodeURIComponent(id)}`),
      setStatus: (input) =>
        apiFetch(`/api/suggestions/${encodeURIComponent(input.id)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: input.status })
        }),
      setRating: (input) =>
        apiFetch(`/api/suggestions/${encodeURIComponent(input.id)}/rating`, {
          method: "PATCH",
          body: JSON.stringify({ rating: input.rating })
        }),
      skipAndRegenerate: (id) =>
        apiFetch(`/api/suggestions/${encodeURIComponent(id)}/skip-regenerate`, { method: "POST" })
    },

    reflections: {
      list: (suggestionId) =>
        apiFetch(`/api/reflections/${encodeURIComponent(suggestionId)}`),
      add: (input) =>
        apiFetch("/api/reflections", { method: "POST", body: JSON.stringify(input) })
    },

    weather: {
      current: (location) =>
        apiFetch("/api/weather/current", { search: { location } })
    },

    links: {
      preview: (url) => apiFetch("/api/links/preview", { search: { url } })
    },

    history: {
      list: (daysBack) => apiFetch("/api/history", { search: { daysBack } })
    },

    settings: {
      get: () => apiFetch("/api/settings"),
      update: (update) =>
        apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify(update) })
    },

    onNavigate: (handler) => {
      navigateHandlers.add(handler);
      return () => navigateHandlers.delete(handler);
    }
  };
}

export function bootstrapWebApi(): void {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token) {
    storeApiToken(token);
    params.delete("token");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);
  }

  window.komorebi = createHttpClient();
}

export function isWebMode(): boolean {
  return import.meta.env.VITE_KOMOREBI_WEB === "true";
}
