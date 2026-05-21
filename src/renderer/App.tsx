import { useState } from "react";
import { Sidebar, type View } from "./components/Sidebar";
import { Today } from "./pages/Today";
import { History } from "./pages/History";
import { Goals } from "./pages/Goals";
import { Integrations } from "./pages/Integrations";
import { SuggestionDetail } from "./pages/SuggestionDetail";

export function App() {
  const [view, setView] = useState<View>("today");
  const [openSuggestionId, setOpenSuggestionId] = useState<string | null>(null);

  function selectView(next: View) {
    setView(next);
    setOpenSuggestionId(null);
  }

  const pageKey = openSuggestionId
    ? `suggestion:${openSuggestionId}`
    : `view:${view}`;

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar active={view} onSelect={selectView} />
      <main key={pageKey} className="relative flex-1 overflow-hidden">
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
          ) : (
            <Integrations />
          )}
        </div>
      </main>
    </div>
  );
}
