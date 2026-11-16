import { useEffect, useRef, type DependencyList, type RefObject } from "react";
import { prefersReducedMotion } from "@/lib/motion-tokens";

type AnimeModule = typeof import("animejs");

export interface AnimeRevertable {
  revert: () => unknown;
}

/**
 * Runs an anime.js choreography on the client only.
 * - anime.js is loaded with a dynamic import so it never enters the SSR or landing bundle.
 * - When the OS asks for reduced motion, `onReduced` is called instead so the
 *   element lands on its final state immediately.
 * - Every returned animation/timeline is reverted on unmount or dependency change.
 */
export function useAnime<T extends Element>(
  ref: RefObject<T | null>,
  run: (anime: AnimeModule, el: T) => AnimeRevertable | AnimeRevertable[] | void,
  deps: DependencyList,
  options: { enabled?: boolean; onReduced?: (el: T) => void } = {},
) {
  const runRef = useRef(run);
  runRef.current = run;
  const reducedRef = useRef(options.onReduced);
  reducedRef.current = options.onReduced;
  const enabled = options.enabled ?? true;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;

    if (prefersReducedMotion()) {
      reducedRef.current?.(el);
      return undefined;
    }

    let cancelled = false;
    let handles: AnimeRevertable[] = [];

    import("animejs")
      .then((anime) => {
        if (cancelled || !ref.current) return;
        const out = runRef.current(anime, ref.current);
        handles = out ? (Array.isArray(out) ? out : [out]) : [];
      })
      .catch(() => {
        // Animation is progressive enhancement: on load failure show final state.
        if (!cancelled && ref.current) reducedRef.current?.(ref.current);
      });

    return () => {
      cancelled = true;
      for (const h of handles) {
        try {
          h.revert();
        } catch {
          // ignore revert errors on detached nodes
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
}

