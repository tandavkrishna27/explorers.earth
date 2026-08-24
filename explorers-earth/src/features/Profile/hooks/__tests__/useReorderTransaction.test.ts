import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  useReorderTransaction,
  type ReorderSessionId,
} from "../useReorderTransaction";
import type {
  RecommendationCategoryId,
  RecommendationsPresentationWire,
} from "../../types/themeTypes";

const CANONICAL_ORDER: RecommendationCategoryId[] = [
  "places",
  "music",
  "movies",
  "books",
  "games",
  "guides",
  "apps",
  "products",
  "people",
];

const MOVED_ONCE: RecommendationCategoryId[] = [
  "music",
  "places",
  "movies",
  "books",
  "games",
  "guides",
  "apps",
  "products",
  "people",
];

interface HarnessProps {
  cleanupSession: (sessionId: ReorderSessionId) => void;
  isActive: boolean;
  onCommit: ReturnType<typeof vi.fn>;
  scopeKey: string;
  value?: RecommendationsPresentationWire | null;
}

const renderTransaction = (overrides: Partial<HarnessProps> = {}) => {
  const props: HarnessProps = {
    cleanupSession: vi.fn(),
    isActive: true,
    onCommit: vi.fn(),
    scopeKey: "account-a",
    value: { layout: "shelves", categoryOrder: CANONICAL_ORDER },
    ...overrides,
  };

  return {
    ...renderHook(
      (current: HarnessProps) => useReorderTransaction(current),
      { initialProps: props },
    ),
    props,
  };
};

