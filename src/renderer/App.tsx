import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Sidebar, type View } from "./components/Sidebar";
import { MobileNav } from "./components/MobileNav";
import { Today } from "./pages/Today";
import { History } from "./pages/History";
import { Goals } from "./pages/Goals";
import { Integrations } from "./pages/Integrations";
import { Settings } from "./pages/Settings";
import { SuggestionDetail } from "./pages/SuggestionDetail";
import { IconButton } from "./components/ui/IconButton";
import { useApplyTheme } from "./lib/use-theme";
import { useChecklistProgress } from "./lib/use-checklist-progress";
import { isWebMode } from "./lib/api";
import { cn } from "~/lib/cn";

const KNOWN_VIEWS: View[] = ["today", "history", "goals", "integrations", "settings"];

export function App() {
  const [view, setView] = useState<View>("today");
  const [openSuggestionId, setOpenSuggestionId] = useState<string | null>(null);
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

  function selectView(next: View) {
    setView(next);
    setOpenSuggestionId(null);
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
    : `view:${view}`;

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-[var(--color-panel)]">
      <Sidebar active={view} open={sidebarOpen} onSelect={selectView} />
      <main
        key={pageKey}
        className={cn(
          "relative flex-1 overflow-hidden bg-[var(--color-canvas)]",
          sidebarOpen &&
            "md:rounded-tl-xl md:rounded-bl-xl md:shadow-[inset_1px_0_0_var(--color-rule)]"
        )}
      >
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
          ) : view === "today" ? (
            <Today onOpenSuggestion={setOpenSuggestionId} progress={progress} />
          ) : view === "history" ? (
            <History onOpenSuggestion={setOpenSuggestionId} />
          ) : view === "goals" ? (
            <Goals />
          ) : view === "integrations" ? (
            <Integrations />
          ) : (
            <Settings />
          )}
        </div>
      </main>

      <SidebarToggle open={sidebarOpen} onToggle={() => setSidebarOpen((o) => !o)} />
      {!openSuggestionId && <MobileNav active={view} onSelect={selectView} />}
    </div>
  );
}

const TOGGLE_LEFT = isWebMode() ? "left-3" : "left-[78px]";

function SidebarToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const Icon = open ? PanelLeftClose : PanelLeftOpen;
  return (
    <IconButton
      size="md"
      aria-label={open ? "Hide sidebar" : "Show sidebar"}
      title={open ? "Hide sidebar (⌘B)" : "Show sidebar (⌘B)"}
      onClick={onToggle}
      className={cn(
        "no-drag fixed top-[14px] z-50 hidden h-[26px] w-[26px] p-0 md:inline-flex",
        TOGGLE_LEFT,
        "transition-[background-color,border-color,box-shadow] duration-200 ease-out",
        open
          ? // Sits over the sidebar panel — stays borderless so it blends in.
            "hover:bg-[var(--color-panel-2)] active:bg-[var(--color-panel-2)]"
          : // Floats over the canvas — give it a chip so it reads as an
            // intentional control rather than a stray icon.
            "border border-[var(--color-rule)] bg-[var(--color-panel)] shadow-sm hover:bg-[var(--color-panel-2)] active:bg-[var(--color-panel-2)]",
      )}
    >
      <Icon
        key={open ? "close" : "open"}
        className="h-[16px] w-[16px]"
        strokeWidth={1.5}
        style={{ animation: "fade-up 180ms ease-out" }}
      />
    </IconButton>
  );
}
