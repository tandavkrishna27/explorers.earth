import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { normalizeRecommendationsPresentation } from "../constants/recommendationsPresentation";
import type {
  NormalizedRecommendationsPresentationSettings,
  RecommendationCategoryId,
  RecommendationsPresentationWire,
} from "../types/themeTypes";

export type ReorderSessionId = `reorder-${number}`;

export type ReorderPhase =
  | "idle"
  | "pointer-pending"
  | "pointer-drag"
  | "keyboard-lift"
  | "committed"
  | "cancelled";

export type KeyboardMoveTarget = "up" | "down" | "start" | "end";

export interface ReorderResult {
  categoryId?: RecommendationCategoryId;
  changed: boolean;
  position?: number;
  sessionId: ReorderSessionId;
  total: number;
  value: NormalizedRecommendationsPresentationSettings;
}

export interface UseReorderTransactionOptions {
  cleanupSession: (sessionId: ReorderSessionId) => void;
  isActive: boolean;
  onCommit: (value: NormalizedRecommendationsPresentationSettings) => void;
  scopeKey: string;
  value?: RecommendationsPresentationWire | null;
}

type ActivePhase = "pointer-pending" | "pointer-drag" | "keyboard-lift";

interface ActiveTransaction {
  activeCategoryId: RecommendationCategoryId;
  draft: NormalizedRecommendationsPresentationSettings;
  externalSignature: string;
  finalized: boolean;
  phase: ActivePhase | "committed" | "cancelled";
  scopeKey: string;
  sessionId: ReorderSessionId;
  snapshot: NormalizedRecommendationsPresentationSettings;
}

interface LatestOptions {
  cleanupSession: (sessionId: ReorderSessionId) => void;
  external: NormalizedRecommendationsPresentationSettings;
  externalSignature: string;
  isActive: boolean;
  onCommit: (value: NormalizedRecommendationsPresentationSettings) => void;
  scopeKey: string;
}

let nextSessionNumber = 0;

const createSessionId = (): ReorderSessionId => {
  nextSessionNumber += 1;
  return `reorder-${nextSessionNumber}`;
};

const isActivePhase = (
  phase: ActiveTransaction["phase"],
): phase is ActivePhase =>
  phase === "pointer-pending" ||
  phase === "pointer-drag" ||
  phase === "keyboard-lift";

const cloneValue = (
  value: NormalizedRecommendationsPresentationSettings,
): NormalizedRecommendationsPresentationSettings => ({
  layout: value.layout,
  categoryOrder: [...value.categoryOrder],
});

const valueSignature = (
  value: NormalizedRecommendationsPresentationSettings,
) => `${value.layout}:${value.categoryOrder.join("|")}`;

const resultFor = (
  value: NormalizedRecommendationsPresentationSettings,
  categoryId: RecommendationCategoryId | undefined,
  changed: boolean,
  sessionId: ReorderSessionId,
): ReorderResult => {
  const index = categoryId ? value.categoryOrder.indexOf(categoryId) : -1;
  return {
    categoryId,
    changed,
    position: index >= 0 ? index + 1 : undefined,
    sessionId,
    total: value.categoryOrder.length,
    value: cloneValue(value),
  };
};

