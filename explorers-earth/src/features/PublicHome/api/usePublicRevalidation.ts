import { useEffect, useRef } from "react";

export const PUBLIC_REVALIDATE_INTERVAL_MS = 60_000;
export const PUBLIC_REVALIDATE_MIN_GAP_MS = 15_000;

/**
 * Calls `run` when the tab becomes visible or the window regains focus (at most once per
 * MIN_GAP), and every INTERVAL while the tab is visible. Nothing runs while hidden. This is how a
 * visitor in another browser notices that an owner hid a category, list or item without a reload.
 * The reads it triggers are conditional (ETag), so an unchanged page costs 304s.
 */
export function usePublicRevalidation(run: () => void, active: boolean) {
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    let last = Date.now();
    const visible = () => document.visibilityState !== "hidden";
    const fire = () => { last = Date.now(); runRef.current(); };
    const onResume = () => { if (visible() && Date.now() - last >= PUBLIC_REVALIDATE_MIN_GAP_MS) fire(); };
    const timer = window.setInterval(() => { if (visible() && Date.now() - last >= PUBLIC_REVALIDATE_INTERVAL_MS - 1_000) fire(); }, PUBLIC_REVALIDATE_INTERVAL_MS);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
    };
  }, [active]);
}
