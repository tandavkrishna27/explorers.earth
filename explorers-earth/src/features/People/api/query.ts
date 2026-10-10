import { gql } from "@apollo/client";

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useAuthStore from '../../../store/store';
import { getGuardedParentCreateFailure, type CollectionObservation, type RecommendationObservation } from '../../../lib/explorersApiClient';
import { PeopleClient, type CompletePeopleOwnerContent, type PersonMembershipIntent, type ManualPersonDraft } from './peopleClient';
import { invalidatePeople } from '../hooks/usePeopleOwner';

import { PlacesClient } from '../../Favorites/api/placesClient';
import { invalidatePlaces } from '../../Favorites/hooks/usePlacesOwner';

// Ticket 4.5. Native People commands. The gql documents below are the retired Strapi
// consumer; Epic 8 removes them after checking callers, so they stay here untouched.

/** Each caller owns its UI effects independently of the native command transport. */
export function usePeopleCallerCustody() {
 const generation = useAuthStore(state => state.generation), accountId = useAuthStore(state => state.accountId), location = useLocation();
 const scope = JSON.stringify([generation, accountId, location.key, location.pathname, location.search]);
 const owner = useRef(scope); owner.current = scope;
 const mounted = useRef(true), operation = useRef(0);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; operation.current++; }; }, []);
 return () => {
  const observedScope = scope, id = ++operation.current;
  return () => { const auth = useAuthStore.getState(); return mounted.current && owner.current === observedScope && operation.current === id && auth.isAuthenticated && auth.generation === generation && auth.accountId === accountId; };
 };
}

