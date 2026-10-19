import { useEffect, useState } from "react";
import { useApiIsLoaded } from "@vis.gl/react-google-maps";

type MapsWindow = Window & {
  gm_authFailure?: () => void;
  google?: { maps?: { marker?: { AdvancedMarkerElement?: unknown } } };
};

/**
 * Whether live map components can be mounted. The script finishing loading is not enough:
 * a rejected key still "loads" while the marker library is missing or Maps reports an auth
 * failure, and AdvancedMarker then throws while mounting or unmounting, which took the whole
 * public section down. When this is false callers render their no-map fallback instead.
 */
export function useMapsUsable(): boolean {
  const loaded = useApiIsLoaded();
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    const w = window as MapsWindow;
    const previous = w.gm_authFailure;
    w.gm_authFailure = () => {
      setAuthFailed(true);
      previous?.();
    };
    return () => {
      w.gm_authFailure = previous;
    };
  }, []);

  if (!loaded || authFailed) return false;
  return Boolean((window as MapsWindow).google?.maps?.marker?.AdvancedMarkerElement);
}
