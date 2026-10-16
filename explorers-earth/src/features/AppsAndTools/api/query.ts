import { gql } from "@apollo/client";

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useAuthStore from '../../../store/store';
import type { CollectionObservation, RecommendationObservation } from '../../../lib/explorersApiClient';
import { AppsClient, type CompleteAppsOwnerContent, type AppMembershipIntent, type ManualAppDraft } from './appsClient';
import { invalidateApps } from '../hooks/useAppsOwner';

// Ticket 4.3. Native Apps commands. The gql documents below are the retired Strapi
// consumer; Epic 8 removes them after checking callers, so they stay here untouched.

/** Each caller owns its UI effects independently of the native command transport. */
export function useAppsCallerCustody() {
 const generation = useAuthStore(state => state.generation), accountId = useAuthStore(state => state.accountId), location = useLocation();
 const scope = JSON.stringify([generation, accountId, location.pathname]);
 const owner = useRef(scope); owner.current = scope;
 const mounted = useRef(true), operation = useRef(0);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; operation.current++; }; }, []);
 return () => {
  const observedScope = scope, id = ++operation.current;
  return () => mounted.current && owner.current === observedScope && operation.current === id;
 };
}

/** Native UI commands keep observation and route authority around every await. */
export function useAppsCommands() {
 const generation = useAuthStore(state => state.generation), accountId = useAuthStore(state => state.accountId), location = useLocation();
 const scope = JSON.stringify([generation, accountId, location.pathname]);
 const current = useRef(scope); current.current = scope;
 const mounted = useRef(true), operation = useRef(0), controllers = useRef(new Set<AbortController>());
 const keys = useRef(new Map<string, string>()), memberships = useRef(new Map<string, AppMembershipIntent>());
 const collections = useRef(new Map<string, CollectionObservation>()), completeReads = useRef(new Map<string, CompleteAppsOwnerContent>());
 const recommendations = useRef(new Map<string, RecommendationObservation>()), choices = useRef(new Map<string, string>());
 const [pending, setPending] = useState(0);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; controllers.current.forEach(controller => controller.abort()); }; }, []);
 useEffect(() => { controllers.current.forEach(controller => controller.abort()); keys.current.clear(); memberships.current.clear(); collections.current.clear(); completeReads.current.clear(); recommendations.current.clear(); choices.current.clear(); setPending(0); }, [scope]);
 const forget = (signature: string) => { keys.current.delete(signature); collections.current.delete(signature); completeReads.current.delete(signature); recommendations.current.delete(signature); };
 const begin = (group: string, signature: string) => { const previous = choices.current.get(group); if (previous && previous !== signature) { forget(previous); memberships.current.delete(previous); } choices.current.set(group, signature); };
 const observeCollection = async (signature: string, id: string, assert: () => void, signal: AbortSignal) => { let observed = collections.current.get(signature); if (!observed) { observed = await AppsClient.observeCollection(id, signal); assert(); collections.current.set(signature, observed); } return observed; };
 const observeRecommendation = async (signature: string, id: string, assert: () => void, signal: AbortSignal) => { let observed = recommendations.current.get(signature); if (!observed) { observed = await AppsClient.observeRecommendation(id, signal); assert(); recommendations.current.set(signature, observed); } return observed; };
 const observeComplete = async (signature: string, assert: () => void, signal: AbortSignal) => { let observed = completeReads.current.get(signature); if (!observed) { observed = await AppsClient.readCompleteOwner(signal); assert(); completeReads.current.set(signature, observed); } return observed; };
 const key = (intent: string) => { const existing = keys.current.get(intent); if (existing) return existing; const value = crypto.randomUUID(); keys.current.set(intent, value); return value; };
 const run = async <T,>(action: (assert: () => void, signal: AbortSignal) => Promise<T>): Promise<T> => {
  const captured = scope, token = ++operation.current, controller = new AbortController(); controllers.current.add(controller); setPending(value => value + 1);
  const assert = () => { if (!mounted.current || current.current !== captured || operation.current !== token || controller.signal.aborted) throw new Error('App owner or route changed'); };
  try { assert(); const result = await action(assert, controller.signal); assert(); invalidateApps(); return result; }
  finally { controllers.current.delete(controller); if (mounted.current && current.current === captured) setPending(value => Math.max(0, value - 1)); }
 };
 return { loading: pending > 0,
  createList: (input: { title: string; slug: string; description?: string | null }) => run(async (assert, signal) => { const signature = `create:${JSON.stringify(input)}`; begin('create', signature); assert(); const result = await AppsClient.createCollection(input, key(signature), signal); assert(); forget(signature); return result; }),
  updateList: (id: string, patch: Parameters<typeof AppsClient.updateCollection>[1]) => run(async (assert, signal) => { const signature = `update:${id}:${JSON.stringify(patch)}`; begin(`collection:${id}`, signature); const observed = await observeCollection(signature, id, assert, signal); assert(); const result = await AppsClient.updateCollection(observed, patch, key(signature), signal); assert(); forget(signature); return result; }),
  archiveList: (id: string) => run(async (assert, signal) => { const signature = `archive:${id}`; begin(`collection:${id}`, signature); const observed = await observeCollection(signature, id, assert, signal); assert(); const result = await AppsClient.archiveCollection(observed, key(signature), signal); assert(); forget(signature); return result; }),
  // The manual draft carries the typed Apps facts, so one command both resolves the
  // shared entity and files the account own recommendation of it.
  createApp: (collectionId: string, draft: ManualAppDraft) => run(async (assert, signal) => {
   const signature = `create-app:${collectionId}:${JSON.stringify(draft)}`; begin(`collection:${collectionId}`, signature);
   const parent = await observeCollection(signature, collectionId, assert, signal); assert();
   const intent = AppsClient.prepareManualIntent(parent, draft); assert();
   const result = await AppsClient.createManual(intent, signal); assert(); forget(signature); return result;
  }),
  updateApp: (id: string, patch: Parameters<typeof AppsClient.updateRecommendation>[1]) => run(async (assert, signal) => { const signature = `update-app:${id}:${JSON.stringify(patch)}`; begin(`recommendation:${id}`, signature); const observed = await observeRecommendation(signature, id, assert, signal); assert(); const result = await AppsClient.updateRecommendation(observed, patch, key(signature), signal); assert(); forget(signature); return result; }),
  archiveApp: (id: string) => run(async (assert, signal) => { const signature = `archive-app:${id}`; begin(`recommendation:${id}`, signature); const observed = await observeRecommendation(signature, id, assert, signal); assert(); const result = await AppsClient.archiveRecommendation(observed, key(signature), signal); assert(); forget(signature); return result; }),
  publishRecommendation: (id: string, published: boolean) => run(async (assert, signal) => { const signature = `recommendation-publication:${id}:${published}`; begin(`recommendation:${id}`, signature); const observed = await observeRecommendation(signature, id, assert, signal); assert(); const result = await AppsClient.updateRecommendation(observed, { publicationState: published ? 'published' : 'draft' }, key(signature), signal); assert(); forget(signature); return result; }),
  reorderList: (id: string, orderedRecommendationIds: string[]) => run(async (assert, signal) => { const signature = `reorder:${id}:${JSON.stringify(orderedRecommendationIds)}`; begin(`collection:${id}`, signature); const observed = await observeComplete(signature, assert, signal); assert(); const result = await AppsClient.reorderCollection(observed, id, orderedRecommendationIds, key(signature), signal); assert(); forget(signature); return result; }),
  membership: (id: string, collectionId: string, attached: boolean) => run(async (assert, signal) => {
   const signature = JSON.stringify([scope, id, collectionId, attached]); begin(`membership:${id}:${collectionId}`, signature); let intent = memberships.current.get(signature);
   if (!intent) { const parent = await AppsClient.observeCollection(collectionId, signal); assert(); const item = await AppsClient.observeRecommendation(id, signal); assert(); intent = AppsClient.prepareMembershipIntent(parent, item, attached); memberships.current.set(signature, intent); }
   assert(); const result = await AppsClient.saveMembership(intent, signal); assert(); memberships.current.delete(signature); return result;
  }),
  pin: (id: string, collectionId: string, pinned: boolean) => run(async (assert, signal) => {
   const signature = `pin:${id}:${collectionId}:${pinned}`; begin('pins', signature); const observed = await observeComplete(signature, assert, signal); assert();
   if (!observed.memberships.some(member => member.recommendationId === id && member.collectionId === collectionId && !member.collectionArchived && !member.recommendationArchived)) throw new Error('App membership unavailable');
   const pins = (observed.topPicks ?? []).filter(pin => pin.recommendationId !== id).map(pin => ({ recommendationId: pin.recommendationId, collectionId: pin.collectionId }));
   if (pinned) pins.push({ recommendationId: id, collectionId });
   assert(); const result = await AppsClient.setTopPicks(observed, pins, key(signature), signal); assert(); forget(signature); return result;
  }),
  savePins: (pins: { recommendationId: string; collectionId: string }[]) => run(async (assert, signal) => { const signature = `save-pins:${JSON.stringify(pins)}`; begin('pins', signature); const observed = await observeComplete(signature, assert, signal); assert(); const result = await AppsClient.setTopPicks(observed, pins, key(signature), signal); assert(); forget(signature); return result; }),
 };
}


