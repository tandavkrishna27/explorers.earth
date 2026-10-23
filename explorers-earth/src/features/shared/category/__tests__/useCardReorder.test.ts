import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { moveCard, useCardReorder } from "../useCardReorder";

describe("moveCard", () => {
  it("moves an entry and ignores out-of-range moves", () => {
    expect(moveCard(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveCard(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });
});

describe("useCardReorder", () => {
  it("keyboard: Space picks up, ArrowRight moves, Space drops and commits once", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useCardReorder(["a", "b", "c"], commit));
    act(() => result.current.onGripKey("a", { key: " ", preventDefault() {} } as KeyboardEvent));
    act(() => result.current.onGripKey("a", { key: "ArrowRight", preventDefault() {} } as KeyboardEvent));
    expect(result.current.order).toEqual(["b", "a", "c"]);
    act(() => result.current.onGripKey("a", { key: " ", preventDefault() {} } as KeyboardEvent));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(["b", "a", "c"]);
  });
  it("Escape cancels and restores the original order without committing", () => {
    const commit = vi.fn();
    const { result } = renderHook(() => useCardReorder(["a", "b"], commit));
    act(() => result.current.onGripKey("a", { key: " ", preventDefault() {} } as KeyboardEvent));
    act(() => result.current.onGripKey("a", { key: "ArrowRight", preventDefault() {} } as KeyboardEvent));
    act(() => result.current.onGripKey("a", { key: "Escape", preventDefault() {} } as KeyboardEvent));
    expect(result.current.order).toEqual(["a", "b"]);
    expect(commit).not.toHaveBeenCalled();
  });
  it("drag and drop commits the dropped order", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useCardReorder(["a", "b", "c"], commit));
    act(() => result.current.dragStart("c"));
    act(() => result.current.dragOver("a"));
    act(() => result.current.drop());
    expect(commit).toHaveBeenCalledWith(["c", "a", "b"]);
  });
  it("menu move commits immediately", () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useCardReorder(["a", "b"], commit));
    act(() => result.current.moveBy("b", -1));
    expect(commit).toHaveBeenCalledWith(["b", "a"]);
  });
  it("reverts to the saved order when the commit fails", async () => {
    const commit = vi.fn().mockRejectedValue(new Error("409"));
    const { result } = renderHook(() => useCardReorder(["a", "b"], commit));
    await act(async () => { result.current.moveBy("b", -1); await Promise.resolve(); });
    expect(result.current.order).toEqual(["a", "b"]);
  });
});
