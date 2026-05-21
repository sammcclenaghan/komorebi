import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar, type View } from "./components/Sidebar";
import { Today } from "./pages/Today";
import { Goals } from "./pages/Goals";
import { Integrations } from "./pages/Integrations";
import { SuggestionDetail } from "./pages/SuggestionDetail";

export function App() {
  const [view, setView] = useState<View>("today");
  const [openSuggestionId, setOpenSuggestionId] = useState<string | null>(null);

  const integrationsQuery = useQuery({
    queryKey: ["integrations"],
    queryFn: () => window.goalpath.integrations.list(),
    staleTime: 60_000
  });
  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: () => window.goalpath.goals.list(),
    staleTime: 30_000
  });

  const connectedCount =
    integrationsQuery.data?.filter((v) => v.status === "connected").length ?? 0;
  const goalCount = goalsQuery.data?.filter((g) => g.status === "active").length ?? 0;

  function selectView(next: View) {
    setView(next);
    setOpenSuggestionId(null);
  }

  const pageKey = openSuggestionId
    ? `suggestion:${openSuggestionId}`
    : `view:${view}`;

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        active={view}
        onSelect={selectView}
        connectedCount={connectedCount}
        goalCount={goalCount}
      />
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
