import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router";
import App from "./App";
import LivePage from "@/pages/LivePage";
import MatchPage from "@/pages/MatchPage";
import NotFoundPage from "@/pages/NotFoundPage";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Lazy: this page is the only consumer of Recharts, which is ~130 KiB that
 * every other route was paying for on first load.
 */
const CompetitionPage = lazy(() => import("@/pages/CompetitionPage"));

function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56 rounded-lg" />
      <Skeleton className="h-[70px] rounded-xl" />
      <Skeleton className="h-[200px] rounded-xl" />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<App />}>
        <Route index element={<LivePage />} />
        <Route path="match/:id" element={<MatchPage />} />
        <Route
          path="competition/:id"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <CompetitionPage />
            </Suspense>
          }
        />
        {/* The service worker serves index.html for every navigation, so a
            stale deep link reaches the router rather than a server 404. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
