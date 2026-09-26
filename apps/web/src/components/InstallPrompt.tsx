import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

const DISMISS_KEY = "livescore-install-dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Synchronous, and cannot change during a session — so it is initial state,
 * not an effect. Computing it in an effect would render once with the wrong
 * value and then immediately re-render (a "cascading render").
 */
function detectPlatform() {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari-only, and absent from the TS DOM lib.
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return { standalone, isIos };
}

export default function InstallPrompt() {
  const [{ standalone, isIos }] = useState(detectPlatform);
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    // beforeinstallprompt is Chromium-only; Safari never fires it.
    if (standalone || isIos) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [standalone, isIos]);

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private mode — it just reappears next visit.
    }
  }

  if (standalone || dismissed) return null;

  if (isIos) {
    return (
      <div className="bg-secondary pad-safe-b sticky bottom-0 z-20 border-t">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5 lg:max-w-4xl">
          <Share className="size-4 shrink-0" aria-hidden="true" />
          <p className="flex-1 text-xs">
            Tap <strong>Share</strong> then <strong>Add to Home Screen</strong>.
            Notifications only work once installed.
          </p>
          <Button
            variant="ghost"
            size="icon"
            onClick={dismiss}
            aria-label="Dismiss install instructions"
            className="size-11 shrink-0 sm:size-8"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }

  if (!deferred) return null;

  return (
    <div className="bg-secondary pad-safe-b sticky bottom-0 z-20 border-t">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5 lg:max-w-4xl">
        <p className="flex-1 text-xs">Install this app for quick access.</p>
        <Button size="sm" onClick={() => void deferred.prompt()}>
          Install
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="size-11 shrink-0 sm:size-8"
        >
          <X aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
