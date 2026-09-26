import { Link, NavLink, Outlet } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import InstallPrompt from "@/components/InstallPrompt";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationCenter } from "@/components/NotificationCenter";
import { TeamBadge } from "@/components/TeamBadge";
import { competitionBadge, competitionCode } from "@/lib/competitions";
import { useOnline } from "@/hooks/useOnline";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function App() {
  const online = useOnline();

  const { data: competitions } = useQuery({
    queryKey: ["competitions"],
    queryFn: api.competitions,
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="bg-primary text-primary-foreground focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:px-3 focus:py-2 focus:ring-3"
      >
        Skip to content
      </a>

      <header className="bg-background/80 pad-safe-t sticky top-0 z-20 border-b backdrop-blur-md">
        {/* `relative` so the notification dropdown can anchor to the content
            column rather than to the bell, which is not the last item in the
            row and would hang off the left edge on a phone. */}
        <div className="relative mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-2 lg:max-w-4xl">
          <h1 className="shrink-0">
            <Link
              to="/"
              className="focus-visible:ring-ring grid size-9 place-items-center rounded-lg focus-visible:ring-3 focus-visible:outline-none"
            >
              <img
                src="/icon-192.png"
                alt=""
                width={28}
                height={28}
                className="size-7 rounded-md"
              />
              {/* The icon is the brand; screen readers still need the name. */}
              <span className="sr-only">Live Scores — home</span>
            </Link>
          </h1>

          <nav
            aria-label="Competitions"
            className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {competitions?.map((c) => (
              <NavLink
                key={c.id}
                to={`/competition/${c.id}`}
                // Full names ("UEFA Champions League") do not fit beside a
                // badge and two icon buttons on a phone.
                title={c.name}
                className={({ isActive }) =>
                  cn(
                    "focus-visible:ring-ring flex items-center gap-1.5 rounded-full py-1.5 pr-2.5 pl-1.5 text-xs whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:outline-none",
                    isActive
                      ? "bg-secondary text-secondary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                <TeamBadge
                  url={competitionBadge(c.externalId, c.badgeUrl)}
                  size={18}
                  eager
                />
                {/* Short code on phones where the full name would not fit;
                    the real name from sm: up. aria-hidden + sr-only keeps
                    assistive tech on the full name in both cases. */}
                <span className="sm:hidden" aria-hidden="true">
                  {competitionCode(c.externalId, c.name)}
                </span>
                <span className="max-sm:sr-only">{c.name}</span>
              </NavLink>
            ))}
          </nav>

          <NotificationCenter />
          <ThemeToggle />
        </div>
      </header>

      {!online && (
        <div
          role="status"
          className="bg-warning text-warning-foreground flex items-center justify-center gap-2 px-4 py-1.5 text-xs"
        >
          <WifiOff className="size-3.5" aria-hidden="true" />
          Offline — showing saved data
        </div>
      )}

      <main
        id="main"
        className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 lg:max-w-4xl"
      >
        <Outlet />
      </main>

      <InstallPrompt />
    </div>
  );
}
