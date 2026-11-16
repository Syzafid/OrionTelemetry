import { useState, useCallback, useEffect } from "react";

/**
 * Hook to manage Fullscreen API.
 * Returns the current fullscreen state and functions to enter/exit/toggle.
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function onChange() {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("is-fullscreen", active);
        if (document.body) {
          document.body.classList.toggle("is-fullscreen", active);
        }
      }
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (typeof document !== "undefined") {
        document.documentElement.classList.remove("is-fullscreen");
        if (document.body) {
          document.body.classList.remove("is-fullscreen");
        }
      }
    };
  }, []);

  const enter = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // User denied or browser doesn't support: silently ignore
    }
  }, []);

  const exit = useCallback(async () => {
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

  return { isFullscreen, enter, exit, toggle } as const;
}
