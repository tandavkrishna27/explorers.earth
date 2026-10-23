import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAddItemMode } from "../useAddItemMode";

type Pick = { id: string; title: string };

describe("useAddItemMode", () => {
  it("starts in search, or in picked when editing", () => {
    expect(renderHook(() => useAddItemMode<Pick>()).result.current.mode).toBe("search");
    expect(renderHook(() => useAddItemMode<Pick>({ initialPicked: { id: "1", title: "A" } })).result.current.mode).toBe("picked");
  });

  it("carries the typed query into manual and back", () => {
    const { result } = renderHook(() => useAddItemMode<Pick>());
    act(() => result.current.setQuery("Chowp"));
    act(() => result.current.goManual());
    expect(result.current.mode).toBe("manual");
    expect(result.current.manualName).toBe("Chowp");
    act(() => result.current.backToSearch());
    expect(result.current.mode).toBe("search");
    expect(result.current.query).toBe("Chowp");
  });

  it("picking shows the card; Change returns to search with the query kept", () => {
    const { result } = renderHook(() => useAddItemMode<Pick>());
    act(() => result.current.setQuery("Zodiac"));
    act(() => result.current.pick({ id: "z", title: "Zodiac" }));
    expect(result.current.mode).toBe("picked");
    expect(result.current.picked?.id).toBe("z");
    act(() => result.current.change());
    expect(result.current.mode).toBe("search");
    expect(result.current.picked).toBeNull();
    expect(result.current.query).toBe("Zodiac");
  });

  it("reset clears everything for Save and add another", () => {
    const { result } = renderHook(() => useAddItemMode<Pick>());
    act(() => { result.current.setQuery("x"); });
    act(() => { result.current.goManual(); });
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ mode: "search", query: "", manualName: "", picked: null });
  });
});
