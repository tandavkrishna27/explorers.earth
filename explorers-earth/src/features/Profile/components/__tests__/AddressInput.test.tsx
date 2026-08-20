import { render } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import AddressInput from "../AddressInput";

// Stable mocks shared with the module factory (hoisted above the vi.mock calls).
// `placesLib` must be a STABLE reference — the real useMapsLibrary memoizes it,
// and the setup effect depends on it.
const { AutocompleteMock, addListener, placesLib } = vi.hoisted(() => {
  const addListener = vi.fn();
  const AutocompleteMock = vi.fn(function (this: Record<string, unknown>) {
    this.addListener = addListener;
    this.getPlace = () => ({});
  });
  return { AutocompleteMock, addListener, placesLib: { Autocomplete: AutocompleteMock } };
});

vi.mock("@vis.gl/react-google-maps", () => ({ useMapsLibrary: () => placesLib }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

describe("AddressInput — Google Autocomplete lifecycle", () => {
  beforeEach(() => {
    AutocompleteMock.mockClear();
    addListener.mockClear();
    (globalThis as unknown as { google: unknown }).google = {
      maps: { event: { clearInstanceListeners: vi.fn() } },
    };
  });

  it("creates the Autocomplete exactly once, even when onChange/setPlaces change every render", () => {
    // The real parent (AddLocationModal) passes a NEW inline onChange on every
    // render. Before the fix the setup effect depended on onChange, so each
    // keystroke re-created the Autocomplete and dropped the first selection.
    const { rerender } = render(
      <AddressInput type="listName" label="List Name" onChange={() => {}} setPlaces={vi.fn()} />
    );
    expect(AutocompleteMock).toHaveBeenCalledTimes(1);
    expect(addListener).toHaveBeenCalledWith("place_changed", expect.any(Function));

    // Re-render with fresh callback identities (what typing does).
    rerender(<AddressInput type="listName" label="List Name" onChange={() => {}} setPlaces={vi.fn()} />);
    rerender(<AddressInput type="listName" label="List Name" onChange={() => {}} setPlaces={vi.fn()} />);

    // Still ONE instance — the widget is no longer torn down mid-typing.
    expect(AutocompleteMock).toHaveBeenCalledTimes(1);
  });
});
