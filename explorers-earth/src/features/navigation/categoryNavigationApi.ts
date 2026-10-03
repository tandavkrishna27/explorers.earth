import { gql, type ApolloClient } from '@apollo/client';
import { CHECK_PUBLISHED_LISTS, updateTabVisibilityMutation } from '../Settings/api/mutation';
import { selectExplorerAccountState, type ExplorerAccountCandidate } from '../music/musicIdentityCoordinator';
import { NavigationError } from './accountNavigationWriter';
import { CATEGORY_IDS, type CategoryId, type Eligibility, type IntentAuthority, type NavigationPatch, type NavigationSnapshot } from './categoryNavigationPolicy';

export const categoryNavigationAccountQuery = gql`
  query CategoryNavigationAccount($documentId: ID!) {
    usersPermissionsUser(documentId: $documentId) {
      documentId provider confirmed blocked
      accounts {
        documentId Account_Name Account_Type mobile_number
        public_recommendations public_music public_guides public_movie
        public_books public_games public_apps public_products public_people
        pinned_nav_tabs auto_pinning
      }
    }
  }
`;

type Account = ExplorerAccountCandidate & Record<string, unknown>;
export type NavigationUser = {
  documentId?: unknown; provider?: unknown; confirmed?: unknown; blocked?: unknown;
  accounts?: Account[] | null;
};

/** Immutable selection shared with the existing auth boundary; never provisions Music. */
export function selectNavigationAccount(user: NavigationUser | null | undefined, userDocumentId: string): Account {
  if (!user || user.documentId !== userDocumentId || user.blocked !== false
    || !(user.confirmed === true || user.provider === 'google')) {
    throw new NavigationError('blocked', 'Verified account required.');
  }
  const selection = selectExplorerAccountState(user.accounts, { authoritative: true });
  if (selection.kind !== 'selected') throw new NavigationError('blocked', 'Account selection is unavailable.');
  return user.accounts!.find((account) => account.documentId === selection.account.documentId)!;
}

const listFields: Record<Exclude<CategoryId, 'public_music'>, string> = {
  public_books: 'bookLists', public_games: 'gameLists', public_apps: 'appLists',
  public_products: 'productLists', public_movie: 'movieLists', public_people: 'personLists',
  public_guides: 'guides', public_recommendations: 'recommendationLists',
};

function patchMatches(snapshot: NavigationSnapshot, patch: NavigationPatch) {
  return Object.entries(patch).every(([field, value]) => JSON.stringify(
    field === 'pinned_nav_tabs' ? snapshot.savedPins : field === 'auto_pinning' ? snapshot.autoPinning : snapshot.visibility[field as CategoryId],
  ) === JSON.stringify(value));
}

export function createCategoryNavigationApi(dependencies: {
  client: ApolloClient<object>;
  isCurrent: (origin: IntentAuthority) => boolean;
}) {
  const { client, isCurrent } = dependencies;
  const assertCurrent = (origin: IntentAuthority) => {
    if (!isCurrent(origin)) throw new NavigationError('blocked', 'Account changed. Reopen this control and try again.');
  };
  async function readAccount(userDocumentId: string): Promise<NavigationSnapshot> {
    const result = await client.query<{ usersPermissionsUser: NavigationUser }>({
      query: categoryNavigationAccountQuery, variables: { documentId: userDocumentId },
      fetchPolicy: 'network-only', errorPolicy: 'none', context: { queryDeduplication: false },
    });
    if (result.loading || result.errors?.length) throw new NavigationError('uncertain', 'Category settings could not be loaded. Refresh to try again.');
    const account = selectNavigationAccount(result.data?.usersPermissionsUser, userDocumentId);
    const visibility = {} as NavigationSnapshot['visibility'];
    for (const category of CATEGORY_IDS) {
      const value = account[category];
      if (value !== 'Yes' && value !== 'No' && value !== null) throw new NavigationError('uncertain', 'Account visibility is incomplete.');
      visibility[category] = value;
    }
    if (typeof account.auto_pinning !== 'boolean') throw new NavigationError('uncertain', 'Navigation preference is incomplete.');
    return { scope: { userDocumentId, accountDocumentId: account.documentId as string }, visibility,
      savedPins: account.pinned_nav_tabs, autoPinning: account.auto_pinning };
  }
  async function read(origin: IntentAuthority) {
    assertCurrent(origin);
    const snapshot = await readAccount(origin.userDocumentId);
    assertCurrent(origin);
    if (snapshot.scope.accountDocumentId !== origin.accountDocumentId) throw new NavigationError('blocked', 'Account selection changed.');
    return snapshot;
  }
  async function commit(origin: IntentAuthority, patch: NavigationPatch): Promise<NavigationSnapshot> {
    assertCurrent(origin);
    try {
      const result = await client.mutate({ mutation: updateTabVisibilityMutation,
        variables: { documentId: origin.accountDocumentId, data: patch }, errorPolicy: 'none' });
      assertCurrent(origin);
      const saved = result.data?.updateAccount;
      if (result.errors?.length || saved?.documentId !== origin.accountDocumentId || Object.entries(patch)
        .some(([field, value]) => JSON.stringify(saved[field]) !== JSON.stringify(value))) {
        throw new NavigationError('uncertain', 'Navigation save was not confirmed. Refresh before trying again.');
      }
      const snapshot = await read(origin);
      if (!patchMatches(snapshot, patch)) throw new NavigationError('conflict', 'Navigation changed elsewhere. Refresh before trying again.', snapshot);
      return snapshot;
    } catch (error) {
      assertCurrent(origin);
      if (error instanceof NavigationError && error.kind === 'conflict') throw error;
      throw new NavigationError('uncertain', 'Navigation save was not confirmed. Refresh before trying again.');
    }
  }
  async function eligibility(category: Exclude<CategoryId, 'public_music'>, origin: IntentAuthority): Promise<Eligibility> {
    assertCurrent(origin);
    try {
      const result = await client.query({ query: CHECK_PUBLISHED_LISTS, variables: { accountDocumentId: origin.accountDocumentId },
        fetchPolicy: 'network-only', errorPolicy: 'none', context: { queryDeduplication: false } });
      assertCurrent(origin);
      const lists: unknown = result.data?.[listFields[category]];
      if (result.loading || result.errors?.length || !Array.isArray(lists)
        || lists.some((list) => !list || typeof list.documentId !== 'string')) return 'unknown';
      return lists.length > 0 ? 'allowed' : 'no-content';
    } catch { assertCurrent(origin); return 'unknown'; }
  }
  return { readAccount, read, commit, eligibility };
}
