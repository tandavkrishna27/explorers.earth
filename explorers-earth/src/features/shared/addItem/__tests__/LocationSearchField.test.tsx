import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, d: string, o?: Record<string, unknown>) => d.replace(/{{(\w+)}}/g, (_m, k) => String(o?.[k] ?? "")) }) }));
vi.mock("@vis.gl/react-google-maps", () => ({ Map: ({ onClick }: { onClick: (e: unknown) => void }) => <div data-testid="map" onClick={() => onClick({ detail: { latLng: { lat: 15.4, lng: 73.8 } } })} />, AdvancedMarker: () => null }));
import LocationSearchField from "../LocationSearchField";
import { createNearbyCache } from "../nearbyCache";

describe("LocationSearchField", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (over: Partial<Parameters<typeof LocationSearchField>[0]> = {}) => {
    const lookup = vi.fn().mockResolvedValue([{ id: "m", title: "Miramar Beach", subtitle: "Beach · 1.2 km" }]);
    const props = {
      query: "", onQueryChange: vi.fn(), searchPlaces: vi.fn().mockResolvedValue([]), nearby: createNearbyCache(lookup),
      locate: vi.fn().mockResolvedValue({ lat: 15.4987, lng: 73.8261 }), onPick: vi.fn(), onPickPin: vi.fn(), onAddManually: vi.fn(), ...over,
    };
    const view = render(<LocationSearchField {...props} />);
    return { props, lookup, rerender: (q: string) => view.rerender(<LocationSearchField {...props} query={q} />) };
  };

  it("typed coordinates resolve to a pin plus nearest places, and never call text search", async () => {
    const { props, lookup, rerender } = setup();
    rerender("15.49, 73.82");
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(screen.getByText("Pin at 15.4900, 73.8200")).toBeInTheDocument();
    expect(lookup).toHaveBeenCalledWith({ lat: 15.49, lng: 73.82 });
    expect(props.searchPlaces).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use the pin as a custom place" }));
    expect(props.onPickPin).toHaveBeenCalledWith({ lat: 15.49, lng: 73.82 });
  });

  it("my location asks only on tap and lists nearby places", async () => {
    const { props } = setup();
    expect(props.locate).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use my current location" })); });
    expect(props.locate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("option", { name: /Miramar Beach/ })).toBeInTheDocument();
  });

  it("denied location shows a hint and does not re-prompt", async () => {
    const { props } = setup({ locate: vi.fn().mockRejectedValue(Object.assign(new Error("denied"), { code: 1 })) });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use my current location" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("Location is off. Type a place or use the map.");
    expect(screen.getByRole("button", { name: "Use my current location" })).toBeDisabled();
    expect(props.locate).toHaveBeenCalledTimes(1);
  });

  it("map opens the sheet; Use this pin continues with the pin", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Pick on map" }));
    fireEvent.click(screen.getByTestId("map"));
    fireEvent.click(screen.getByRole("button", { name: "Use this pin" }));
    expect(props.onPickPin).toHaveBeenCalledWith({ lat: 15.4, lng: 73.8 });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
