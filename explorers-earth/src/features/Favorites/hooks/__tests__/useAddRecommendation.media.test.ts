import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAddRecommendation, placeFacts, recommendationContext } from "../useAddRecommendation";

// Ticket 5.1. The same state machine this file has always protected — a media failure
// never loses the recommendation, and a retry never creates a second one — now against the
// native owner commands. Two cases changed shape because the step they covered is gone:
// Strapi needed a numeric id lookup before media could be attached, and the native command
// addresses the recommendation by the id it returned, so media cannot reach a different
// one. What replaced those cases asserts exactly that.

vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn() } }));

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  createPlace: vi.fn(),
  createPerson: vi.fn(),
  updatePlace: vi.fn(),
  correctFacts: vi.fn(),
  upload: vi.fn(),
  setSelectedCity: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => mocks.navigate,
}));

vi.mock("../../api/placesCommands", () => ({
  usePlacesCommands: () => ({
    createPlace: mocks.createPlace,
    createPerson: mocks.createPerson,
    updatePlace: mocks.updatePlace,
    correctFacts: mocks.correctFacts,
    upload: mocks.upload,
    loading: false,
  }),
}));

vi.mock("../usePlacesOwner", () => ({
  usePlacesOwner: () => ({
    data: { recommendationLists: [{ documentId: "list-1", List_Name: "Favorites", slug: "favorites", Visibility: true, account: { documentId: "acc" }, recommended_places: [] }] },
    loading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../../../../store/store", () => ({
  default: () => ({ token: "token", user: { username: "alice" } }),
}));

vi.mock("../../../../store/useCityStore", () => ({
  useCityStore: () => ({
    selectedCity: { documentId: "list-1", List_Name: "Favorites", recommended_places: [] },
    setSelectedCity: mocks.setSelectedCity,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() });
  return { toast };
});

const created = { id: "created-place" };

const selectedMedia = [{
  photoBlob: new Blob(["image"], { type: "image/jpeg" }),
  fileName: "place.jpg",
  url: "blob:place",
  isThumbnail: false,
}];

const values = { title: "Saved place", address: "Address" };

const defaultProps = (fetchedGoogleMedia: unknown[] = selectedMedia) => ({
  places: null,
  listId: "list-1",
  type: "default",
  fetchedListId: undefined,
  fetchedGoogleMedia,
  instagramMedia: [],
  setPreviewUrl: vi.fn(),
  setIsLoading: vi.fn(),
  userInputRef: { current: null },
  isCustom: false,
  recommendationType: "place" as const,
});

const renderMediaHook = (fetchedGoogleMedia: unknown[] = selectedMedia) =>
  renderHook(
    ({ media }) => useAddRecommendation(defaultProps(media) as never),
    { initialProps: { media: fetchedGoogleMedia } },
  );

describe("useAddRecommendation selected-media persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createPlace.mockResolvedValue(created);
    mocks.updatePlace.mockResolvedValue({ id: created.id });
    mocks.upload.mockResolvedValue({ id: "media-1" });
  });

  it("reports saved only after selected media uploads and is attached", async () => {
    const { result } = renderMediaHook();

    await act(async () => {
      await result.current.handleSubmit(values as never);
    });

    expect(result.current.mediaStatus).toBe("saved");
    expect(mocks.createPlace).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    // Provider imagery becomes the place's gallery, not the creator's own media.
    expect(mocks.updatePlace).toHaveBeenCalledWith(created.id, {
      mediaIds: [],
      placePhotos: { photoMediaIds: ["media-1"] },
    });
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it("attaches media only to the recommendation that was created", async () => {
    // Strapi needed an id lookup here, and a lookup row for another record could attach
    // media to the wrong recommendation. The command carries the created id instead.
    const { result } = renderMediaHook();
    await act(async () => {
      await result.current.handleSubmit(values as never);
    });
    expect(mocks.updatePlace.mock.calls[0][0]).toBe(created.id);
    expect(result.current.createdRecommendationDocumentId).toBe(created.id);
  });

  it("reports not-selected and completes without uploading or claiming an image", async () => {
    const { result } = renderMediaHook([]);

    await act(async () => {
      await result.current.handleSubmit(values as never);
    });

    expect(result.current.mediaStatus).toBe("not-selected");
    expect(mocks.createPlace).toHaveBeenCalledTimes(1);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.updatePlace).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it("keeps the created record and selected files after an upload failure, then retries without creating again", async () => {
    mocks.upload.mockRejectedValueOnce(new Error("upload failed"));
    const hook = renderMediaHook();

    await act(async () => {
      await hook.result.current.handleSubmit(values as never);
    });

    expect(hook.result.current.mediaStatus).toBe("upload-failed");
    expect(hook.result.current.createdRecommendationDocumentId).toBe(created.id);
    expect(mocks.navigate).not.toHaveBeenCalled();

    // Even if the staged media disappears from props, the attempt keeps its own copy.
    hook.rerender({ media: [] });
    await act(async () => {
      await hook.result.current.retryMediaUpload();
    });

    expect(hook.result.current.mediaStatus).toBe("saved");
    expect(mocks.createPlace).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it("retries only the failed upload on the same record", async () => {
    const blobs = [
      { photoBlob: new Blob(["a"], { type: "image/jpeg" }), fileName: "a.jpg", isThumbnail: false },
      { photoBlob: new Blob(["b"], { type: "image/jpeg" }), fileName: "b.jpg", isThumbnail: false },
    ];
    mocks.upload.mockResolvedValueOnce({ id: "media-a" }).mockRejectedValueOnce(new Error("upload failed"));
    const { result } = renderMediaHook(blobs);

    await act(async () => {
      await result.current.handleSubmit(values as never);
    });
    expect(result.current.mediaStatus).toBe("upload-failed");
    expect(mocks.upload).toHaveBeenCalledTimes(2);

    mocks.upload.mockResolvedValue({ id: "media-b" });
    await act(async () => {
      await result.current.retryMediaUpload();
    });

    expect(result.current.mediaStatus).toBe("saved");
    // The first blob is not uploaded a second time.
    expect(mocks.upload).toHaveBeenCalledTimes(3);
    expect(mocks.updatePlace).toHaveBeenCalledWith(created.id, { mediaIds: [], placePhotos: { photoMediaIds: ["media-a", "media-b"] } });
    expect(mocks.createPlace).toHaveBeenCalledTimes(1);
  });

  it("reports metadata-failed and retries the attachment without uploading the media twice", async () => {
    mocks.updatePlace.mockRejectedValueOnce(new Error("attach failed"));
    const { result } = renderMediaHook();

    await act(async () => {
      await result.current.handleSubmit(values as never);
    });

    expect(result.current.mediaStatus).toBe("metadata-failed");
    expect(mocks.navigate).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.retryMediaUpload();
    });

    expect(result.current.mediaStatus).toBe("saved");
    expect(mocks.createPlace).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.updatePlace).toHaveBeenCalledTimes(2);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it("continues after media failure without retrying or duplicating the recommendation", async () => {
    mocks.upload.mockRejectedValueOnce(new Error("upload failed"));
    const { result } = renderMediaHook();

    await act(async () => {
      await result.current.handleSubmit(values as never);
    });
    await act(async () => {
      await result.current.continueWithoutImage();
    });

    expect(result.current.mediaStatus).toBe("upload-failed");
    expect(mocks.createPlace).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.updatePlace).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it("ignores repeated submit clicks once a recommendation has already been created", async () => {
    mocks.upload.mockRejectedValue(new Error("upload failed"));
    const { result } = renderMediaHook();

    await act(async () => {
      await result.current.handleSubmit(values as never);
      await result.current.handleSubmit(values as never);
    });

    await waitFor(() => expect(result.current.mediaStatus).toBe("upload-failed"));
    expect(mocks.createPlace).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("files a person recommendation through the person command, with no place facts", async () => {
    mocks.createPerson.mockResolvedValue({ id: "created-person" });
    const { result } = renderHook(() =>
      useAddRecommendation({ ...defaultProps([]), recommendationType: "person" } as never)
    );
    await act(async () => {
      await result.current.handleSubmit({ title: "Ravi", recommendation: "https://example.com/ravi", address: "Indiranagar" } as never);
    });
    expect(mocks.createPerson).toHaveBeenCalledTimes(1);
    expect(mocks.createPlace).not.toHaveBeenCalled();
    expect(mocks.createPerson.mock.calls[0][1]).toMatchObject({
      title: "Ravi",
      details: {},
      context: { recommendationType: "person", personProfileUrl: "https://example.com/ravi", personAddress: "Indiranagar" },
    });
  });
});

describe("the facts and the context a recommendation carries", () => {
  it("keeps zero coordinates and refuses to fabricate a pair from half a pair", () => {
    expect(placeFacts({ geoCoords: JSON.stringify({ lat: 0, lng: 0 }) })).toMatchObject({ latitude: 0, longitude: 0 });
    expect(placeFacts({ geoCoords: JSON.stringify({ lat: 12.97 }) })).toMatchObject({ latitude: null, longitude: null });
    expect(placeFacts({ geoCoords: "not json" })).toMatchObject({ latitude: null, longitude: null });
    // Google's maps object exposes coordinates as functions.
    expect(placeFacts({ places: { geometry: { location: { lat: () => 1.5, lng: () => 2.5 } } } as never })).toMatchObject({ latitude: 1.5, longitude: 2.5 });
    // A provider double beyond the stored precision is rounded, not refused.
    expect(placeFacts({ geoCoords: JSON.stringify({ lat: 12.97159871234, lng: 77.5945627 }) }).latitude).toBe(12.9715987);
  });

  it("leaves a creator's contact details private unless they already chose otherwise", () => {
    const fresh = recommendationContext({ contactName: "Priya", contactNumber: "+91 90000 00000" }, { recommendationType: "place", source: "self" });
    expect(fresh).toMatchObject({ contactName: "Priya", contactNumber: "+91 90000 00000", contactVisibility: "private" });
    // An edit carries the existing choice forward rather than re-defaulting it.
    const edited = recommendationContext({ contactName: "Priya" }, {
      recommendationType: "place", source: "self",
      existing: { ...fresh, contactVisibility: "public" },
    });
    expect(edited.contactVisibility).toBe("public");
  });

  it("keeps person fields off a place and place links off a person", () => {
    const place = recommendationContext({ socialLink: "https://example.com/cafe", recommendation: "https://example.com/ravi", address: "Somewhere" }, { recommendationType: "place", source: "self" });
    expect(place).toMatchObject({ placeSocialUrl: "https://example.com/cafe", placeWebsiteUrl: null, personProfileUrl: null, personAddress: null });
    const person = recommendationContext({ socialLink: "https://example.com/site", recommendation: "https://example.com/ravi", address: "Indiranagar" }, { recommendationType: "person", source: "suggestion" });
    expect(person).toMatchObject({ placeSocialUrl: null, placeWebsiteUrl: "https://example.com/site", personProfileUrl: "https://example.com/ravi", personAddress: "Indiranagar", sourceOfRecommendation: "suggestion" });
  });

  it("treats blank form fields as absent rather than as empty strings", () => {
    const blank = recommendationContext({ contactName: "   ", contactNumber: "", socialLink: "" }, { recommendationType: "place", source: "self" });
    expect(blank).toMatchObject({ contactName: null, contactNumber: null, placeSocialUrl: null });
    expect(placeFacts({ address: "  " }).formattedAddress).toBeNull();
  });
});
