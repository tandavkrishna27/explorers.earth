import { readCanonicalNavigationContent } from './canonicalNavigationContent';
import { gql, type ApolloClient } from '@apollo/client';
import { explorersApiClient } from '../../lib/explorersApiClient';
import { toNavigationSnapshot, toNavigationAccountUpdate } from './canonicalNavigationMapping';
import { selectExplorerAccountState, type ExplorerAccountCandidate } from '../music/musicIdentityCoordinator';
import { NavigationError } from './accountNavigationWriter';
import { type Scope, type CategoryId, type Eligibility, type IntentAuthority, type NavigationPatch, type NavigationSnapshot } from './categoryNavigationPolicy';

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


function patchMatches(snapshot: NavigationSnapshot, patch: NavigationPatch) {
 return Object.entries(patch).every(([field,value])=>JSON.stringify(field==='pinned_nav_tabs'?snapshot.savedPins:field==='auto_pinning'?snapshot.autoPinning:snapshot.visibility[field as CategoryId])===JSON.stringify(value));
}
export function createCategoryNavigationApi(dependencies: {
 profile?: Pick<typeof explorersApiClient,'getMyProfile'|'updateAccount'>;
 /** Temporary callsite compatibility only; never queried or mutated. */
 client?: ApolloClient<object>;
 isCurrent:(origin:IntentAuthority)=>boolean;
 eligibility?: (category:Exclude<CategoryId,'public_music'>,origin:IntentAuthority)=>Promise<Eligibility>;
}) {
 const profile=dependencies.profile??explorersApiClient;
 const assertCurrent=(origin:IntentAuthority)=>{if(!dependencies.isCurrent(origin))throw new NavigationError('blocked','Account changed. Reopen this control and try again.');};
 async function readAccount(scope:Scope|string):Promise<NavigationSnapshot> {
  if(typeof scope==='string')throw new NavigationError('blocked','Canonical account scope required.');
  return toNavigationSnapshot(await profile.getMyProfile(),scope);
 }
 async function read(origin:IntentAuthority):Promise<NavigationSnapshot> {assertCurrent(origin);const snapshot=await readAccount(origin);assertCurrent(origin);return snapshot;}
 async function commit(origin:IntentAuthority,patch:NavigationPatch):Promise<NavigationSnapshot> {
  assertCurrent(origin);
  const fresh=await read(origin);
  const input=toNavigationAccountUpdate(fresh,patch);
  assertCurrent(origin);
  let response;
  try {response=await profile.updateAccount(input);} catch(error) {
   assertCurrent(origin);
   if(error&&typeof error==='object'&&'status' in error&&error.status===409) {
    const latest=await read(origin);
    throw new NavigationError('conflict','Navigation changed elsewhere. Refresh before trying again.',latest);
   }
   throw new NavigationError('uncertain','Navigation save was not confirmed. Refresh before trying again.');
  }
  assertCurrent(origin);
  const saved=toNavigationSnapshot(response,origin);
  if(saved.revision<=fresh.revision||!patchMatches(saved,patch))throw new NavigationError('uncertain','Navigation save was not confirmed. Refresh before trying again.');
  let verified:NavigationSnapshot;
  try {verified=await read(origin);}catch(error){assertCurrent(origin);if(error instanceof NavigationError&&error.kind==='blocked')throw error;throw new NavigationError('uncertain','Navigation save was not confirmed. Refresh before trying again.');}
  if(!patchMatches(verified,patch))throw new NavigationError('conflict','Navigation changed elsewhere. Refresh before trying again.',verified);
  return verified;
 }
 async function eligibility(category:Exclude<CategoryId,'public_music'>,origin:IntentAuthority):Promise<Eligibility> {
  assertCurrent(origin);
  if(!dependencies.eligibility){const content=await readCanonicalNavigationContent(origin,()=>dependencies.isCurrent(origin));assertCurrent(origin);return content.eligibility[category]??'unknown';}
  try {const result=await dependencies.eligibility(category,origin);assertCurrent(origin);return result;}catch{assertCurrent(origin);return 'unknown';}
 }
 return {readAccount,read,commit,eligibility};
}
