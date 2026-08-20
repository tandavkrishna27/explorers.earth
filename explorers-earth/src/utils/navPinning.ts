// Shared public-navigation pinning + visibility logic.
//
// This is the single source of truth for "which category tabs are visible" and
// "which tabs are pinned/shown in the public nav bar". It mirrors the behaviour
// that PublicNav.tsx renders (the nav visitors actually see), so any surface that
// needs to reflect the public nav (the owner's Recommendations Hub, etc.) stays
// consistent with it.
//
// Visibility policy is strict opt-in: a category tab is public only when its
// account field is explicitly "Yes". The public profile tab is always visible.
// (Matches Settings and the "Make public?" publish prompt across the app.)

export const MAX_NAV_SLOTS = 5;

export const PROFILE_TAB = "public_profile";

// Category tab ids in the same order PublicNav builds them (profile excluded).
// This order is the stable tie-breaker when several tabs have equal list counts.
export const NAV_TAB_ORDER: string[] = [
  "public_recommendations",
  "public_guides",
  "public_movie",
  "public_music",
  "public_books",
  "public_games",
  "public_apps",
  "public_products",
  "public_people",
];

export interface AccountLike {
  pinned_nav_tabs?: unknown;
  auto_pinning?: unknown;
  [key: string]: unknown;
}

// A category tab is public only when explicitly "Yes"; the profile tab is always on.
function isTabVisible(account: AccountLike | null | undefined, tabId: string): boolean {
  if (tabId === PROFILE_TAB) return true;
  return account?.[tabId] === "Yes";
}

// The set of tab ids currently visible on the public nav (includes public_profile).
export function getVisibleNavTabIds(account: AccountLike | null | undefined): Set<string> {
  const visible = new Set<string>([PROFILE_TAB]);
  for (const tabId of NAV_TAB_ORDER) {
    if (isTabVisible(account, tabId)) visible.add(tabId);
  }
  return visible;
}

// auto_pinning defaults to true when the account field is null/undefined.
export function resolveAutoPinning(account: AccountLike | null | undefined): boolean {
  const v = account?.auto_pinning;
  return v === null || v === undefined ? true : Boolean(v);
}

// Normalize the stored manual pin list, guaranteeing public_profile is present.
// Falls back to just the profile tab when nothing is stored (fresh account).
export function normalizePinnedTabs(account: AccountLike | null | undefined): string[] {
  const raw = account?.pinned_nav_tabs;
  if (!Array.isArray(raw)) return [PROFILE_TAB];
  return raw.includes(PROFILE_TAB) ? [...raw] : [PROFILE_TAB, ...raw];
}

// Compute the ordered list of tab ids that are actually pinned/shown in the public
// nav (max 5, profile first). This is the effective set — the same value PublicNav
// renders — whether the account is in auto-pinning or manual mode.
export function computePinnedNavTabIds(
  account: AccountLike | null | undefined,
  countMap: Record<string, number>
): string[] {
  const visible = getVisibleNavTabIds(account);

  if (resolveAutoPinning(account)) {
    // Auto mode: profile first, then visible categories ranked by list count
    // (descending). Ties fall back to NAV_TAB_ORDER via a stable sort.
    const others = NAV_TAB_ORDER
      .filter((id) => visible.has(id))
      .sort((a, b) => (countMap[b] ?? 0) - (countMap[a] ?? 0));
    return [PROFILE_TAB, ...others].slice(0, MAX_NAV_SLOTS);
  }

  // Manual mode: user-pinned tabs that are currently visible, in pinned order.
  return normalizePinnedTabs(account)
    .filter((id) => visible.has(id))
    .slice(0, MAX_NAV_SLOTS);
}
