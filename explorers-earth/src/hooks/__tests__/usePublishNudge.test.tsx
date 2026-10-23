import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decidePublishNudge,
  publishNudgeRouterState,
  usePublishNudge,
  type ListPublishStatus,
  type PublishNudgeInput,
  type PublishNudgeReason,
} from "../usePublishNudge";

type Row = [string, PublishNudgeInput, PublishNudgeReason | null];
const base = { dismissed: false, offeredAtThree: false, offeredOnLeave: false };

const RULES: Row[] = [
  ["item added, empty list", { ...base, trigger: "itemAdded", itemCount: 0, status: "draft" }, null],
  ["item added, 2 items", { ...base, trigger: "itemAdded", itemCount: 2, status: "draft" }, null],
  ["item added, 3rd item", { ...base, trigger: "itemAdded", itemCount: 3, status: "draft" }, "reachedThree"],
  ["item added, 5 items, not yet offered", { ...base, trigger: "itemAdded", itemCount: 5, status: "draft" }, "reachedThree"],
  ["item added, already offered at 3", { ...base, trigger: "itemAdded", itemCount: 4, status: "draft", offeredAtThree: true }, null],
  ["item added, list public", { ...base, trigger: "itemAdded", itemCount: 3, status: "public" }, null],
  ["item added, Not now this session", { ...base, trigger: "itemAdded", itemCount: 3, status: "draft", dismissed: true }, null],
  ["leaving, empty list", { ...base, trigger: "leaving", itemCount: 0, status: "draft" }, null],
  ["leaving, draft with 1 item", { ...base, trigger: "leaving", itemCount: 1, status: "draft" }, "leaving"],
  ["leaving, public list", { ...base, trigger: "leaving", itemCount: 1, status: "public" }, null],
  ["leaving, Not now this session", { ...base, trigger: "leaving", itemCount: 2, status: "draft", dismissed: true }, null],
  ["leaving, already offered on leave", { ...base, trigger: "leaving", itemCount: 2, status: "draft", offeredOnLeave: true }, null],
  ["leaving after the 3-item offer", { ...base, trigger: "leaving", itemCount: 4, status: "draft", offeredAtThree: true }, "leaving"],
  ["negative count is treated as empty", { ...base, trigger: "leaving", itemCount: -1, status: "draft" }, null],
];

describe("decidePublishNudge rule table", () => {
  it.each(RULES)("%s", (_name, input, expected) => {
    expect(decidePublishNudge(input)).toBe(expected);
  });
});

function wrapperWith(state: unknown) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[{ pathname: "/recommendations/movies/comfort-movies", state }]}>
        {children}
      </MemoryRouter>
    );
  };
}

function useHarness(listId: string | null, itemCount: number, status: ListPublishStatus) {
  return { nudge: usePublishNudge(listId, itemCount, status), location: useLocation() };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("usePublishNudge", () => {
  it("offers after the 3rd item when router state names this list, and consumes the state", () => {
    const { result } = renderHook(() => useHarness("L1", 3, "draft"), {
      wrapper: wrapperWith(publishNudgeRouterState("L1")),
    });
    expect(result.current.nudge.open).toBe(true);
    expect(result.current.nudge.reason).toBe("reachedThree");
    expect(result.current.location.state).toBeNull();
  });

  it("keeps unrelated router state when consuming the trigger", () => {
    const { result } = renderHook(() => useHarness("L1", 3, "draft"), {
      wrapper: wrapperWith({ ...publishNudgeRouterState("L1"), from: "/recommendations/movies" }),
    });
    expect(result.current.location.state).toEqual({ from: "/recommendations/movies" });
  });

  it("ignores router state for another list", () => {
    const { result } = renderHook(() => useHarness("L1", 3, "draft"), {
      wrapper: wrapperWith(publishNudgeRouterState("OTHER")),
    });
    expect(result.current.nudge.open).toBe(false);
    expect(result.current.location.state).toEqual(publishNudgeRouterState("OTHER"));
  });

  it("waits while the list id is not ready, then offers", () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useHarness(id, 3, "draft"),
      { wrapper: wrapperWith(publishNudgeRouterState("L1")), initialProps: { id: null as string | null } },
    );
    expect(result.current.nudge.open).toBe(false);
    rerender({ id: "L1" });
    expect(result.current.nudge.open).toBe(true);
  });

  it("never fires on an empty list", () => {
    const { result } = renderHook(() => useHarness("L1", 0, "draft"), {
      wrapper: wrapperWith(publishNudgeRouterState("L1")),
    });
    expect(result.current.nudge.open).toBe(false);
    const proceed = vi.fn();
    act(() => result.current.nudge.leave(proceed));
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(result.current.nudge.open).toBe(false);
  });

  it("does not offer at 3 twice in one session", () => {
    const first = renderHook(() => useHarness("L1", 3, "draft"), { wrapper: wrapperWith(publishNudgeRouterState("L1")) });
    act(() => first.result.current.nudge.close());
    first.unmount();
    const second = renderHook(() => useHarness("L1", 4, "draft"), { wrapper: wrapperWith(publishNudgeRouterState("L1")) });
    expect(second.result.current.nudge.open).toBe(false);
  });

  it("leaving a draft list with items is intercepted; Not now proceeds and suppresses for the session", () => {
    const { result } = renderHook(() => useHarness("L1", 1, "draft"), { wrapper: wrapperWith(null) });
    const proceed = vi.fn();
    act(() => result.current.nudge.leave(proceed));
    expect(result.current.nudge.open).toBe(true);
    expect(result.current.nudge.reason).toBe("leaving");
    expect(proceed).not.toHaveBeenCalled();
    act(() => result.current.nudge.notNow());
    expect(result.current.nudge.open).toBe(false);
    expect(proceed).toHaveBeenCalledTimes(1);

    const again = renderHook(() => useHarness("L1", 5, "draft"), { wrapper: wrapperWith(publishNudgeRouterState("L1")) });
    expect(again.result.current.nudge.open).toBe(false);
  });

  it("close() after publishing continues the pending leave", () => {
    const { result } = renderHook(() => useHarness("L1", 2, "draft"), { wrapper: wrapperWith(null) });
    const proceed = vi.fn();
    act(() => result.current.nudge.leave(proceed));
    act(() => result.current.nudge.close());
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(result.current.nudge.open).toBe(false);
  });

  it("leaving a public list proceeds immediately", () => {
    const { result } = renderHook(() => useHarness("L1", 4, "public"), { wrapper: wrapperWith(null) });
    const proceed = vi.fn();
    act(() => result.current.nudge.leave(proceed));
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(result.current.nudge.open).toBe(false);
  });

  it("Not now is per list: another list still offers", () => {
    const one = renderHook(() => useHarness("L1", 1, "draft"), { wrapper: wrapperWith(null) });
    act(() => one.result.current.nudge.leave(vi.fn()));
    act(() => one.result.current.nudge.notNow());
    const two = renderHook(() => useHarness("L2", 3, "draft"), { wrapper: wrapperWith(publishNudgeRouterState("L2")) });
    expect(two.result.current.nudge.open).toBe(true);
  });

  it("survives unreadable session storage", () => {
    const getItem = vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => "{not json");
    const { result } = renderHook(() => useHarness("L1", 3, "draft"), { wrapper: wrapperWith(publishNudgeRouterState("L1")) });
    expect(result.current.nudge.open).toBe(true);
    getItem.mockRestore();
  });
});
