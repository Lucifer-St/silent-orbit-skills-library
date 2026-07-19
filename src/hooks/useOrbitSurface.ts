import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { AppSurface } from "../types";

const orbitHistoryMarker = "orbit";

function surfaceFromHistory(): AppSurface {
  return history.state?.agentOsSurface === orbitHistoryMarker ? "orbit" : "console";
}

export function useOrbitSurface() {
  const [surface, setSurface] = useState<AppSurface>(surfaceFromHistory);
  const surfaceRef = useRef(surface);
  const pendingSurfaceRef = useRef<AppSurface | null>(null);
  const traversalInFlightRef = useRef(false);
  const orbitRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const returnFocusIdRef = useRef<string | null>(null);
  const focusRequestRef = useRef(0);

  const focusLogicalOrigin = useCallback(() => {
    const stablePortalOrigin = returnFocusIdRef.current
      ? [...document.querySelectorAll<HTMLElement>("[data-orbit-return-id]")]
          .find((item) => item.dataset.orbitReturnId === returnFocusIdRef.current)
      : null;
    const explicitOrigin = returnFocusRef.current?.isConnected ? returnFocusRef.current : stablePortalOrigin;
    const explicitFallback = document.querySelector<HTMLElement>(".console-brand");
    (explicitOrigin ?? explicitFallback)?.focus();
  }, []);

  const scheduleFocus = useCallback((focusRequest: number, next: AppSurface, restoreOriginFocus: boolean) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (focusRequest !== focusRequestRef.current) return;
        if (next === "orbit") orbitRef.current?.focus();
        else if (restoreOriginFocus) focusLogicalOrigin();
      });
    });
  }, [focusLogicalOrigin]);

  useLayoutEffect(() => {
    surfaceRef.current = surface;
    if (pendingSurfaceRef.current === surface) pendingSurfaceRef.current = null;
  }, [surface]);

  useEffect(() => {
    if (surfaceRef.current !== "orbit") return;
    const focusRequest = ++focusRequestRef.current;
    scheduleFocus(focusRequest, "orbit", false);
  }, [scheduleFocus]);

  const transitionTo = useCallback((next: AppSurface, restoreOriginFocus = false) => {
    const focusRequest = ++focusRequestRef.current;
    const focusAfterRender = () => scheduleFocus(focusRequest, next, restoreOriginFocus);
    pendingSurfaceRef.current = next;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!reduceMotion && document.startViewTransition) {
      try {
        const transition = document.startViewTransition(() => {
          flushSync(() => setSurface(next));
        });
        void transition.updateCallbackDone.then(focusAfterRender, focusAfterRender);
        return;
      } catch {
        // The transition is enhancement-only; navigation remains functional if it rejects synchronously.
      }
    }

    setSurface(next);
    focusAfterRender();
  }, [scheduleFocus]);

  const openOrbit = useCallback((returnFocusTo?: HTMLElement | null) => {
    if (traversalInFlightRef.current || surfaceRef.current === "orbit" || pendingSurfaceRef.current === "orbit") return;
    returnFocusRef.current = returnFocusTo ?? null;
    returnFocusIdRef.current = returnFocusTo?.dataset.orbitReturnId ?? null;
    if (history.state?.agentOsSurface === orbitHistoryMarker) {
      transitionTo("orbit");
      return;
    }

    pendingSurfaceRef.current = "orbit";
    try {
      history.pushState({ ...history.state, agentOsSurface: orbitHistoryMarker }, "");
    } catch (error) {
      pendingSurfaceRef.current = null;
      throw error;
    }
    transitionTo("orbit");
  }, [transitionTo]);

  const closeOrbit = useCallback(() => {
    if (traversalInFlightRef.current) return;
    if (history.state?.agentOsSurface === orbitHistoryMarker) {
      traversalInFlightRef.current = true;
      focusRequestRef.current += 1;
      history.back();
      return;
    }
    if (surfaceRef.current !== "console" || pendingSurfaceRef.current === "orbit") transitionTo("console", true);
  }, [transitionTo]);

  useEffect(() => {
    function handlePopState() {
      traversalInFlightRef.current = false;
      const nextSurface = surfaceFromHistory();
      if (nextSurface === surfaceRef.current && pendingSurfaceRef.current !== nextSurface) return;
      transitionTo(nextSurface, true);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [transitionTo]);

  return { surface, orbitRef, openOrbit, closeOrbit };
}