describe("useReorderTransaction", () => {
  it("commits the latest synchronous pointer draft instead of an earlier render", () => {
    const { result, props } = renderTransaction();
    let sessionId!: ReorderSessionId;
    const finalFrame: RecommendationCategoryId[] = [
      "music",
      "movies",
      "places",
      "books",
      "games",
      "guides",
      "apps",
      "products",
      "people",
    ];

    act(() => {
      sessionId = result.current.reservePointer("places")!.sessionId;
      result.current.beginPointer(sessionId);
      result.current.updatePointerDraft(sessionId, MOVED_ONCE);
      result.current.updatePointerDraft(sessionId, finalFrame);
      result.current.finishPointer(sessionId);
    });

    expect(props.onCommit).toHaveBeenCalledTimes(1);
    expect(props.onCommit).toHaveBeenCalledWith({
      layout: "shelves",
      categoryOrder: finalFrame,
    });
    expect(result.current.display.categoryOrder).toEqual(finalFrame);
    expect(result.current.phase).toBe("committed");
  });

  it("emits nothing for an unchanged pointer drop", () => {
    const { result, props } = renderTransaction();
    let sessionId!: ReorderSessionId;

    act(() => {
      sessionId = result.current.reservePointer("places")!.sessionId;
      result.current.beginPointer(sessionId);
      result.current.updatePointerDraft(sessionId, CANONICAL_ORDER);
      result.current.finishPointer(sessionId);
    });

    expect(props.onCommit).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("committed");
  });

  it("finalizes a pointer transaction at most once", () => {
    const { result, props } = renderTransaction();
    let sessionId!: ReorderSessionId;

    act(() => {
      sessionId = result.current.reservePointer("places")!.sessionId;
      result.current.beginPointer(sessionId);
      result.current.updatePointerDraft(sessionId, MOVED_ONCE);
      result.current.finishPointer(sessionId);
      result.current.finishPointer(sessionId);
    });

    expect(props.onCommit).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale pointer end after cancellation and a newer pointer begins", () => {
    const { result, props } = renderTransaction();
    let sessionA!: ReorderSessionId;
    let sessionB!: ReorderSessionId;

    act(() => {
      sessionA = result.current.reservePointer("places")!.sessionId;
      result.current.beginPointer(sessionA);
      result.current.updatePointerDraft(sessionA, MOVED_ONCE);
    });
    act(() => {
      result.current.cancel(sessionA);
      sessionB = result.current.reservePointer("music")!.sessionId;
      result.current.beginPointer(sessionB);
      result.current.updatePointerDraft(sessionB, [
        "places",
        "movies",
        "music",
        "books",
        "games",
        "guides",
        "apps",
        "products",
        "people",
      ]);
      result.current.finishPointer(sessionA);
    });

    expect(props.onCommit).not.toHaveBeenCalled();
    expect(result.current.activeCategoryId).toBe("music");

    act(() => {
      result.current.finishPointer(sessionB);
    });
    expect(props.onCommit).toHaveBeenCalledTimes(1);
    expect(props.onCommit.mock.calls[0][0].categoryOrder.slice(0, 3)).toEqual([
      "places",
      "movies",
      "music",
    ]);
  });

  it("holds pending pointer ownership until the matching tap releases it", () => {
    const { result } = renderTransaction();
    let sessionA!: ReorderSessionId;

    act(() => {
      sessionA = result.current.reservePointer("places")!.sessionId;
    });
    expect(result.current.phase).toBe("pointer-pending");
    expect(result.current.reservePointer("music")).toBeUndefined();

    act(() => {
      result.current.releasePointer(sessionA);
    });
    expect(result.current.phase).toBe("cancelled");

    let sessionB: ReorderSessionId | undefined;
    act(() => {
      sessionB = result.current.reservePointer("music")?.sessionId;
    });
    expect(sessionB).toBeTruthy();
    expect(sessionB).not.toBe(sessionA);
  });

  it("rejects every pointer transition that presents the wrong session id", () => {
    const { result, props } = renderTransaction();
    let sessionId!: ReorderSessionId;
    const staleSessionId = "reorder-999999999" as ReorderSessionId;

    act(() => {
      sessionId = result.current.reservePointer("places")!.sessionId;
    });
    expect(result.current.beginPointer(staleSessionId)).toBeUndefined();
    expect(result.current.phase).toBe("pointer-pending");

    act(() => {
      result.current.beginPointer(sessionId);
    });
    expect(result.current.updatePointerDraft(staleSessionId, MOVED_ONCE))
      .toBeUndefined();
    expect(result.current.cancel(staleSessionId)).toBeUndefined();
    expect(result.current.finishPointer(staleSessionId)).toBeUndefined();
    expect(result.current.phase).toBe("pointer-drag");
    expect(props.cleanupSession).not.toHaveBeenCalled();
    expect(props.onCommit).not.toHaveBeenCalled();

    act(() => {
      result.current.updatePointerDraft(sessionId, MOVED_ONCE);
      result.current.finishPointer(sessionId);
    });
    expect(props.onCommit).toHaveBeenCalledTimes(1);
  });

  it("marks pointer cancellation before cancelling Framer drag so drag-end is a no-op", () => {
    const onCommit = vi.fn();
    const finishDuringCleanupRef: {
      current?: (sessionId: ReorderSessionId) => unknown;
    } = {};
    const cleanupSession = vi.fn((sessionId: ReorderSessionId) =>
      finishDuringCleanupRef.current?.(sessionId),
    );
    const { result } = renderTransaction({ cleanupSession, onCommit });
    let sessionId!: ReorderSessionId;

    act(() => {
      sessionId = result.current.reservePointer("places")!.sessionId;
      result.current.beginPointer(sessionId);
      result.current.updatePointerDraft(sessionId, MOVED_ONCE);
    });
    finishDuringCleanupRef.current = result.current.finishPointer;

    act(() => {
      result.current.cancel(sessionId);
      result.current.finishPointer(sessionId);
    });

    expect(cleanupSession).toHaveBeenCalledTimes(1);
    expect(cleanupSession).toHaveBeenCalledWith(sessionId);
    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.display.categoryOrder).toEqual(CANONICAL_ORDER);
    expect(result.current.phase).toBe("cancelled");
  });

  it("supports keyboard lift, relative moves, Home, End, and one drop", () => {
    const { result, props } = renderTransaction();
    let sessionId!: ReorderSessionId;

    act(() => {
      sessionId = result.current.liftKeyboard("movies")!.sessionId;
    });
    expect(result.current.phase).toBe("keyboard-lift");
    expect(result.current.activeCategoryId).toBe("movies");

    act(() => {
      result.current.moveKeyboard(sessionId, "up");
    });
    expect(result.current.display.categoryOrder.slice(0, 3)).toEqual([
      "places",
      "movies",
      "music",
    ]);

    act(() => {
      result.current.moveKeyboard(sessionId, "start");
    });
    expect(result.current.display.categoryOrder[0]).toBe("movies");

    act(() => {
      result.current.moveKeyboard(sessionId, "end");
    });
    expect(result.current.display.categoryOrder.at(-1)).toBe("movies");

    act(() => {
      result.current.dropKeyboard(sessionId);
      result.current.dropKeyboard(sessionId);
    });
    expect(props.onCommit).toHaveBeenCalledTimes(1);
    expect(props.onCommit.mock.calls[0][0].categoryOrder.at(-1)).toBe("movies");
  });

  it("restores the keyboard snapshot on Escape-style cancellation", () => {
    const { result, props } = renderTransaction();
    let sessionId!: ReorderSessionId;

    act(() => {
      sessionId = result.current.liftKeyboard("music")!.sessionId;
      result.current.moveKeyboard(sessionId, "end");
      result.current.cancel(sessionId);
    });

    expect(props.onCommit).not.toHaveBeenCalled();
    expect(result.current.display.categoryOrder).toEqual(CANONICAL_ORDER);
    expect(result.current.phase).toBe("cancelled");
  });

  it("cancels and restores when Appearance becomes inactive", () => {
    const { result, rerender, props } = renderTransaction();
    let sessionId!: ReorderSessionId;

    act(() => {
      sessionId = result.current.reservePointer("places")!.sessionId;
      result.current.beginPointer(sessionId);
      result.current.updatePointerDraft(sessionId, MOVED_ONCE);
    });
    rerender({ ...props, isActive: false });

    expect(props.cleanupSession).toHaveBeenCalledTimes(1);
    expect(props.cleanupSession).toHaveBeenCalledWith(sessionId);
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(result.current.display.categoryOrder).toEqual(CANONICAL_ORDER);
    expect(result.current.phase).toBe("cancelled");
  });

  it("ignores raw prop churn but cancels and adopts a normalized external revision", () => {
    const { result, rerender, props } = renderTransaction({
      value: {
        layout: "shelves",
        categoryOrder: ["places", "music"],
      },
    });

    let sessionId!: ReorderSessionId;
    act(() => {
      sessionId = result.current.reservePointer("places")!.sessionId;
      result.current.beginPointer(sessionId);
      result.current.updatePointerDraft(sessionId, MOVED_ONCE);
    });
    rerender({
      ...props,
      value: {
        layout: "shelves",
        categoryOrder: ["places", "music", "places", "unknown"],
      },
    });
    expect(props.cleanupSession).not.toHaveBeenCalled();

    const externallyRevised: RecommendationCategoryId[] = [
      "music",
      "places",
      "movies",
      "books",
      "games",
      "guides",
      "apps",
      "products",
      "people",
    ];
    rerender({
      ...props,
      value: { layout: "featured", categoryOrder: externallyRevised },
    });

    expect(props.cleanupSession).toHaveBeenCalledTimes(1);
    expect(props.cleanupSession).toHaveBeenCalledWith(sessionId);
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(result.current.display).toEqual({
      layout: "featured",
      categoryOrder: externallyRevised,
    });
  });

  it("cancels and adopts the new account value when scope changes", () => {
    const { result, rerender, props } = renderTransaction();
    const accountBOrder: RecommendationCategoryId[] = [
      "people",
      "products",
      "apps",
      "guides",
      "games",
      "books",
      "movies",
      "music",
      "places",
    ];

    let sessionId!: ReorderSessionId;
    act(() => {
      sessionId = result.current.reservePointer("places")!.sessionId;
      result.current.beginPointer(sessionId);
      result.current.updatePointerDraft(sessionId, MOVED_ONCE);
    });
    const staleFinish = result.current.finishPointer;
    rerender({
      ...props,
      scopeKey: "account-b",
      value: { layout: "grid", categoryOrder: accountBOrder },
    });
    act(() => {
      staleFinish(sessionId);
    });

    expect(props.cleanupSession).toHaveBeenCalledTimes(1);
    expect(props.cleanupSession).toHaveBeenCalledWith(sessionId);
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(result.current.display).toEqual({
      layout: "grid",
      categoryOrder: accountBOrder,
    });
  });

  it("cancels active drag controls during unmount without committing", () => {
    const { result, unmount, props } = renderTransaction();
    let sessionId!: ReorderSessionId;

    act(() => {
      sessionId = result.current.reservePointer("places")!.sessionId;
      result.current.beginPointer(sessionId);
      result.current.updatePointerDraft(sessionId, MOVED_ONCE);
    });
    unmount();

    expect(props.cleanupSession).toHaveBeenCalledTimes(1);
    expect(props.cleanupSession).toHaveBeenCalledWith(sessionId);
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it("exposes committed once and then returns to idle", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderTransaction();
      let sessionId!: ReorderSessionId;

      act(() => {
        sessionId = result.current.reservePointer("places")!.sessionId;
        result.current.beginPointer(sessionId);
        result.current.updatePointerDraft(sessionId, MOVED_ONCE);
        result.current.finishPointer(sessionId);
      });
      expect(result.current.phase).toBe("committed");

      act(() => {
        vi.runOnlyPendingTimers();
      });
      expect(result.current.phase).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("exposes cancelled once and then returns to idle", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderTransaction();
      let sessionId!: ReorderSessionId;

      act(() => {
        sessionId = result.current.reservePointer("places")!.sessionId;
        result.current.beginPointer(sessionId);
        result.current.cancel(sessionId);
      });
      expect(result.current.phase).toBe("cancelled");

      act(() => {
        vi.runOnlyPendingTimers();
      });
      expect(result.current.phase).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });
});
