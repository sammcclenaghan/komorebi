import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Sidebar, type View } from "./components/Sidebar";
import { Today } from "./pages/Today";
import { History } from "./pages/History";
import { Goals } from "./pages/Goals";
import { Integrations } from "./pages/Integrations";
import { Settings } from "./pages/Settings";
import { SuggestionDetail } from "./pages/SuggestionDetail";
import { useApplyTheme } from "./lib/use-theme";
import { cn } from "~/lib/cn";

const KNOWN_VIEWS: View[] = ["today", "history", "goals", "integrations", "settings"];

export function App() {
  const [view, setView] = useState<View>("today");
  const [openSuggestionId, setOpenSuggestionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useApplyTheme();

  function selectView(next: View) {
    setView(next);
    setOpenSuggestionId(null);
  }

  // The main process asks us to navigate when a notification is clicked.
  useEffect(() => {
    return window.komorebi.onNavigate((next) => {
      if ((KNOWN_VIEWS as string[]).includes(next)) {
        selectView(next as View);
      }
    });
  }, []);

  // ⌘B / Ctrl+B toggles the sidebar — matches the convention from VS Code,
  // Cursor, Linear, Codex, etc.
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
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-panel)]">
      <Sidebar active={view} open={sidebarOpen} onSelect={selectView} />
      <main
        key={pageKey}
        className={cn(
          "relative flex-1 overflow-hidden bg-[var(--color-canvas)]",
          // Rounded inner edge + hairline are only meaningful when the
          // sidebar is open and there's a panel surface to bleed into.
          sidebarOpen &&
            "rounded-tl-xl rounded-bl-xl shadow-[inset_1px_0_0_var(--color-rule)]"
        )}
      >
        <div
          className="absolute inset-0 overflow-y-auto"
          style={{ animation: "fade-up 240ms ease-out" }}
        >
          {openSuggestionId ? (
            <SuggestionDetail
              suggestionId={openSuggestionId}
              onBack={() => setOpenSuggestionId(null)}
            />
          ) : view === "today" ? (
            <Today onOpenSuggestion={setOpenSuggestionId} />
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
    </div>
  );
}

/**
 * Floats at a fixed screen position just to the right of the macOS traffic
 * lights — sits over the sidebar when open, over the main viewport when
 * collapsed. The icon swaps (and crossfades) between open/close states.
 */
function SidebarToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const Icon = open ? PanelLeftClose : PanelLeftOpen;
  return (
    <button
      onClick={onToggle}
      title={open ? "Hide sidebar (⌘B)" : "Show sidebar (⌘B)"}
      aria-label={open ? "Hide sidebar" : "Show sidebar"}
      className={cn(
        "no-drag fixed left-[78px] top-[14px] z-50",
        "inline-flex h-[26px] w-[26px] items-center justify-center rounded-md",
        "text-[var(--color-ink-3)] transition-colors",
        "hover:bg-[var(--color-panel-2)] hover:text-[var(--color-ink)]"
      )}
    >
      {/* `key` forces React to remount on toggle, retriggering the fade-up
          keyframe so the icon swap reads as a real transition. */}
      <Icon
        key={open ? "close" : "open"}
        className="h-[16px] w-[16px]"
        strokeWidth={1.5}
        style={{ animation: "fade-up 180ms ease-out" }}
      />
    </button>
  );
}