// Query 1.1 — App Lists by Account — DELETED. Its only named consumer was
// `e2e/apps.spec.ts`; that spec became `e2e/replatform/apps.spec.ts` and dropped the
// GraphQL interception entirely because Apps moved off Apollo in the same change. The
// dashboard now reads through `AppsClient`/`getCompleteMyCategoryContent`, so the
// document was dead by design, not by accident: restoring a consumer would have meant
// reviving the retired Apollo path the retirement existed to prevent. Owner decision,
// 2026-10-13. The `retiredApolloDocumentSurface` gate's ORPHANED entry went with it.

// ─────────────────────────────────────────────────────────────
// Query 1.2 — Apps by List (paginated, for list view)
// ─────────────────────────────────────────────────────────────
export const APPS_BY_LIST = gql`
  query AppsByList(
    $appListDocumentId: ID!
    $page: Int!
    $pageSize: Int!
  ) {
    appLists(
      filters: { documentId: { eq: $appListDocumentId } }
    ) {
      documentId
      List_Name
      list_description
      slug
      Visibility
      top_apps_heading
      display_order
      recommended_apps(
        sort: ["display_order:asc"]
        pagination: { start: $page, limit: $pageSize }
      ) {
        documentId
        app_url
        title
        description
        logo_url
        developer
        platforms
        price_tier
        download_url
        user_recommendation_note
        user_rating
        is_pinned
        pin_order
        display_order
        screenshots
        app_category {
          documentId
          name
          slug
        }
      }
    }
  }
`;

