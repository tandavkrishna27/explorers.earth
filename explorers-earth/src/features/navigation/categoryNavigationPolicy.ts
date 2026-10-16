import type { AccountDto } from '../../../../tunes/shared/explorersContract';
export const CATEGORY_IDS = [
  'public_recommendations', 'public_music', 'public_guides', 'public_movie',
  'public_books', 'public_games', 'public_apps', 'public_products', 'public_people',
] as const;

export type CategoryId = typeof CATEGORY_IDS[number];
export type Scope = { userDocumentId: string; accountDocumentId: string };
export type IntentAuthority = Scope & { generation: number };
export type CategoryIntent = { category: CategoryId; action: 'publish' | 'unpublish' | 'pin' | 'unpin' };
export type GenericNavigationIntent =
  | { category: Exclude<CategoryId, 'public_music'>; action: CategoryIntent['action'] }
  | { category: 'public_music'; action: 'pin' | 'unpin' };
export type NavigationSnapshot = {
  scope: Scope;
  revision: number;
  categories: AccountDto['categories'];
  visibility: Record<CategoryId, 'Yes' | 'No' | null>;
  savedPins: unknown;
  autoPinning: boolean;
};
export type Eligibility = 'allowed' | 'not-public' | 'no-content' | 'unknown';
export type NavigationPatch = Partial<Record<CategoryId, 'Yes' | 'No'>> & {
  pinned_nav_tabs?: string[];
  auto_pinning?: boolean;
};
export type PolicyResult =
  | { kind: 'write'; patch: NavigationPatch; cleanupPending?: true }
  | { kind: 'noop' }
  | { kind: 'blocked'; reason: 'not-public' | 'no-content' | 'unknown' | 'slot-limit' | 'manual-required' | 'invalid-pins' };

const PROFILE_TAB = 'public_profile';
const MAX_NAV_SLOTS = 5;

function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === 'string' && CATEGORY_IDS.includes(value as CategoryId);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string');
}

function canSafelyAppend(savedPins: string[]): boolean {
  if (savedPins[0] !== PROFILE_TAB) return false;
  const knownIds = new Set<string>([PROFILE_TAB, ...CATEGORY_IDS]);
  return savedPins.every((id) => knownIds.has(id)) && new Set(savedPins).size === savedPins.length;
}

export function planCategoryIntent(
  snapshot: NavigationSnapshot,
  intent: CategoryIntent,
): PolicyResult {
  if (!isCategoryId(intent.category)) return { kind: 'blocked', reason: 'invalid-pins' };

  const { category, action } = intent;
  const visibility = snapshot.visibility[category];
  const savedPins = snapshot.savedPins;

  if (action === 'publish') {
    // Visibility is the owner's declared intent and does not depend on current
    // inventory. Content eligibility deliberately does NOT gate this: a category
    // whose producer is not built yet ('unknown') or which is simply empty
    // ('no-content') must still be togglable, or our unbuilt backends would present
    // as the owner's control being broken. Emptiness is a display concern, handled
    // on the public side, and Settings already labels a category "No content".
    return visibility === 'Yes'
      ? { kind: 'noop' }
      : { kind: 'write', patch: { [category]: 'Yes' } };
  }

  if (action === 'unpublish') {
    if (savedPins === null || (Array.isArray(savedPins) && savedPins.length === 0)) {
      return visibility === 'No'
        ? { kind: 'noop' }
        : { kind: 'write', patch: { [category]: 'No' } };
    }
    if (!isStringArray(savedPins)) {
      return { kind: 'write', patch: { [category]: 'No' }, cleanupPending: true };
    }

    const remaining = savedPins.filter((id) => id !== category);
    if (visibility === 'No' && remaining.length === savedPins.length) return { kind: 'noop' };
    return {
      kind: 'write',
      patch: {
        [category]: 'No',
        ...(remaining.length !== savedPins.length ? { pinned_nav_tabs: remaining } : {}),
      },
    };
  }

  if (action === 'unpin') {
    if (savedPins === null || (Array.isArray(savedPins) && savedPins.length === 0)) return { kind: 'noop' };
    if (!isStringArray(savedPins)) return { kind: 'blocked', reason: 'invalid-pins' };

    const remaining = savedPins.filter((id) => id !== category);
    return remaining.length === savedPins.length
      ? { kind: 'noop' }
      : { kind: 'write', patch: { pinned_nav_tabs: remaining } };
  }

  // A saved target is already a placement preference; this is not a new pin.
  if (isStringArray(savedPins) && savedPins.includes(category)) return { kind: 'noop' };

  // Pinning is not gated on content either, for the same reason: an owner may place
  // a category we have not built a producer for yet. Visibility is still required -
  // a pinned tab the owner has hidden would contradict itself - and the slot limit
  // and Music's own publication verification below are unchanged.
  if (visibility !== 'Yes') return { kind: 'blocked', reason: 'not-public' };
  if (snapshot.autoPinning) return { kind: 'blocked', reason: 'manual-required' };

  if (savedPins === null || (Array.isArray(savedPins) && savedPins.length === 0)) {
    return { kind: 'write', patch: { pinned_nav_tabs: [PROFILE_TAB, category] } };
  }
  if (!isStringArray(savedPins) || !canSafelyAppend(savedPins)) {
    return { kind: 'blocked', reason: 'invalid-pins' };
  }
  if (savedPins.length >= MAX_NAV_SLOTS) return { kind: 'blocked', reason: 'slot-limit' };
  return { kind: 'write', patch: { pinned_nav_tabs: [...savedPins, category] } };
}
