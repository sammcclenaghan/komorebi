import { useEffect, useState } from "react";
import { PanelLeftOpen } from "lucide-react";
import { Sidebar, type View } from "./components/Sidebar";
import { MobileNav } from "./components/MobileNav";
import { Today } from "./pages/Today";
import { History } from "./pages/History";
import { Goals } from "./pages/Goals";
import { Settings } from "./pages/Settings";
import { SuggestionDetail } from "./pages/SuggestionDetail";
import { PathDetail } from "./pages/PathDetail";
import { IconButton } from "./components/ui/IconButton";
import { useApplyTheme } from "./lib/use-theme";
import { useChecklistProgress } from "./lib/use-checklist-progress";
import { useGenerationFeedback } from "./lib/use-generation-feedback";
import { cn } from "~/lib/cn";

const KNOWN_VIEWS: View[] = ["today", "history", "goals", "settings"];

export function App() {
  const [view, setView] = useState<View>("today");
  const [openSuggestionId, setOpenSuggestionId] = useState<string | null>(null);
  const [openPathGoalId, setOpenPathGoalId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("komorebi.sidebarOpen");
      if (saved != null) return saved === "true";
    } catch {
      /* storage unavailable — fall through */
    }
    return true;
  });

  useEffect(() => {
    try {
      localStorage.setItem("komorebi.sidebarOpen", String(sidebarOpen));
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [sidebarOpen]);

  useApplyTheme();

  // Lives here (not in Today) so generation progress keeps flowing — and the
  // checklist cache keeps getting invalidated — while the user is on another
  // page. Pages remount on navigation via the keyed <main> below.
  const progress = useChecklistProgress();
  useGenerationFeedback();

  function selectView(next: View) {
    setView(next);
    setOpenSuggestionId(null);
    setOpenPathGoalId(null);
  }

  useEffect(() => {
    return window.komorebi.onNavigate((next) => {
      if ((KNOWN_VIEWS as string[]).includes(next)) {
        selectView(next as View);
      }
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pageKey = openSuggestionId
    ? `suggestion:${openSuggestionId}`
    : openPathGoalId ? `path:${openPathGoalId}` : `view:${view}`;

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-background-100">
      <Sidebar
        active={view}
        open={sidebarOpen}
        onSelect={selectView}
        onToggle={() => setSidebarOpen((o) => !o)}
      />
      <main key={pageKey} className="relative min-w-0 flex-1 overflow-hidden">
        <div
          className="absolute inset-0 overflow-y-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0"
          style={{
            animation: openSuggestionId
              ? "fade-up 240ms var(--ease-out-strong)"
              : "fade-in 120ms ease-out",
          }}
        >
          {openSuggestionId ? (
            <SuggestionDetail
              suggestionId={openSuggestionId}
              onBack={() => setOpenSuggestionId(null)}
            />
          ) : openPathGoalId ? <PathDetail goalId={openPathGoalId} onBack={()=>setOpenPathGoalId(null)}/> : view === "today" ? (
            <Today
              onOpenSuggestion={setOpenSuggestionId}
              onOpenPath={setOpenPathGoalId}
              progress={progress}
            />
          ) : view === "history" ? (
            <History onOpenSuggestion={setOpenSuggestionId} />
          ) : view === "goals" ? (
            <Goals onOpenPath={setOpenPathGoalId} />
          ) : (
            <Settings />
          )}
        </div>
      </main>

      {/* Only needed while the rail is hidden — the open sidebar carries its
          own collapse control in its header. */}
      {!sidebarOpen && (
        <IconButton
          size="lg"
          aria-label="Show sidebar"
          title="Show sidebar (⌘B)"
          onClick={() => setSidebarOpen(true)}
          className={cn(
            "fixed top-3 left-3 z-50 hidden md:inline-flex",
            "border border-alpha-400 bg-background-100 shadow-sm"
          )}
        >
          <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
        </IconButton>
      )}
      {!openSuggestionId && <MobileNav active={view} onSelect={selectView} />}
    </div>
  );
}
