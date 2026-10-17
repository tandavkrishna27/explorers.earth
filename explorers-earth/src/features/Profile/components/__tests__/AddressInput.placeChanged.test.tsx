import { render, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the place_changed listener and count Autocomplete constructions.
let placeChangedCb: (() => void) | null = null;
let constructCount = 0;
// The place the (single) Autocomplete instance currently reports.
let currentPlace: Record<string, unknown> = {};

class FakeAutocomplete {
  constructor() {
    constructCount += 1;
  }
  addListener(evt: string, cb: () => void) {
    if (evt === "place_changed") placeChangedCb = cb;
  }
  getPlace() {
    return currentPlace;
  }
}

vi.mock("@vis.gl/react-google-maps", () => {
  let lib: { Autocomplete: typeof FakeAutocomplete } | null = null;
  return {
    APIProvider: ({ children }: { children?: React.ReactNode }) => children,
    useMapsLibrary: () => {
      if (!lib) lib = { Autocomplete: FakeAutocomplete };
      return lib;
    },
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("../../../../assets/icons/CurrLocation", () => ({
  default: () => null,
}));

// axios.get returns a promise we resolve manually so we can control ordering.
const { axiosGet, resolvers } = vi.hoisted(() => {
  const resolvers: Array<(v: unknown) => void> = [];
  return {
    resolvers,
    axiosGet: vi.fn(
      () => new Promise((res) => resolvers.push(res as (v: unknown) => void))
    ),
  };
});
vi.mock("axios", () => ({ default: { get: axiosGet } }));

(globalThis as unknown as { google: unknown }).google = {
  maps: { event: { clearInstanceListeners: vi.fn() } },
};

import AddressInput from "../AddressInput";

const makePlace = (id: string) => ({
  place_id: id,
  name: `Place ${id}`,
  geometry: { location: { lat: () => 1, lng: () => 2 } },
  formatted_address: `${id}, India`,
  address_components: [],
});

describe("AddressInput place_changed (BUG-4)", () => {
  beforeEach(() => {
    placeChangedCb = null;
    constructCount = 0;
    currentPlace = {};
    resolvers.length = 0;
    axiosGet.mockClear();
  });

  it("builds the Autocomplete once across a parent re-render and captures the selection", async () => {
    const setPlaces = vi.fn();
    const onChange = vi.fn();

    const { rerender } = render(
      <AddressInput
        type="listName"
        label="x"
        setPlaces={setPlaces}
        onChange={onChange}
        placeHolder="p"
      />
    );

    // A keystroke-driven re-render gives new closure identities for the callbacks.
    rerender(
      <AddressInput
        type="listName"
        label="x"
        setPlaces={(...a) => setPlaces(...a)}
        onChange={(...a) => onChange(...a)}
        placeHolder="p"
      />
    );

    expect(constructCount).toBe(1);
    expect(placeChangedCb).toBeTruthy();

    currentPlace = makePlace("A");
    await act(async () => {
      placeChangedCb!();
      await Promise.resolve();
    });
    await act(async () => {
      resolvers[0]({ data: { primaryType: "park", rating: 4.5 } });
      await Promise.resolve();
    });

    expect(setPlaces).toHaveBeenCalledTimes(1);
    expect(setPlaces.mock.calls[0][0]).toMatchObject({ place_id: "A" });
  });

  it("ignores an earlier selection whose metadata request resolves LAST", async () => {
    const setPlaces = vi.fn();
    const onChange = vi.fn();

    render(
      <AddressInput
        type="listName"
        label="x"
        setPlaces={setPlaces}
        onChange={onChange}
        placeHolder="p"
      />
    );
    expect(placeChangedCb).toBeTruthy();

    // Selection A → starts request 0 (in flight).
    currentPlace = makePlace("A");
    await act(async () => {
      placeChangedCb!();
      await Promise.resolve();
    });

    // Selection B → starts request 1 (in flight). B is the latest intent.
    currentPlace = makePlace("B");
    await act(async () => {
      placeChangedCb!();
      await Promise.resolve();
    });

    expect(axiosGet).toHaveBeenCalledTimes(2);

    // B resolves FIRST → applied.
    await act(async () => {
      resolvers[1]({ data: { primaryType: "cafe", rating: 4.9 } });
      await Promise.resolve();
    });
    // A resolves LAST → must be dropped as stale.
    await act(async () => {
      resolvers[0]({ data: { primaryType: "park", rating: 3.1 } });
      await Promise.resolve();
    });

    // Only B's value was applied; A never overwrote it.
    const appliedIds = setPlaces.mock.calls.map(
      (c) => (c[0] as { place_id: string }).place_id
    );
    expect(appliedIds).toEqual(["B"]);
    expect(appliedIds).not.toContain("A");
    // onChange (final value) likewise reflects only B.
    expect(onChange).toHaveBeenLastCalledWith("B, India", "selection");
    expect(onChange.mock.calls.map(([value]) => value)).not.toContain("A, India");
  });
});