export const APPS_BY_LIST_PAGE_SIZE = 200;
export const appsByListVars = (listId: string) => ({
  appListDocumentId: listId,
  page: 0,
  pageSize: APPS_BY_LIST_PAGE_SIZE,
});
export const refetchAppsByList = (listId: string) => [
  { query: APPS_BY_LIST, variables: appsByListVars(listId) },
];

// ─────────────────────────────────────────────────────────────
// Query 1.4 — Public App Data (All published lists)
// ─────────────────────────────────────────────────────────────
export const PUBLIC_APP_DATA = gql`
  query PublicAppData($accountDocumentId: ID!) {
    appLists(
      filters: {
        account: { documentId: { eq: $accountDocumentId } }
        Visibility: { eq: true }
      }
      sort: ["display_order:asc"]
    ) {
      documentId
      List_Name
      list_description
      slug
      cover_image {
        url
      }
      top_apps_heading
      recommended_apps(
        sort: ["is_pinned:desc", "pin_order:asc", "display_order:asc"]
        pagination: { limit: 200 }
      ) {
        documentId
        app_url
        title
        logo_url
        description
        developer
        platforms
        price_tier
        download_url
        screenshots
        user_recommendation_note
        user_rating
        is_pinned
        pin_order
        app_category {
          documentId
          name
          slug
        }
      }
    }
    recommendedApps(
      filters: {
        app_list: {
          account: { documentId: { eq: $accountDocumentId } }
          Visibility: { eq: true }
        }
      }
    ) {
      platforms
      price_tier
      app_category {
        documentId
        name
        slug
      }
    }
  }
`;

