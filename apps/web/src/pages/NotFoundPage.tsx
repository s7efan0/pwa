import { Link } from "react-router";
import { Button } from "@/components/ui/button";

/**
 * The service worker serves index.html for every navigation, so a stale or
 * mistyped deep link reaches the router rather than a 404 from the server.
 * Without this route it matches nothing and React Router renders null.
 */
export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="text-muted-foreground font-mono text-sm">404</p>
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="text-muted-foreground max-w-xs text-sm">
        That match or competition doesn&rsquo;t exist, or the link is out of
        date.
      </p>
      <Button render={<Link to="/" />}>Back to live scores</Button>
    </div>
  );
}
