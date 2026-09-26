import { buffersEqual, urlBase64ToUint8Array } from "./base64";

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari-only, and absent from the TS DOM lib.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

async function serverPublicKey(): Promise<string> {
  const { key } = (await fetch("/api/push/public-key").then((r) =>
    r.json(),
  )) as { key: string };
  return key;
}

/**
 * The browser's current subscription, or null.
 *
 * If an existing subscription was created with a DIFFERENT VAPID key — which
 * happens the moment the server's keypair is rotated — it is discarded and a
 * new one created. Reusing it would leave the server sending pushes that the
 * push service rejects with 403, silently and forever.
 */
async function currentSubscription(
  create: boolean,
): Promise<PushSubscription | null> {
  // There can be no subscription without permission, and `serviceWorker.ready`
  // never settles when no worker ever activates — so a read on a browser that
  // has blocked notifications would hang forever rather than answer "none".
  // The create path has already checked permission by the time it gets here.
  if (!create && Notification.permission !== "granted") return null;

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();

  if (!create && !existing) return null;

  const key = await serverPublicKey();
  const wanted = urlBase64ToUint8Array(key);

  if (existing) {
    const inUse = existing.options.applicationServerKey;
    if (buffersEqual(inUse, wanted.buffer)) return existing;
    await existing.unsubscribe();
  }

  if (!create) return null;

  return reg.pushManager.subscribe({
    // Required by Chrome: every push must produce a visible notification.
    userVisibleOnly: true,
    applicationServerKey: wanted,
  });
}

/** Which matches this browser is following. Empty if never subscribed. */
export async function followedMatchIds(): Promise<string[]> {
  if (!pushSupported()) return [];
  const sub = await currentSubscription(false);
  if (!sub) return [];

  const res = await fetch("/api/push/following", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  if (!res.ok) return [];
  const { matchIds } = (await res.json()) as { matchIds: string[] };
  return matchIds;
}

/**
 * Ensures permission and a registered subscription, returning its endpoint.
 * Shared by the single and bulk follow paths so the prompting rules live in
 * exactly one place.
 */
async function ensureSubscribed(): Promise<string> {
  if (!pushSupported()) throw new Error("Push not supported in this browser");

  // Only prompt when the user has not already decided. Calling this when
  // permission is 'denied' silently resolves to 'denied' and looks like a bug.
  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notifications denied");
  } else if (Notification.permission !== "granted") {
    throw new Error(
      "Notifications are blocked for this site — enable them in browser settings",
    );
  }

  const sub = await currentSubscription(true);
  if (!sub) throw new Error("Could not create a push subscription");

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });

  return sub.endpoint;
}

export async function followMatch(matchId: string): Promise<void> {
  const endpoint = await ensureSubscribed();
  await fetch(`/api/push/matches/${matchId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

export async function unfollowMatch(matchId: string): Promise<void> {
  const sub = await currentSubscription(false);
  if (!sub) return;

  await fetch(`/api/push/matches/${matchId}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
}

/** One request for the whole set, rather than one per match. */
export async function followMatches(matchIds: string[]): Promise<void> {
  if (matchIds.length === 0) return;
  const endpoint = await ensureSubscribed();
  await fetch("/api/push/matches-bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint, matchIds }),
  });
}

export async function unfollowMatches(matchIds: string[]): Promise<void> {
  if (matchIds.length === 0) return;
  const sub = await currentSubscription(false);
  if (!sub) return;
  await fetch("/api/push/matches-bulk", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint, matchIds }),
  });
}
