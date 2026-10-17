export type PublicShellReadiness = {
  usernameKey: string;
  contentRouteKey: string;
  validation: "pending" | "valid" | "terminal-invalid";
  identity: "pending" | "settled";
  routeReady: boolean;
  shellRevealed: boolean;
};

const normalizeUsernameKey = (usernameKey: string) => usernameKey.toLowerCase();

const maybeReveal = (state: PublicShellReadiness): PublicShellReadiness =>
  state.shellRevealed || !(
    state.validation === "valid"
    && state.identity === "settled"
    && state.routeReady
  )
    ? state
    : { ...state, shellRevealed: true };

export const createPublicShellReadiness = (
  usernameKey: string,
  contentRouteKey: string,
): PublicShellReadiness => ({
  usernameKey: normalizeUsernameKey(usernameKey),
  contentRouteKey,
  validation: "pending",
  identity: "pending",
  routeReady: false,
  shellRevealed: false,
});

export const syncPublicShell = (
  state: PublicShellReadiness,
  usernameKey: string,
  contentRouteKey: string,
): PublicShellReadiness => {
  const normalizedUsernameKey = normalizeUsernameKey(usernameKey);

  if (state.usernameKey !== normalizedUsernameKey) {
    return createPublicShellReadiness(normalizedUsernameKey, contentRouteKey);
  }

  return state.contentRouteKey === contentRouteKey
    ? state
    : { ...state, contentRouteKey, routeReady: false };
};

export const settleUsernameValidation = (
  state: PublicShellReadiness,
  usernameKey: string,
  validation: "valid" | "terminal-invalid",
): PublicShellReadiness => {
  if (
    state.usernameKey !== normalizeUsernameKey(usernameKey)
    || state.validation !== "pending"
  ) {
    return state;
  }

  return maybeReveal({ ...state, validation });
};

export const settlePublicIdentity = (
  state: PublicShellReadiness,
  usernameKey: string,
  identity: "settled",
): PublicShellReadiness => {
  if (
    state.usernameKey !== normalizeUsernameKey(usernameKey)
    || state.identity === identity
  ) {
    return state;
  }

  return maybeReveal({ ...state, identity });
};

export const settlePublicRoute = (
  state: PublicShellReadiness,
  contentRouteKey: string,
  routeReady: boolean,
): PublicShellReadiness => {
  if (state.contentRouteKey !== contentRouteKey || state.routeReady === routeReady) {
    return state;
  }

  return maybeReveal({ ...state, routeReady });
};

export const shouldShowColdEntryOverlay = (state: PublicShellReadiness): boolean =>
  state.validation !== "terminal-invalid" && !state.shellRevealed;

export type PublicRouteReadiness = {
  routeKey: string;
  ready: boolean;
};

export const syncPublicRoute = (
  state: PublicRouteReadiness,
  routeKey: string,
): PublicRouteReadiness => state.routeKey === routeKey ? state : { routeKey, ready: false };

export const settleLegacyPublicRoute = (
  state: PublicRouteReadiness,
  routeKey: string,
  ready: boolean,
): PublicRouteReadiness => {
  if (state.routeKey !== routeKey || state.ready === ready) return state;
  return { routeKey, ready };
};
