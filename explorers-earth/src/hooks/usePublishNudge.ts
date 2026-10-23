import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export type ListPublishStatus = "draft" | "public";
export type PublishNudgeTrigger = "itemAdded" | "leaving";
export type PublishNudgeReason = "reachedThree" | "leaving";

export interface PublishNudgeInput {
  trigger: PublishNudgeTrigger;
  itemCount: number;
  status: ListPublishStatus;
  /** "Not now" was chosen for this list in this session. */
  dismissed: boolean;
  offeredAtThree: boolean;
  offeredOnLeave: boolean;
}

/** GL-04 / OWN-02: when to offer publishing a list. Pure so the rule table pins it. */
export function decidePublishNudge(input: PublishNudgeInput): PublishNudgeReason | null {
  if (input.status !== "draft" || input.itemCount <= 0 || input.dismissed) return null;
  if (input.trigger === "leaving") return input.offeredOnLeave ? null : "leaving";
  if (input.itemCount >= 3 && !input.offeredAtThree) return "reachedThree";
  return null;
}

const ROUTER_STATE_KEY = "publishNudge";
const SESSION_KEY = "explorers.publishNudge.v1";

export interface PublishNudgeRouterState {
  listId: string;
  trigger: "itemAdded";
}

/** Router state the add-item flow puts on its navigate back to the list page. */
export function publishNudgeRouterState(listId: string): { publishNudge: PublishNudgeRouterState } {
  return { [ROUTER_STATE_KEY]: { listId, trigger: "itemAdded" } } as { publishNudge: PublishNudgeRouterState };
}

interface ListNudgeRecord {
  dismissed?: boolean;
  offeredAtThree?: boolean;
  offeredOnLeave?: boolean;
}

function readAll(): Record<string, ListNudgeRecord> {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, ListNudgeRecord>) : {};
  } catch {
    return {};
  }
}

function readRecord(listId: string): ListNudgeRecord {
  return readAll()[listId] ?? {};
}

function writeRecord(listId: string, patch: ListNudgeRecord): void {
  try {
    const all = readAll();
    all[listId] = { ...all[listId], ...patch };
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(all));
  } catch {
    // Storage unavailable (private mode): the nudge may repeat this session, never crash.
  }
}

function inputFor(
  listId: string,
  trigger: PublishNudgeTrigger,
  itemCount: number,
  status: ListPublishStatus,
): PublishNudgeInput {
  const record = readRecord(listId);
  return {
    trigger,
    itemCount,
    status,
    dismissed: Boolean(record.dismissed),
    offeredAtThree: Boolean(record.offeredAtThree),
    offeredOnLeave: Boolean(record.offeredOnLeave),
  };
}

export interface PublishNudgeController {
  open: boolean;
  reason: PublishNudgeReason | null;
  /** "Not now": suppress for this list for the session, then continue any pending leave. */
  notNow: () => void;
  /** Close after the consumer published (or gave up), then continue any pending leave. */
  close: () => void;
  /** Wrap the list page's Back: runs `proceed` now, or after the nudge is answered. */
  leave: (proceed: () => void) => void;
}

/**
 * GL-04: one publish nudge for every category. Offers after the 3rd item (router state from
 * the add flow) or when leaving a draft list with items; never on an empty list; "Not now"
 * suppresses it per list per session. Pass `listId = null` until the list read is fresh.
 */
export function usePublishNudge(
  listId: string | null | undefined,
  itemCount: number,
  status: ListPublishStatus,
): PublishNudgeController {
  const location = useLocation();
  const navigate = useNavigate();
  const [reason, setReason] = useState<PublishNudgeReason | null>(null);
  const pendingLeave = useRef<(() => void) | null>(null);

  useEffect(() => {
    const state = location.state as Record<string, unknown> | null;
    const trigger = state?.[ROUTER_STATE_KEY] as PublishNudgeRouterState | undefined;
    if (!listId || !trigger || trigger.listId !== listId) return;
    const rest = Object.fromEntries(Object.entries(state ?? {}).filter(([key]) => key !== ROUTER_STATE_KEY));
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: Object.keys(rest).length > 0 ? rest : null },
    );
    if (decidePublishNudge(inputFor(listId, "itemAdded", itemCount, status)) === "reachedThree") {
      writeRecord(listId, { offeredAtThree: true });
      setReason("reachedThree");
    }
  }, [location.state, location.pathname, location.search, location.hash, listId, itemCount, status, navigate]);

  const finish = useCallback(() => {
    setReason(null);
    const proceed = pendingLeave.current;
    pendingLeave.current = null;
    proceed?.();
  }, []);

  const notNow = useCallback(() => {
    if (listId) writeRecord(listId, { dismissed: true });
    finish();
  }, [listId, finish]);

  const leave = useCallback(
    (proceed: () => void) => {
      if (!listId || decidePublishNudge(inputFor(listId, "leaving", itemCount, status)) !== "leaving") {
        proceed();
        return;
      }
      writeRecord(listId, { offeredOnLeave: true });
      pendingLeave.current = proceed;
      setReason("leaving");
    },
    [listId, itemCount, status],
  );

  return { open: reason !== null, reason, notNow, close: finish, leave };
}
