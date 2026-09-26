import { get, set } from "idb-keyval";

export type StoredNotification = {
  id: string;
  title: string;
  body: string;
  matchId: string;
  /** Epoch ms. */
  at: number;
  read: boolean;
};

const KEY = "livescore-notifications";
/** Keep the list useful, not exhaustive. */
const MAX = 50;

/** Broadcast so an open tab updates without polling IndexedDB. */
export const NOTIFICATION_MESSAGE = "livescore:notification";

/**
 * IndexedDB rather than localStorage because the SERVICE WORKER writes here
 * too — pushes arrive when no page is open, and a worker has no access to
 * localStorage at all.
 */
export async function listNotifications(): Promise<StoredNotification[]> {
  try {
    return (await get<StoredNotification[]>(KEY)) ?? [];
  } catch {
    return [];
  }
}

export async function addNotification(
  n: Omit<StoredNotification, "read">,
): Promise<void> {
  try {
    const all = await listNotifications();
    // Push services can redeliver; the id is deterministic per event.
    if (all.some((x) => x.id === n.id)) return;
    await set(KEY, [{ ...n, read: false }, ...all].slice(0, MAX));
  } catch {
    // Storage unavailable (private mode) — the notification still displays,
    // it just is not recorded.
  }
}

export async function markAllRead(): Promise<void> {
  const all = await listNotifications();
  await set(
    KEY,
    all.map((n) => ({ ...n, read: true })),
  );
}

export async function clearNotifications(): Promise<void> {
  await set(KEY, []);
}

/**
 * The Badging API lives on both Navigator (page) and WorkerNavigator (service
 * worker), but TypeScript declares it on neither.
 */
type BadgeNavigator = {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * Keep the home-screen icon badge equal to the UNREAD notification count.
 *
 * It previously tracked the number of live matches, which meant the red dot
 * on iOS never went away no matter what the user did in the app — clearing
 * notifications could not affect a number that was never about them.
 *
 * Called from the page AND from the service worker (where `navigator` is the
 * worker's own), so a push arriving with the app closed still updates it.
 */
export async function syncAppBadge(scope: {
  navigator: Navigator | WorkerNavigator;
}): Promise<void> {
  const nav = scope.navigator as BadgeNavigator;
  if (!nav.setAppBadge || !nav.clearAppBadge) return;
  try {
    const unread = (await listNotifications()).filter((n) => !n.read).length;
    await (unread > 0 ? nav.setAppBadge(unread) : nav.clearAppBadge());
  } catch {
    // Badging is unsupported or blocked — non-fatal.
  }
}
