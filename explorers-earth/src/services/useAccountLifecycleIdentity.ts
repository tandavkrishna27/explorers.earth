import { useLayoutEffect, useMemo, useReducer } from "react";
import useAuthStore from "../store/store";
import { AccountLifecycleError } from "./accountLifecycleService";

/** Authority belongs to one signed-in session, not whichever bearer is live later. */
export function useAccountLifecycleIdentity() {
  const { user, isAuthenticated, generation: sessionGeneration } = useAuthStore();
  const [generation, nextGeneration] = useReducer((value: number) => value + 1, 0);
  const documentId = user?.documentId;
  const identity = useMemo(() => {
    let live = true;
    const matches = () => {
      const current = useAuthStore.getState();
      return Boolean(isAuthenticated && documentId)
        && current.isAuthenticated && current.user?.documentId === documentId
        && current.generation === sessionGeneration;
    };
    const isCurrent = () => live && matches();
    const assertCurrent = () => {
      if (!isCurrent()) throw new AccountLifecycleError("AUTH_CHANGED", 401, "The signed-in account changed. Reopen Settings to continue.", false);
    };
    return {
      key: JSON.stringify([isAuthenticated, documentId, sessionGeneration, generation]),
      isCurrent,
      assertCurrent,
      getBearer: () => { assertCurrent(); return undefined; },
      mount: () => { live = true; },
      invalidate: () => { live = false; },
      check: () => {
        if (live && !matches()) { live = false; nextGeneration(); }
      },
    };
  }, [documentId, isAuthenticated, sessionGeneration, generation]);
  useLayoutEffect(() => {
    identity.mount();
    // Invalidate synchronously at the store boundary, including A -> B -> A
    // transitions batched before React renders or a promise continuation runs.
    const unsubscribe = useAuthStore.subscribe(identity.check);
    return () => { identity.invalidate(); unsubscribe(); };
  }, [identity]);
  return identity;
}