/** Native UI commands keep observation and route authority around every await. */
export function usePeopleCommands() {
 const generation = useAuthStore(state => state.generation), accountId = useAuthStore(state => state.accountId), location = useLocation();
 const scope = JSON.stringify([generation, accountId, location.key, location.pathname, location.search]);
 const current = useRef(scope); current.current = scope;
 const mounted = useRef(true), operation = useRef(0), controllers = useRef(new Set<AbortController>());
 const keys = useRef(new Map<string, string>()), memberships = useRef(new Map<string, PersonMembershipIntent>());
 const collections = useRef(new Map<string, CollectionObservation>()), completeReads = useRef(new Map<string, CompletePeopleOwnerContent>());
 const recommendations = useRef(new Map<string, RecommendationObservation>()), choices = useRef(new Map<string, string>());
 const [pending, setPending] = useState(0);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; controllers.current.forEach(controller => controller.abort()); }; }, []);
 useEffect(() => { controllers.current.forEach(controller => controller.abort()); keys.current.clear(); memberships.current.clear(); collections.current.clear(); completeReads.current.clear(); recommendations.current.clear(); choices.current.clear(); setPending(0); }, [scope]);
 // Linked creates retain their issued authority and immutable command across uncertainty.
 type LinkedInput = Parameters<typeof PeopleClient.createCollection>[0];
 type LinkedResult = Awaited<ReturnType<typeof PeopleClient.createCollection>>;
 type LinkedStatus = 'idle' | 'pending' | 'uncertain' | 'conflict' | 'blocked';
 type LinkedEntry = { body: LinkedInput; key: string; status: LinkedStatus; everUncertain: boolean; localError?: unknown; observation?: CollectionObservation; attempt?: { token: number; controller: AbortController }; promise?: Promise<LinkedResult> };
 const linked = useRef(new Map<string, LinkedEntry>()), linkedToken = useRef(0);
 const activeLinked = useRef<LinkedEntry>();
 const [linkedPending, setLinkedPending] = useState(false);
 const snapshot = (input: LinkedInput): LinkedInput => Object.freeze({ title: input.title, slug: input.slug, ...(input.description !== undefined ? {description: input.description} : {}), parentLocationCollectionId: input.parentLocationCollectionId });
 const signatureOf = (input: LinkedInput) => JSON.stringify(snapshot(input));
 const cancelLinkedCreate = () => {
  const entry = activeLinked.current;
  if (entry && linked.current.get(signatureOf(entry.body)) === entry && entry.attempt?.token === linkedToken.current) {
   entry.everUncertain = true; entry.status = 'blocked'; entry.attempt.controller.abort();
  }
  linkedToken.current++; activeLinked.current = undefined;
  if (mounted.current) setLinkedPending(false);
 };
 useEffect(() => { return () => { linkedToken.current++; activeLinked.current?.attempt?.controller.abort(); }; }, []);
 useEffect(() => { cancelLinkedCreate(); linked.current.clear(); }, [scope]);
 const getLinkedCreateStatus = (input: LinkedInput): LinkedStatus => linked.current.get(signatureOf(input))?.status ?? 'idle';
 const linkedCreate = (input: LinkedInput, recovery = false): Promise<LinkedResult> => {
  const body = snapshot(input), signature = signatureOf(body);
  let entry = linked.current.get(signature);
  if (entry?.status === 'pending' && entry.promise) return entry.promise;
  if (recovery) {
   if (!entry || entry.status !== 'conflict' || entry.everUncertain) return Promise.reject(new Error('The create outcome needs checking before another command.'));
   entry = undefined;
  } else if (entry && (entry.status === 'conflict' || entry.status === 'blocked')) {
   if (!entry.everUncertain && entry.localError !== undefined) return Promise.reject(entry.localError);
   return Promise.reject(new Error(entry.status === 'conflict' ? 'Refresh the location to resolve the conflict.' : 'The create outcome needs checking before another command.'));
  }
  if (activeLinked.current?.status === 'pending') cancelLinkedCreate();
  if (!entry) { entry = { body, key: crypto.randomUUID(), status: 'idle', everUncertain: false }; linked.current.set(signature, entry); }
  const capturedEntry = entry, capturedScope = scope, token = ++linkedToken.current;
  const controller = new AbortController(), attempt = { token, controller };
  capturedEntry.attempt = attempt; capturedEntry.status = 'pending'; activeLinked.current = capturedEntry; setLinkedPending(true);
  const owns = () => { const auth = useAuthStore.getState(); return mounted.current && current.current === capturedScope && auth.isAuthenticated && auth.generation === generation && auth.accountId === accountId && linked.current.get(signature) === capturedEntry && capturedEntry.attempt === attempt && linkedToken.current === token && !controller.signal.aborted; };
  const assert = () => { if (!owns()) throw new Error('Linked create owner or route changed'); };
  let dispatched = false;
  const work = (async () => {
   try {
    assert();
    if (!capturedEntry.observation) { const observed = await PlacesClient.observeCollection(capturedEntry.body.parentLocationCollectionId!, controller.signal); assert(); capturedEntry.observation = observed; }
    assert(); dispatched = true;
    const result = await PeopleClient.createCollection(capturedEntry.body, capturedEntry.key, controller.signal, capturedEntry.observation);
    assert(); invalidatePlaces(); assert(); invalidatePeople(); assert();
    linked.current.delete(signature); return result;
   } catch (error) {
    if (owns()) {
     const failure = getGuardedParentCreateFailure(error);
     if (failure?.kind === 'uncertain') { capturedEntry.everUncertain = true; capturedEntry.status = 'uncertain'; }
     else if (capturedEntry.everUncertain) capturedEntry.status = 'blocked';
     else if (failure?.kind === 'local-rejection') { capturedEntry.localError = error; capturedEntry.status = 'blocked'; }
     else if (failure?.kind === 'server-refusal') { capturedEntry.observation = undefined; capturedEntry.status = failure.status === 409 ? 'conflict' : 'idle'; if (failure.status !== 409) linked.current.delete(signature); }
     else if (!dispatched) { capturedEntry.status = 'idle'; linked.current.delete(signature); }
     else { capturedEntry.status = 'blocked'; capturedEntry.everUncertain = true; }
    }
    throw error;
   } finally {
    if (linked.current.get(signature) === capturedEntry && capturedEntry.attempt === attempt && linkedToken.current === token) capturedEntry.promise = undefined;
    if (activeLinked.current === capturedEntry && capturedEntry.attempt === attempt && linkedToken.current === token && mounted.current && current.current === capturedScope) { activeLinked.current = undefined; setLinkedPending(false); }
   }
  })();
  capturedEntry.promise = work;
  return work;
 };
 const forget = (signature: string) => { keys.current.delete(signature); collections.current.delete(signature); completeReads.current.delete(signature); recommendations.current.delete(signature); };
 const begin = (group: string, signature: string) => { const previous = choices.current.get(group); if (previous && previous !== signature) { forget(previous); memberships.current.delete(previous); } choices.current.set(group, signature); };
 const observeCollection = async (signature: string, id: string, assert: () => void, signal: AbortSignal) => { let observed = collections.current.get(signature); if (!observed) { observed = await PeopleClient.observeCollection(id, signal); assert(); collections.current.set(signature, observed); } return observed; };
 const observeRecommendation = async (signature: string, id: string, assert: () => void, signal: AbortSignal) => { let observed = recommendations.current.get(signature); if (!observed) { observed = await PeopleClient.observeRecommendation(id, signal); assert(); recommendations.current.set(signature, observed); } return observed; };
 const observeComplete = async (signature: string, assert: () => void, signal: AbortSignal) => { let observed = completeReads.current.get(signature); if (!observed) { observed = await PeopleClient.readCompleteOwner(signal); assert(); completeReads.current.set(signature, observed); } return observed; };
 const key = (intent: string) => { const existing = keys.current.get(intent); if (existing) return existing; const value = crypto.randomUUID(); keys.current.set(intent, value); return value; };
 const run = async <T,>(action: (assert: () => void, signal: AbortSignal) => Promise<T>): Promise<T> => {
  const captured = scope, token = ++operation.current, controller = new AbortController(); controllers.current.add(controller); setPending(value => value + 1);
  const assert = () => { if (!mounted.current || current.current !== captured || operation.current !== token || controller.signal.aborted) throw new Error('Person owner or route changed'); };
  try { assert(); const result = await action(assert, controller.signal); assert(); invalidatePeople(); return result; }
  finally { controllers.current.delete(controller); if (mounted.current && current.current === captured) setPending(value => Math.max(0, value - 1)); }
 };
 return { loading: pending > 0 || linkedPending,
  retryLinkedCreate: (input: LinkedInput) => linkedCreate(input, true), cancelLinkedCreate, getLinkedCreateStatus,
  createList: (input: { title: string; slug: string; description?: string | null; parentLocationCollectionId?: string }) => input.parentLocationCollectionId !== undefined ? linkedCreate(input) : run(async (assert, signal) => { const signature = `create:${JSON.stringify(input)}`; begin('create', signature); assert(); const result = await PeopleClient.createCollection(input, key(signature), signal); assert(); forget(signature); return result; }),
  updateList: (id: string, patch: Parameters<typeof PeopleClient.updateCollection>[1]) => run(async (assert, signal) => { const signature = `update:${id}:${JSON.stringify(patch)}`; begin(`collection:${id}`, signature); const observed = await observeCollection(signature, id, assert, signal); assert(); const result = await PeopleClient.updateCollection(observed, patch, key(signature), signal); assert(); forget(signature); return result; }),
  archiveList: (id: string) => run(async (assert, signal) => { const signature = `archive:${id}`; begin(`collection:${id}`, signature); const observed = await observeCollection(signature, id, assert, signal); assert(); const result = await PeopleClient.archiveCollection(observed, key(signature), signal); assert(); forget(signature); return result; }),
  // The manual draft carries the typed People facts, so one command both resolves the
  // shared entity and files the account own recommendation of it.
  createPerson: (collectionId: string, draft: ManualPersonDraft) => run(async (assert, signal) => {
   const signature = `create-person:${collectionId}:${JSON.stringify(draft)}`; begin(`collection:${collectionId}`, signature);
   const parent = await observeCollection(signature, collectionId, assert, signal); assert();
   const intent = PeopleClient.prepareManualIntent(parent, draft); assert();
   const result = await PeopleClient.createManual(intent, signal); assert(); forget(signature); return result;
  }),
  updatePerson: (id: string, patch: Parameters<typeof PeopleClient.updateRecommendation>[1]) => run(async (assert, signal) => { const signature = `update-person:${id}:${JSON.stringify(patch)}`; begin(`recommendation:${id}`, signature); const observed = await observeRecommendation(signature, id, assert, signal); assert(); const result = await PeopleClient.updateRecommendation(observed, patch, key(signature), signal); assert(); forget(signature); return result; }),
  archivePerson: (id: string) => run(async (assert, signal) => { const signature = `archive-person:${id}`; begin(`recommendation:${id}`, signature); const observed = await observeRecommendation(signature, id, assert, signal); assert(); const result = await PeopleClient.archiveRecommendation(observed, key(signature), signal); assert(); forget(signature); return result; }),
  publishRecommendation: (id: string, published: boolean) => run(async (assert, signal) => { const signature = `recommendation-publication:${id}:${published}`; begin(`recommendation:${id}`, signature); const observed = await observeRecommendation(signature, id, assert, signal); assert(); const result = await PeopleClient.updateRecommendation(observed, { publicationState: published ? 'published' : 'draft' }, key(signature), signal); assert(); forget(signature); return result; }),
  reorderList: (id: string, orderedRecommendationIds: string[]) => run(async (assert, signal) => { const signature = `reorder:${id}:${JSON.stringify(orderedRecommendationIds)}`; begin(`collection:${id}`, signature); const observed = await observeComplete(signature, assert, signal); assert(); const result = await PeopleClient.reorderCollection(observed, id, orderedRecommendationIds, key(signature), signal); assert(); forget(signature); return result; }),
  membership: (id: string, collectionId: string, attached: boolean) => run(async (assert, signal) => {
   const signature = JSON.stringify([scope, id, collectionId, attached]); begin(`membership:${id}:${collectionId}`, signature); let intent = memberships.current.get(signature);
   if (!intent) { const parent = await PeopleClient.observeCollection(collectionId, signal); assert(); const item = await PeopleClient.observeRecommendation(id, signal); assert(); intent = PeopleClient.prepareMembershipIntent(parent, item, attached); memberships.current.set(signature, intent); }
   assert(); const result = await PeopleClient.saveMembership(intent, signal); assert(); memberships.current.delete(signature); return result;
  }),
  pin: (id: string, collectionId: string, pinned: boolean) => run(async (assert, signal) => {
   const signature = `pin:${id}:${collectionId}:${pinned}`; begin('pins', signature); const observed = await observeComplete(signature, assert, signal); assert();
   if (!observed.memberships.some(member => member.recommendationId === id && member.collectionId === collectionId && !member.collectionArchived && !member.recommendationArchived)) throw new Error('Person membership unavailable');
   const pins = (observed.topPicks ?? []).filter(pin => pin.recommendationId !== id).map(pin => ({ recommendationId: pin.recommendationId, collectionId: pin.collectionId }));
   if (pinned) pins.push({ recommendationId: id, collectionId });
   assert(); const result = await PeopleClient.setTopPicks(observed, pins, key(signature), signal); assert(); forget(signature); return result;
  }),
  savePins: (pins: { recommendationId: string; collectionId: string }[]) => run(async (assert, signal) => { const signature = `save-pins:${JSON.stringify(pins)}`; begin('pins', signature); const observed = await observeComplete(signature, assert, signal); assert(); const result = await PeopleClient.setTopPicks(observed, pins, key(signature), signal); assert(); forget(signature); return result; }),
 };
}




