import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar, type View } from "./components/Sidebar";
import { Today } from "./pages/Today";
import { Integrations } from "./pages/Integrations";

export function App() {
  const [view, setView] = useState<View>("today");

  // The sidebar shows the connected count badge — read it from the same
  // query the Integrations page populates, so we don't re-fetch.
  const integrationsQuery = useQuery({
    queryKey: ["integrations"],
    queryFn: () => window.goalpath.integrations.list(),
    staleTime: 60_000
  });

  const connectedCount =
    integrationsQuery.data?.filter((v) => v.status === "connected").length ?? 0;

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar active={view} onSelect={setView} connectedCount={connectedCount} />
      <main key={view} className="relative flex-1 overflow-hidden">
        <div
          className="absolute inset-0 overflow-y-auto"
          style={{ animation: "fade-up 280ms ease-out" }}
        >
          {view === "today" ? <Today /> : <Integrations />}
        </div>
      </main>
    </div>
  );
}
