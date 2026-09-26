import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import "./index.css";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { persister } from "@/lib/persister";
import { AppRoutes } from "./routes";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { setupServiceWorker } from "@/lib/registerSW";

const WEEK = 1000 * 60 * 60 * 24 * 7;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // gcTime MUST be >= the persister's maxAge. It defaults to 5 minutes,
      // so restored entries would be garbage-collected seconds after hydration
      // and the cache would look empty despite being on disk.
      gcTime: WEEK,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

setupServiceWorker();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element in index.html");

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: WEEK,
            dehydrateOptions: {
              shouldDehydrateQuery: (query) => {
                const [root] = query.queryKey as string[];
                // Never persist the live list — a week-old "live now" is a lie.
                // Never persist push state — it is server-owned and endpoint-bound.
                if (root === "push") return false;
                if (query.queryKey.join("/") === "matches/live") return false;

                // Keep anything we hold data for, whatever the query's current
                // status. Gating on success meant a FAILED refetch evicted the
                // very entry offline mode exists to serve: open the app with no
                // connection, the refetch fails, and the match you had saved is
                // deleted from disk. Offline support got worse every time it was
                // used, and the second launch had nothing left to show.
                return query.state.data !== undefined;
              },
            },
          }}
        >
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </PersistQueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