// ─────────────────────────────────────────────────────────────
// Query 1.2 — People by List (paginated, for list view)
// ─────────────────────────────────────────────────────────────
export const PEOPLE_BY_LIST = gql`
  query PeopleByList(
    $personListDocumentId: ID!
    $page: Int!
    $pageSize: Int!
  ) {
    personLists(
      filters: { documentId: { eq: $personListDocumentId } }
    ) {
      documentId
      List_Name
      list_description
      slug
      Visibility
      top_people_heading: top_picks_heading
      display_order
      recommended_people(
        sort: ["display_order:asc"]
        pagination: { start: $page, limit: $pageSize }
      ) {
        documentId
        name
        username_handle
        headline
        location
        avatar_path
        media_details
        primary_platform
        social_urls
        skills_tags
        user_recommendation_note
        user_rating
        is_pinned
        pin_order
        display_order
        people_category {
          documentId
          Category_name
        }
      }
    }
  }
`;

export const PEOPLE_BY_LIST_PAGE_SIZE = 200;
export const peopleByListVars = (listId: string) => ({
  personListDocumentId: listId,
  page: 0,
  pageSize: PEOPLE_BY_LIST_PAGE_SIZE,
});
export const refetchPeopleByList = (listId: string) => [
  { query: PEOPLE_BY_LIST, variables: peopleByListVars(listId) },
];

