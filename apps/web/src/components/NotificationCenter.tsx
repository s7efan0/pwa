import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Bell, Inbox, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearNotifications,
  listNotifications,
  markAllRead,
  NOTIFICATION_MESSAGE,
  syncAppBadge,
  type StoredNotification,
} from "@/lib/notifications";

function timeAgo(at: number): string {
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function NotificationCenter() {
  const [items, setItems] = useState<StoredNotification[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    void listNotifications().then((n) => {
      setItems(n);
      // The home-screen icon badge must track what the user sees here.
      void syncAppBadge(window);
    });
  }, []);

  useEffect(() => {
    refresh();

    // The service worker writes to IndexedDB when a push arrives — including
    // while no tab is focused — then posts this message so an open tab
    // updates immediately instead of waiting for the next mount.
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === NOTIFICATION_MESSAGE) {
        refresh();
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);

    // Pushes that landed while the tab was hidden won't have triggered a
    // re-render, so re-read on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Close on Escape and on outside click — a dropdown that traps the user is
  // worse than no dropdown.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const unread = items.filter((n) => !n.read).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) void markAllRead().then(refresh);
  }

  return (
    <div ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        className="relative size-11 sm:size-9"
      >
        <Bell aria-hidden="true" />
        {unread > 0 && (
          <span
            className="bg-live text-live-foreground absolute top-1 right-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-semibold sm:top-0.5 sm:right-0.5"
            aria-hidden="true"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          // Anchored to the header's content row, not to the bell: the theme
          // toggle sits to the bell's right, so `right-0` on the bell put a
          // 320px panel 13px off the left edge of a 375px screen (36px off a
          // 320px one). `right-4` matches the page gutter at every width.
          className="bg-popover text-popover-foreground absolute top-full right-4 z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border shadow-lg"
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-xs font-medium">Notifications</p>
            {items.length > 0 && (
              <Button
                variant="ghost"
                size="xs"
                // A 24px-tall button is smaller than a fingertip: taps landed
                // on the header behind it, which is inside the panel, so the
                // dropdown stayed open and nothing happened — indistinguishable
                // from a broken button. Touch gets a 44px target; the negative
                // margin keeps the header from growing to match, and pointers
                // keep the compact original.
                className="-my-2 h-11 px-3 sm:my-0 sm:h-6 sm:px-2"
                onClick={() => void clearNotifications().then(refresh)}
              >
                <Trash2 aria-hidden="true" />
                Clear
              </Button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-8 text-center">
              <Inbox className="size-5" aria-hidden="true" />
              <p className="text-xs">No notifications yet</p>
              <p className="text-xs">
                Follow a match to get goal alerts here and on your device.
              </p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className="border-b last:border-b-0">
                  <Link
                    to={`/match/${n.matchId}`}
                    onClick={() => setOpen(false)}
                    className="hover:bg-secondary/60 block px-3 py-2.5"
                  >
                    <p className="truncate text-xs font-medium">{n.title}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {n.body}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">
                      {timeAgo(n.at)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}

        </div>
      )}
    </div>
  );
}
