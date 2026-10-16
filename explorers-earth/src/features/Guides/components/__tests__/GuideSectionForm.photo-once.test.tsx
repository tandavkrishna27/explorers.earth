import { StrictMode, useRef, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Execute the production closures with real React state and StrictMode replay.
// Only external photo/price services and unrelated UI setters are substituted.
const source = readFileSync(resolve("src/features/Guides/components/GuideSectionForm.tsx"), "utf8");
const parsed = ts.createSourceFile("GuideSectionForm.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["addPlaceToSegment", "fetchAndUploadActivityPhotos"];
const declarations: string[] = [];
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) {
    declarations.push(`const ${node.getText(parsed)};`);
  }
  ts.forEachChild(node, visit);
}
visit(parsed);
if (declarations.length !== names.length) throw new Error("Missing production photo closures");
const compiled = ts.transpileModule(declarations.join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const bind = new Function("deps", `const { activityPlaces, setActivityPlaces, pendingActivityUploadsRef,
  setMorningPlaces, setAfternoonPlaces, setEveningPlaces, setTimelineSearch,
  setTempTimelinePlace, setStayAccommodations, isAccommodation, isActivity,
  toast, fetchPlacePriceLevel, fetchGooglePlacePhotos, uploadActivityPhotos } = deps;
  ${compiled}
  return addPlaceToSegment;`);

function setup(initial: any[] = [], reject = false) {
  let release!: (photos: any[]) => void;
  const photos = new Promise<any[]>((resolve) => { release = resolve; });
  const fetchPhotos = vi.fn(() => photos);
  const uploaded = [{ id: 7, url: "/uploads/museum.jpg" }];
  const upload = vi.fn(async () => {
    if (reject) throw new Error("upload failed");
    return uploaded;
  });
  let pending!: { current: Promise<any>[] };
  let setPlaces!: React.Dispatch<React.SetStateAction<any[]>>;
  let current!: any[];
  const noop = () => {};
  function Harness() {
    const [activityPlaces, setActivityPlaces] = useState(initial);
    pending = useRef<Promise<any>[]>([]);
    current = activityPlaces;
    setPlaces = setActivityPlaces;
    const add = bind({ activityPlaces, setActivityPlaces, pendingActivityUploadsRef: pending,
      setMorningPlaces: noop, setAfternoonPlaces: noop, setEveningPlaces: noop,
      setTimelineSearch: noop, setTempTimelinePlace: noop, setStayAccommodations: noop,
      isAccommodation: () => false, isActivity: () => true, toast: { success: noop },
      fetchPlacePriceLevel: async () => null, fetchGooglePlacePhotos: fetchPhotos,
      uploadActivityPhotos: upload });
    return <button onClick={() => {
      // An already queued activity update forces React to evaluate the next updater during render.
      setActivityPlaces((prev) => [...prev]);
      add("morning", { name: "Museum", place_id: "museum", types: ["museum"] });
    }}>Add</button>;
  }
  render(<StrictMode><Harness /></StrictMode>);
  return { fetchPhotos, upload, uploaded, release, pending: () => pending.current,
    current: () => current, remove: () => setPlaces([]) };
}

describe("GuideSectionForm activity photo operation", () => {
  it("starts one provider operation and tracks one settlement when StrictMode replays the updater", async () => {
    const fixture = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(fixture.fetchPhotos).toHaveBeenCalledTimes(1);
    expect(fixture.fetchPhotos).toHaveBeenCalledWith("museum", 6);
    expect(fixture.pending()).toHaveLength(1);
    expect(fixture.current()).toHaveLength(1);
    const localId = fixture.current()[0].id;
    expect(fixture.current()[0]).toMatchObject({ photosLoading: true, photos: [] });
    await act(async () => { fixture.release(["provider-photo"]); await Promise.all(fixture.pending()); });
    expect(fixture.upload).toHaveBeenCalledTimes(1);
    expect(fixture.current()[0]).toMatchObject({ id: localId, photosLoading: false, photos: fixture.uploaded });
    expect(await fixture.pending()[0]).toEqual({ place_id: "museum", photos: fixture.uploaded });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(fixture.fetchPhotos).toHaveBeenCalledTimes(1);
    expect(fixture.current()).toHaveLength(1);
  });

  it("settles without restoring an activity removed before photos arrive", async () => {
    const fixture = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    act(() => fixture.remove());
    await act(async () => { fixture.release([]); await Promise.all(fixture.pending()); });
    expect(fixture.current()).toEqual([]);
    expect(fixture.upload).not.toHaveBeenCalled();
    expect(await fixture.pending()[0]).toEqual({ place_id: "museum", photos: [] });
  });

  it("clears loading and settles the tracked operation if upload fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const fixture = setup([], true);
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      await act(async () => { fixture.release(["provider-photo"]); await Promise.all(fixture.pending()); });
      expect(fixture.current()[0]).toMatchObject({ photosLoading: false, photos: [] });
      expect(await fixture.pending()[0]).toEqual({ place_id: "museum", photos: [] });
    } finally { error.mockRestore(); }
  });
});
