/**
 * Short codes for the tracked competitions, keyed by TheSportsDB league id.
 *
 * Full names ("UEFA Champions League") do not fit a phone header alongside a
 * badge and two icon buttons. These are the abbreviations fans actually use.
 */
const SHORT_CODES: Record<string, string> = {
  "4480": "CL",
  "4331": "BL",
  "4328": "EPL",
};

/**
 * Locally bundled badges for the tracked competitions, downscaled to 128px
 * (ample at 3x DPI for an 18–24px slot) and served from our own origin.
 *
 * Bundling these removes the whole class of problems a remote CDN brings to a
 * header logo: no third-party request on first paint, no cross-origin opaque
 * response for the service worker to mishandle, and they are precached, so
 * they render offline and on the very first load rather than popping in.
 *
 * Untracked competitions still fall back to the CDN URL the poller stored —
 * there are dozens of them and they change constantly, so bundling is only
 * worth it for the three that are always on screen.
 */
const LOCAL_BADGES: Record<string, string> = {
  "4480": "/leagues/cl.png",
  "4331": "/leagues/bl.png",
  "4328": "/leagues/epl.png",
};

export function competitionCode(externalId: string, name: string): string {
  const known = SHORT_CODES[externalId];
  if (known) return known;
  // Initials, so a competition we have no code for still gets something
  // compact rather than a wrapped full name.
  return (
    name
      .split(/\s+/)
      .filter((w) => /^[A-Z0-9]/.test(w))
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || name.slice(0, 3).toUpperCase()
  );
}

/** Local asset when we bundle one, otherwise whatever the API supplied. */
export function competitionBadge(
  externalId: string,
  remote: string | null,
): string | null {
  return LOCAL_BADGES[externalId] ?? remote;
}
