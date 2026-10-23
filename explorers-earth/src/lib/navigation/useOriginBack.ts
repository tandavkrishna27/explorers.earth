import { useCallback, useMemo } from "react";
import { useLocation, useNavigate, type NavigateOptions } from "react-router-dom";
import { resolveBack, type BackTarget } from "./originBack";

export type BackFallback = { to: string; label: string };

export function useOriginBack(fallback: BackFallback): BackTarget & { goBack: (options?: NavigateOptions) => void } {
  const location = useLocation();
  const navigate = useNavigate();
  const { to: fallbackTo, label: fallbackLabel } = fallback;
  const target = useMemo(
    () => resolveBack({
      state: location.state,
      search: location.search,
      currentPathname: location.pathname,
      fallback: { to: fallbackTo, label: fallbackLabel },
    }),
    [location.state, location.search, location.pathname, fallbackTo, fallbackLabel],
  );
  const goBack = useCallback((options?: NavigateOptions) => { void navigate(target.to, options); }, [navigate, target.to]);
  return { ...target, goBack };
}
