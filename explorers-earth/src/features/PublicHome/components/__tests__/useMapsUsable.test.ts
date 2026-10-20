import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const loaded = vi.hoisted(() => ({ value: true }));
vi.mock("@vis.gl/react-google-maps", () => ({ useApiIsLoaded: () => loaded.value }));
const { useMapsUsable } = await import("../useMapsUsable");

describe("useMapsUsable", () => {
  afterEach(() => {
    loaded.value = true;
    delete (window as any).google;
    delete (window as any).gm_authFailure;
  });

  it("is false until the script has loaded", () => {
    loaded.value = false;
    (window as any).google = { maps: { marker: { AdvancedMarkerElement: class {} } } };
    expect(renderHook(() => useMapsUsable()).result.current).toBe(false);
  });

  it("is false when the script loaded but the marker library is missing", () => {
    expect(renderHook(() => useMapsUsable()).result.current).toBe(false);
  });

  it("is true with a working marker library and false after a Maps auth failure", () => {
    (window as any).google = { maps: { marker: { AdvancedMarkerElement: class {} } } };
    const { result } = renderHook(() => useMapsUsable());
    expect(result.current).toBe(true);
    act(() => (window as any).gm_authFailure());
    expect(result.current).toBe(false);
  });
});
