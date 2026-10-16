import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useLocation} from 'react-router-dom';
import useAuthStore from '../../../store/store';
import {readGuidesOwnerContent, type GuidesOwnerContent} from '../api/explorersAdapter';

// Ticket 5.3. The owner read for Guides, replacing GET_GUIDES_QUERY and
// GET_GUIDE_BY_ID_QUERY. Same scoping rule as every other category: the owner epoch and
// the route are part of the cache key, so a read issued before a sign-out, an account
// switch or a navigation is never presented as the current owner's content.
const changes = new EventTarget();
export const invalidateGuides = () => changes.dispatchEvent(new Event('change'));

export function useGuidesOwner(guideId?: string, enabled = true) {
 const generation = useAuthStore((state) => state.generation);
 const accountId = useAuthStore((state) => state.accountId);
 const location = useLocation();
 const scope = JSON.stringify([generation, accountId, location.pathname]);

 const [received, setReceived] = useState<{scope: string; content: GuidesOwnerContent}>();
 const [loading, setLoading] = useState(enabled);
 const [error, setError] = useState<Error>();
 const [revision, setRevision] = useState(0);
 const attempt = useRef(0);

 const refresh = useCallback(() => setRevision((value) => value + 1), []);
 useEffect(() => {
  changes.addEventListener('change', refresh);
  return () => changes.removeEventListener('change', refresh);
 }, [refresh]);

 useEffect(() => {
  const controller = new AbortController();
  const identity = ++attempt.current;
  setReceived(undefined);
  setError(undefined);
  if (!enabled || !accountId) {
   setLoading(false);
   return () => controller.abort();
  }
  setLoading(true);
  void readGuidesOwnerContent(controller.signal)
   // `attempt` discards a resolved read that a newer one has superseded, which an abort
   // alone does not cover: a request already past its last abort check still resolves.
   .then((content) => {if (!controller.signal.aborted && attempt.current === identity) setReceived({scope, content});})
   .catch((failure) => {
    if (!controller.signal.aborted && attempt.current === identity)
     setError(failure instanceof Error ? failure : new Error('Guides could not be loaded'));
   })
   .finally(() => {if (!controller.signal.aborted && attempt.current === identity) setLoading(false);});
  return () => controller.abort();
 }, [scope, enabled, revision, accountId]);

 const content = received?.scope === scope ? received.content : undefined;

 // The legacy consumers read either every guide or one by id, so both shapes come from the
 // one read rather than from two queries that could disagree.
 const guides = useMemo(
  () => (content ? content.guides.filter((guide) => !guideId || guide.documentId === guideId) : undefined),
  [content, guideId],
 );
 const guide = useMemo(() => (guideId ? guides?.[0] : undefined), [guides, guideId]);
 // The branded aggregate for the addressed guide, which is what a write states its
 // revision from. Writes take it from here rather than rebuilding one.
 const observation = useMemo(
  () => (guideId ? content?.aggregates.get(guideId) : undefined),
  [content, guideId],
 );

 return {content, guides, guide, observation, loading, error, refresh, refetch: refresh,
  data: content ? {guides: guides ?? []} : undefined};
}