export const useReorderTransaction = ({
  cleanupSession,
  isActive,
  onCommit,
  scopeKey,
  value,
}: UseReorderTransactionOptions) => {
  const normalizedExternal = normalizeRecommendationsPresentation(value);
  const normalizedExternalSignature = valueSignature(normalizedExternal);
  const latestRef = useRef<LatestOptions>({
    cleanupSession,
    external: normalizedExternal,
    externalSignature: normalizedExternalSignature,
    isActive,
    onCommit,
    scopeKey,
  });
  latestRef.current = {
    cleanupSession,
    external: normalizedExternal,
    externalSignature: normalizedExternalSignature,
    isActive,
    onCommit,
    scopeKey,
  };

  const [display, setDisplay] = useState(() => cloneValue(normalizedExternal));
  const displayRef = useRef(display);
  const draftRef = useRef(display);
  const transactionRef = useRef<ActiveTransaction | null>(null);
  const [phase, setPhase] = useState<ReorderPhase>("idle");
  const phaseRef = useRef<ReorderPhase>("idle");
  const [activeCategoryId, setActiveCategoryId] =
    useState<RecommendationCategoryId>();
  const [activeSessionId, setActiveSessionId] = useState<ReorderSessionId>();
  const activePointerSessionIdRef = useRef<ReorderSessionId>();
  const mountedRef = useRef(true);
  const synchronizedContextRef = useRef({
    externalSignature: normalizedExternalSignature,
    scopeKey,
  });

  const publishDisplay = useCallback(
    (
      next: NormalizedRecommendationsPresentationSettings,
      shouldRender = true,
    ) => {
      const cloned = cloneValue(next);
      displayRef.current = cloned;
      draftRef.current = cloned;
      if (shouldRender && mountedRef.current) setDisplay(cloned);
      return cloned;
    },
    [],
  );

  const publishPhase = useCallback(
    (next: ReorderPhase, shouldRender = true) => {
      phaseRef.current = next;
      if (shouldRender && mountedRef.current) setPhase(next);
    },
    [],
  );

  const clearActiveIdentity = useCallback(
    (sessionId: ReorderSessionId, shouldRender = true) => {
      if (activePointerSessionIdRef.current === sessionId) {
        activePointerSessionIdRef.current = undefined;
      }
      if (shouldRender && mountedRef.current) {
        setActiveCategoryId(undefined);
        setActiveSessionId(undefined);
      }
    },
    [],
  );

  const transactionContextIsCurrent = useCallback(
    (sessionId: ReorderSessionId) => {
      const transaction = transactionRef.current;
      const latest = latestRef.current;
      return Boolean(
        transaction &&
          transaction.sessionId === sessionId &&
          latest.isActive &&
          transaction.scopeKey === latest.scopeKey &&
          transaction.externalSignature === latest.externalSignature,
      );
    },
    [],
  );

  const cancelTransaction = useCallback(
    (
      sessionId: ReorderSessionId,
      adoptedValue: NormalizedRecommendationsPresentationSettings,
      shouldRender = true,
    ): ReorderResult | undefined => {
      const transaction = transactionRef.current;
      if (
        !transaction ||
        transaction.sessionId !== sessionId ||
        transaction.finalized ||
        !isActivePhase(transaction.phase)
      ) {
        return undefined;
      }

      // Reject queued Framer callbacks before stop() can schedule Reorder's
      // wrapped drag-end. The public end path can reset module auto-scroll,
      // but it no longer owns this transaction.
      transaction.finalized = true;
      transaction.phase = "cancelled";
      const restored = publishDisplay(adoptedValue, shouldRender);
      publishPhase("cancelled", shouldRender);
      clearActiveIdentity(sessionId, shouldRender);
      latestRef.current.cleanupSession(sessionId);
      return resultFor(
        restored,
        transaction.activeCategoryId,
        false,
        sessionId,
      );
    },
    [clearActiveIdentity, publishDisplay, publishPhase],
  );

  const createTransaction = useCallback(
    (phaseToBegin: ActivePhase, categoryId: RecommendationCategoryId) => {
      const latest = latestRef.current;
      const current = transactionRef.current;
      if (
        !latest.isActive ||
        !latest.external.categoryOrder.includes(categoryId) ||
        (current && !current.finalized && isActivePhase(current.phase))
      ) {
        return undefined;
      }

      const sessionId = createSessionId();
      const snapshot = cloneValue(latest.external);
      transactionRef.current = {
        activeCategoryId: categoryId,
        draft: snapshot,
        externalSignature: latest.externalSignature,
        finalized: false,
        phase: phaseToBegin,
        scopeKey: latest.scopeKey,
        sessionId,
        snapshot,
      };
      if (phaseToBegin === "pointer-drag") {
        activePointerSessionIdRef.current = sessionId;
      }
      publishDisplay(snapshot);
      publishPhase(phaseToBegin);
      setActiveCategoryId(categoryId);
      setActiveSessionId(sessionId);
      return resultFor(snapshot, categoryId, false, sessionId);
    },
    [publishDisplay, publishPhase],
  );

  const reservePointer = useCallback(
    (categoryId: RecommendationCategoryId) =>
      createTransaction("pointer-pending", categoryId),
    [createTransaction],
  );

  const beginPointer = useCallback(
    (sessionId: ReorderSessionId) => {
      const transaction = transactionRef.current;
      if (
        !transaction ||
        transaction.sessionId !== sessionId ||
        transaction.finalized ||
        transaction.phase !== "pointer-pending"
      ) {
        return undefined;
      }
      if (!transactionContextIsCurrent(sessionId)) {
        return cancelTransaction(sessionId, latestRef.current.external);
      }

      transaction.phase = "pointer-drag";
      activePointerSessionIdRef.current = sessionId;
      publishPhase("pointer-drag");
      return resultFor(
        draftRef.current,
        transaction.activeCategoryId,
        false,
        sessionId,
      );
    },
    [cancelTransaction, publishPhase, transactionContextIsCurrent],
  );

  const liftKeyboard = useCallback(
    (categoryId: RecommendationCategoryId) =>
      createTransaction("keyboard-lift", categoryId),
    [createTransaction],
  );

  const updateActiveDraft = useCallback(
    (
      sessionId: ReorderSessionId,
      categoryOrder: readonly RecommendationCategoryId[],
      expectedPhase: "pointer-drag" | "keyboard-lift",
    ) => {
      const transaction = transactionRef.current;
      if (
        !transaction ||
        transaction.sessionId !== sessionId ||
        transaction.finalized ||
        transaction.phase !== expectedPhase
      ) {
        return undefined;
      }
      if (!transactionContextIsCurrent(sessionId)) {
        return cancelTransaction(sessionId, latestRef.current.external);
      }

      const previous = draftRef.current;
      const next = normalizeRecommendationsPresentation({
        layout: transaction.snapshot.layout,
        categoryOrder: [...categoryOrder],
      });
      const changed = valueSignature(previous) !== valueSignature(next);
      transaction.draft = publishDisplay(next);
      return resultFor(
        next,
        transaction.activeCategoryId,
        changed,
        sessionId,
      );
    },
    [cancelTransaction, publishDisplay, transactionContextIsCurrent],
  );

  const updatePointerDraft = useCallback(
    (
      sessionId: ReorderSessionId,
      categoryOrder: readonly RecommendationCategoryId[],
    ) => updateActiveDraft(sessionId, categoryOrder, "pointer-drag"),
    [updateActiveDraft],
  );

  const moveKeyboard = useCallback(
    (sessionId: ReorderSessionId, target: KeyboardMoveTarget) => {
      const transaction = transactionRef.current;
      if (
        !transaction ||
        transaction.sessionId !== sessionId ||
        transaction.finalized ||
        transaction.phase !== "keyboard-lift"
      ) {
        return undefined;
      }
      if (!transactionContextIsCurrent(sessionId)) {
        return cancelTransaction(sessionId, latestRef.current.external);
      }

      const order = [...draftRef.current.categoryOrder];
      const currentIndex = order.indexOf(transaction.activeCategoryId);
      if (currentIndex < 0) return undefined;
      const targetIndex =
        target === "start"
          ? 0
          : target === "end"
            ? order.length - 1
            : target === "up"
              ? Math.max(0, currentIndex - 1)
              : Math.min(order.length - 1, currentIndex + 1);
      if (targetIndex === currentIndex) {
        return resultFor(
          draftRef.current,
          transaction.activeCategoryId,
          false,
          sessionId,
        );
      }

      const [moved] = order.splice(currentIndex, 1);
      order.splice(targetIndex, 0, moved);
      return updateActiveDraft(sessionId, order, "keyboard-lift");
    },
    [cancelTransaction, transactionContextIsCurrent, updateActiveDraft],
  );

  const finalize = useCallback(
    (
      sessionId: ReorderSessionId,
      expectedPhase: "pointer-drag" | "keyboard-lift",
    ) => {
      const transaction = transactionRef.current;
      if (
        !transaction ||
        transaction.sessionId !== sessionId ||
        transaction.finalized ||
        transaction.phase !== expectedPhase
      ) {
        return undefined;
      }
      if (!transactionContextIsCurrent(sessionId)) {
        return cancelTransaction(sessionId, latestRef.current.external);
      }

      transaction.finalized = true;
      transaction.phase = "committed";
      const finalValue = cloneValue(draftRef.current);
      transaction.draft = finalValue;
      const changed =
        valueSignature(finalValue) !== valueSignature(transaction.snapshot);
      publishPhase("committed");
      clearActiveIdentity(sessionId);
      const result = resultFor(
        finalValue,
        transaction.activeCategoryId,
        changed,
        sessionId,
      );
      if (changed) latestRef.current.onCommit(cloneValue(finalValue));
      return result;
    },
    [
      cancelTransaction,
      clearActiveIdentity,
      publishPhase,
      transactionContextIsCurrent,
    ],
  );

  const finishPointer = useCallback(
    (sessionId: ReorderSessionId) => finalize(sessionId, "pointer-drag"),
    [finalize],
  );
  const dropKeyboard = useCallback(
    (sessionId: ReorderSessionId) => finalize(sessionId, "keyboard-lift"),
    [finalize],
  );
  const cancel = useCallback(
    (sessionId: ReorderSessionId) =>
      cancelTransaction(sessionId, latestRef.current.external),
    [cancelTransaction],
  );
  const releasePointer = useCallback(
    (sessionId: ReorderSessionId) => {
      const transaction = transactionRef.current;
      if (
        !transaction ||
        transaction.sessionId !== sessionId ||
        transaction.phase !== "pointer-pending"
      ) {
        return undefined;
      }
      return cancelTransaction(sessionId, latestRef.current.external);
    },
    [cancelTransaction],
  );

  const commitImmediate = useCallback(
    (
      nextValue: NormalizedRecommendationsPresentationSettings,
      categoryId?: RecommendationCategoryId,
    ) => {
      const latest = latestRef.current;
      const active = transactionRef.current;
      if (
        !latest.isActive ||
        (active && !active.finalized && isActivePhase(active.phase))
      ) {
        return undefined;
      }

      const snapshot = cloneValue(displayRef.current);
      const normalized = normalizeRecommendationsPresentation(nextValue);
      const changed = valueSignature(snapshot) !== valueSignature(normalized);
      const sessionId = createSessionId();
      transactionRef.current = {
        activeCategoryId: categoryId || normalized.categoryOrder[0],
        draft: normalized,
        externalSignature: latest.externalSignature,
        finalized: true,
        phase: "committed",
        scopeKey: latest.scopeKey,
        sessionId,
        snapshot,
      };
      const published = publishDisplay(normalized);
      publishPhase("committed");
      setActiveCategoryId(undefined);
      setActiveSessionId(undefined);
      const result = resultFor(published, categoryId, changed, sessionId);
      if (changed) latest.onCommit(cloneValue(published));
      return result;
    },
    [publishDisplay, publishPhase],
  );

  useLayoutEffect(() => {
    const latest = latestRef.current;
    const transaction = transactionRef.current;
    const hasActiveTransaction = Boolean(
      transaction && !transaction.finalized && isActivePhase(transaction.phase),
    );
    const transactionContextChanged = Boolean(
      hasActiveTransaction &&
        transaction &&
        (!latest.isActive ||
          transaction.scopeKey !== latest.scopeKey ||
          transaction.externalSignature !== latest.externalSignature),
    );

    if (transactionContextChanged && transaction) {
      cancelTransaction(transaction.sessionId, latest.external);
    } else if (
      !hasActiveTransaction &&
      (synchronizedContextRef.current.scopeKey !== latest.scopeKey ||
        synchronizedContextRef.current.externalSignature !==
          latest.externalSignature)
    ) {
      publishDisplay(latest.external);
      if (
        phaseRef.current !== "committed" &&
        phaseRef.current !== "cancelled"
      ) {
        publishPhase("idle");
      }
      transactionRef.current = null;
      setActiveCategoryId(undefined);
      setActiveSessionId(undefined);
      activePointerSessionIdRef.current = undefined;
    }

    synchronizedContextRef.current = {
      externalSignature: latest.externalSignature,
      scopeKey: latest.scopeKey,
    };
  }, [
    cancelTransaction,
    isActive,
    normalizedExternalSignature,
    publishDisplay,
    publishPhase,
    scopeKey,
  ]);

  useEffect(() => {
    if (phase !== "committed" && phase !== "cancelled") return undefined;
    const terminalPhase = phase;
    const timer = window.setTimeout(() => {
      if (!mountedRef.current || phaseRef.current !== terminalPhase) return;
      const transaction = transactionRef.current;
      if (
        transaction &&
        transaction.finalized &&
        transaction.phase === terminalPhase
      ) {
        transactionRef.current = null;
      }
      publishPhase("idle");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [phase, publishPhase]);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const transaction = transactionRef.current;
      if (
        transaction &&
        !transaction.finalized &&
        isActivePhase(transaction.phase)
      ) {
        cancelTransaction(
          transaction.sessionId,
          latestRef.current.external,
          false,
        );
      }
    };
  }, [cancelTransaction]);

  return {
    activeCategoryId,
    activePointerSessionIdRef,
    activeSessionId,
    beginPointer,
    cancel,
    commitImmediate,
    display,
    draftRef,
    dropKeyboard,
    finishPointer,
    liftKeyboard,
    moveKeyboard,
    phase,
    releasePointer,
    reservePointer,
    updatePointerDraft,
  };
};
