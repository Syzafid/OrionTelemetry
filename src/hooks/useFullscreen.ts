import { useState, useCallback, useEffect } from "react";

/**
 * Checks whether the Fullscreen API is supported in the current browser context.
 * Safe during SSR where `document` is undefined.
 */
export function isFullscreenSupported(): boolean {
  return (
    typeof document !== "undefined" &&
    Boolean(document.fullscreenEnabled) &&
    typeof document.documentElement?.requestFullscreen === "function"
  );
}

/**
 * Requests fullscreen mode directly from a user click/gesture handler.
 * Returns `true` when fullscreen is active or successfully requested, `false` otherwise.
 */
export async function requestAppFullscreen(): Promise<boolean> {
  if (!isFullscreenSupported()) return false;
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Hook to manage Fullscreen API.
 * Returns browser support, current fullscreen state, and functions to enter/exit/toggle.
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(isFullscreenSupported());

    function syncState() {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      document.documentElement.classList.toggle("is-fullscreen", active);
      if (document.body) {
        document.body.classList.toggle("is-fullscreen", active);
      }
    }

    syncState();
    document.addEventListener("fullscreenchange", syncState);
    return () => {
      document.removeEventListener("fullscreenchange", syncState);
      if (!document.fullscreenElement) {
        document.documentElement.classList.remove("is-fullscreen");
        if (document.body) {
          document.body.classList.remove("is-fullscreen");
        }
      }
    };
  }, []);

  const enter = useCallback(async () => {
    await requestAppFullscreen();
  }, []);

  const exit = useCallback(async () => {
    if (typeof document === "undefined") return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  }, []);

  const toggle = useCallback(() => {
    return isFullscreen ? exit() : enter();
  }, [isFullscreen, enter, exit]);

  return { isFullscreen, isSupported, enter, exit, toggle } as const;
}
