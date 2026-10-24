import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AddItemPage, LocationSearchField, PickedItemCard, useAddItemMode, type ItemSearchResult, type LatLng } from "../../shared/addItem";
import TaxonomyCombobox, { type TaxonomyValue } from "../../../components/TaxonomyCombobox";
import type { TaxonomyTerm } from "../../../components/taxonomyFilter";
import StarRating from "../../../components/StarRating";
import ReorderableFileStrip from "../../../components/reorder/ReorderableFileStrip";
import ReorderableMediaStrip from "../../../components/reorder/ReorderableMediaStrip";
import { EarthLoader } from "../../../components/EarthLoader";
import { withGoogleMapsProvider } from "../../../components/GoogleMapsProvider";
import { ACCEPTED_IMAGE_ACCEPT_ATTRIBUTE } from "../../../utils/imageFileValidation";
import { resolveBack } from "../../../lib/navigation/originBack";
import { recordViewedObservation } from "../../../lib/viewedRevisions";
import useAuthStore from "../../../store/store";
import type { CompleteTaxonomyCatalog, RecommendationObservation } from "../../../lib/explorersApiClient";
import type { Places } from "../../Profile/types/types";
import { useAddRecommendation, PLACE_PHOTO_LIMIT } from "../hooks/useAddRecommendation";
import { usePlacesOwner } from "../hooks/usePlacesOwner";
import { PlacesClient } from "../api/placesClient";
import { importGooglePlacePhotos } from "../api/googlePlacePhotos";
import { createPlacesNearby, isOsmPlaceId, type NearbySource } from "../api/placesNearbyClient";
import { usePlaceNameSearch } from "../api/placeNameSearch";
import { placeListPath } from "../placeListRoute";
import TiptapEditor from "./TiptapEditor";

type GoogleMedia = { photoBlob?: Blob; mediaId?: string; fileName?: string; url?: string; isThumbnail?: boolean; documentId?: string; id?: string };
type Picked = { title: string; subtitle?: string };
type OwnerPlace = NonNullable<ReturnType<typeof usePlacesOwner>["data"]>["recommendationLists"][number]["recommended_places"][number];
type EditHydration = { scope: string; place: OwnerPlace; observation: RecommendationObservation };

const field = "w-full rounded-lg border border-white/10 bg-[#0b0f15] px-3 py-2 text-sm";
const coord = (text: string) => { const n = Number(text); return text.trim() !== "" && Number.isFinite(n) ? n : null; };

/** Browser location, asked for only when the owner taps "Use my current location" (ADD-07). */
const locate = () => new Promise<LatLng>((resolve, reject) => {
  if (!navigator.geolocation) { reject(Object.assign(new Error("unavailable"), { code: 2 })); return; }
  navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), reject, { enableHighAccuracy: true, timeout: 10000 });
});

// Add or edit a place on the shared add-item template (scope ADD-01, ADD-04, ADD-06..10).
function AddPlacePage({ type }: { type?: "edit" | "default" }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { listId, placeId } = useParams();
  const editing = type === "edit";
  const nameSearch = usePlaceNameSearch();
  const [nearbySource, setNearbySource] = useState<NearbySource | null>(null);
  const nearby = useMemo(() => createPlacesNearby(setNearbySource), []);

  // ── Edit hydration: the owner read holds every list complete (ticket 5.1) ──
  const accountId = useAuthStore((s) => s.accountId), generation = useAuthStore((s) => s.generation);
  const scope = JSON.stringify([accountId, generation, location.pathname]);
  const owner = usePlacesOwner(undefined, Boolean(placeId));
  const [hydration, setHydration] = useState<EditHydration>();
  const candidate = useMemo(() => {
    if (!placeId) return undefined;
    for (const list of owner.data?.recommendationLists ?? []) {
      const found = list.recommended_places.find((p: { documentId: string }) => p.documentId === placeId);
      if (found) return found;
    }
    return undefined;
  }, [owner.data, placeId]);
  const candidateObservation = placeId ? owner.content?.details.get(placeId) : undefined;
  const retained = hydration?.scope === scope ? hydration : undefined;
  const fresh = useMemo<EditHydration | undefined>(() => (retained || !candidate || !candidateObservation ? undefined : { scope, place: candidate, observation: candidateObservation }), [retained, candidate, candidateObservation, scope]);
  useEffect(() => { if (fresh) setHydration(fresh); }, [fresh]);
  const edit = retained ?? fresh;
  const editedPlace = edit?.place;
  const fetchedPlace = useMemo(() => (editedPlace ? { recommendedPlace: editedPlace } : undefined), [editedPlace]);
  const [reviewMessage, setReviewMessage] = useState<string>();

  // ── Form state ──
  const mode = useAddItemMode<Picked>();
  const [places, setPlaces] = useState<Places | null>(null);
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyValue>({ categoryId: null, subcategoryId: null });
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [recommendedBy, setRecommendedBy] = useState("");
  const [socialLink, setSocialLink] = useState("");
  const [fetchedGoogleMedia, setFetchedGoogleMedia] = useState<GoogleMedia[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<Array<{ url: string; type: "image" | "video"; file: File }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [savingKind, setSavingKind] = useState<"save" | "another">("save");
  const userInputRef = useRef<HTMLInputElement>(null);
  const afterCreatePathRef = useRef<string | null>(null);
  const hydratedFor = useRef<string>();

  useEffect(() => {
    if (!editing || !editedPlace || hydratedFor.current === editedPlace.documentId) return;
    hydratedFor.current = editedPlace.documentId;
    const d = editedPlace.Place_Details;
    setTitle(d?.Title ?? "");
    setAddress(d?.Place_Address ?? "");
    setLat(d?.Geometry ? String(d.Geometry.lat) : "");
    setLng(d?.Geometry ? String(d.Geometry.lng) : "");
    setTaxonomy({ categoryId: editedPlace.placesTaxonomy?.category?.id ?? null, subcategoryId: editedPlace.placesTaxonomy?.subcategory?.id ?? null });
    setRating(editedPlace.user_rating ?? null);
    setNote(editedPlace.user_recommendation_note ?? "");
    setRecommendedBy(editedPlace.Users_Social_URL ?? "");
    setSocialLink(editedPlace.Places_Website || editedPlace.Places_Social_Link || "");
    mode.pick({ title: d?.Title ?? "", subtitle: d?.Place_Address ?? undefined });
  }, [editing, editedPlace]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useAddRecommendation({
    places, googlePlaceRefId: editedPlace?.Place_Details?.Place_Id ?? undefined, type, isCustom: true, placeId, listId,
    fetchedListId: editedPlace?.recommendation_list?.documentId, fetchedGoogleMedia, setPreviewUrl, setIsLoading,
    userInputRef, fetchedPlace, editObservation: edit?.observation, afterCreatePathRef,
  });
  const hasMediaFailure = save.mediaStatus === "upload-failed" || save.mediaStatus === "metadata-failed";

  // ── Places taxonomy (two levels, searchable) ──
  const [catalog, setCatalog] = useState<{ scope: string; value?: CompleteTaxonomyCatalog; error?: string }>();
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void PlacesClient.readTaxonomyCatalog(controller.signal)
      .then((value) => { if (!controller.signal.aborted) setCatalog({ scope, value }); })
      .catch((error) => { if (!controller.signal.aborted) setCatalog({ scope, error: error?.message || "Places taxonomy could not be loaded." }); });
    return () => controller.abort();
  }, [scope, catalogAttempt]);
  const terms: TaxonomyTerm[] = useMemo(() => (catalog?.scope === scope ? catalog.value?.items ?? [] : [])
    .map((term) => ({ id: term.id, parentId: term.parentId, position: term.position, label: term.label })), [catalog, scope]);
  const storedLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    const tx = editedPlace?.placesTaxonomy;
    if (tx?.category?.id && tx.category.label) labels[tx.category.id] = tx.category.label;
    if (tx?.subcategory?.id && tx.subcategory.label) labels[tx.subcategory.id] = tx.subcategory.label;
    return labels;
  }, [editedPlace]);

  // ── Google photos for a picked Google place (PLC-02), as before ──
  useEffect(() => {
    if (editing || !places?.place_id) return;
    if (import.meta.env.MODE === "test" || window.location.hostname === "localhost") return;
    let live = true;
    setPhotosLoading(true);
    importGooglePlacePhotos(places.place_id, PLACE_PHOTO_LIMIT)
      .then((imported) => {
        if (!live) return;
        const photos = imported.photos.map((media) => ({ isThumbnail: false, mediaId: media.id, url: media.url }));
        setFetchedGoogleMedia(photos);
        if (!photos.length) toast.error(t(imported.failed ? "toast.error.placePhotosImportFailed" : "toast.error.noImagesFoundForPlace"));
      })
      .catch(() => { if (live) toast.error(t("toast.error.placePhotosImportFailed")); })
      .finally(() => { if (live) setPhotosLoading(false); });
    return () => { live = false; };
  }, [places?.place_id, editing, t]);

  const fallback = placeListPath(listId ?? editedPlace?.recommendation_list?.documentId);
  const back = () => navigate(resolveBack({ state: location.state, search: location.search, currentPathname: location.pathname, fallback: { to: fallback, label: "" } }).to);

  // ── Search outcomes ──
  const setPoint = (point: LatLng | null) => { setLat(point ? String(point.lat) : ""); setLng(point ? String(point.lng) : ""); };
  const applyPin = (pin: LatLng, name = "") => {
    setPlaces(null); setFetchedGoogleMedia([]); setPoint(pin); setAddress("");
    setTitle(name); mode.setManualName(name); mode.goManual();
  };
  const onPick = async (result: ItemSearchResult) => {
    const near = nearby.place(result.id);
    if (isOsmPlaceId(result.id)) { if (near) applyPin({ lat: near.lat, lng: near.lng }, result.title); return; }
    mode.pick({ title: result.title, subtitle: result.subtitle });
    setTitle(result.title); setAddress(result.subtitle ?? ""); setPoint(near ? { lat: near.lat, lng: near.lng } : null);
    try {
      const place = await nameSearch.select(result.id);
      setPlaces(place);
      setTitle(place.name || result.title);
      setAddress(place.formatted_address ?? result.subtitle ?? "");
      if (place.geometry) setPoint({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng() });
      mode.pick({ title: place.name || result.title, subtitle: place.formatted_address ?? result.subtitle });
    } catch {
      setPlaces(null);
    }
  };
  const addManually = () => { setPlaces(null); setFetchedGoogleMedia([]); setTitle((v) => v || mode.query); mode.goManual(); };
  const change = () => { setPlaces(null); setFetchedGoogleMedia([]); mode.change(); };

  // ── Save (the WP5 save path in useAddRecommendation) ──
  const latitude = coord(lat), longitude = coord(lng);
  const values = () => {
    const tx = editedPlace?.placesTaxonomy;
    const taxonomyChanged = (tx?.category?.id ?? null) !== taxonomy.categoryId || (tx?.subcategory?.id ?? null) !== taxonomy.subcategoryId;
    return {
      title: title.trim(),
      address: address.trim(),
      geoCoords: latitude !== null && longitude !== null ? JSON.stringify({ lat: latitude, lng: longitude }) : "",
      ...((editing ? taxonomyChanged : taxonomy.categoryId) ? { placesTaxonomy: { categoryTermId: taxonomy.categoryId, subcategoryTermId: taxonomy.subcategoryId } } : {}),
      reason: note,
      userRating: rating,
      socialLink: socialLink.trim(),
      recommendationLink: recommendedBy.trim(),
      // The form does not show contact details; an edit carries the stored ones forward.
      contactName: editedPlace?.Contact_Name ?? "",
      contactNumber: editedPlace?.Contact_Number ?? "",
      contactVisibility: editedPlace?.Contact_Visibility ?? "private",
    };
  };
  const submit = async (another: boolean) => {
    setSavingKind(another ? "another" : "save");
    if (editing) { await save.handleUpdatePlaceDetails(values()).catch(() => undefined); return; }
    afterCreatePathRef.current = another
      ? `${location.pathname}${location.search}`
      : resolveBack({ state: location.state, search: location.search, currentPathname: location.pathname, fallback: { to: fallback, label: "" } }).to;
    await save.handleSubmit(values());
  };
  const canSave = title.trim().length > 0 && !photosLoading && !hasMediaFailure && (lat.trim() === "" && lng.trim() === "" || (latitude !== null && longitude !== null));

  if (editing && owner.loading && !edit) {
    return <div className="flex min-h-screen items-center justify-center"><EarthLoader context="general" size="small" /></div>;
  }

  return (
    <AddItemPage
      title={editing ? t("dashboard.wp6.editPlace", "Edit place") : t("dashboard.wp6.addPlace", "Add a place")}
      backLabel={t("dashboard.wp6.backToList", "Back to list")}
      onBack={back}
      mode={mode.mode}
      onBackToSearch={editing ? undefined : mode.backToSearch}
      bar={{ onCancel: back, onSave: () => void submit(false), onSaveAndAddAnother: editing ? undefined : () => void submit(true), saving: isLoading ? savingKind : null, canSave }}
    >
      {hasMediaFailure && (
        <div role="alert" data-media-status={save.mediaStatus} className="rounded-xl border border-amber-400/50 bg-amber-400/10 p-4">
          <b className="text-sm">{t("dashboard.wp6.photoUploadFailed", "Photo upload failed; place not saved yet")}</b>
          <p className="mt-1 text-xs text-gray-400">{save.mediaFeedback}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void save.retryMediaUpload()} className="min-h-11 rounded-lg bg-blue-400 px-4 text-sm text-white">{t("dashboard.wp6.retryImage", "Retry image save")}</button>
            <button type="button" onClick={() => void save.continueWithoutImage()} className="min-h-11 rounded-lg border border-white/10 px-4 text-sm">{t("dashboard.wp6.continueWithoutImage", "Continue without image")}</button>
          </div>
        </div>
      )}
      {save.editConflict && (
        <div role="alert" className="rounded-xl border border-amber-400/50 p-3 text-sm">
          {t("dashboard.wp6.editConflict", "This recommendation changed. Your draft is retained.")}{" "}
          <button type="button" className="underline" onClick={async () => {
            if (!placeId || !edit) return;
            try {
              const observation = await PlacesClient.observeRecommendation(placeId);
              recordViewedObservation(observation);
              setHydration((previous) => (previous && previous.scope === scope ? { ...previous, observation } : previous));
              save.clearEditConflict();
              setReviewMessage(t("dashboard.wp6.reviewDraft", "Current revision loaded. Review your draft, then save again."));
            } catch (error) { toast.error(error instanceof Error ? error.message : "Refresh failed"); }
          }}>{t("dashboard.wp6.refreshReview", "Refresh and review")}</button>
        </div>
      )}
      {reviewMessage && <p role="status" className="text-sm">{reviewMessage}</p>}

      {mode.mode === "search" && (
        <>
          <LocationSearchField query={mode.query} onQueryChange={mode.setQuery} searchPlaces={nameSearch.search} nearby={nearby.cache}
            locate={locate} onPick={(r) => void onPick(r)} onPickPin={(pin) => applyPin(pin)} onAddManually={addManually} />
          {nearbySource === "osm" && <p className="text-xs text-gray-400">{t("dashboard.wp6.osmNote", "Showing OpenStreetMap results.")}</p>}
        </>
      )}
      {mode.mode === "picked" && mode.picked && <PickedItemCard title={mode.picked.title} subtitle={mode.picked.subtitle} onChange={change} />}

      {mode.mode !== "search" && (
        <div className="grid gap-4" onChange={() => save.retireDraftIntent()}>
          <label className="grid gap-1 text-xs">{t("dashboard.wp6.placeName", "Place name")}
            <input className={field} maxLength={500} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="grid gap-1 text-xs">{t("dashboard.wp6.address", "Address")}
            <input className={field} value={address} onChange={(e) => setAddress(e.target.value)} /></label>
          {mode.mode === "manual" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs">{t("dashboard.wp6.latitude", "Latitude")}
                <input className={field} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} /></label>
              <label className="grid gap-1 text-xs">{t("dashboard.wp6.longitude", "Longitude")}
                <input className={field} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} /></label>
            </div>
          )}
          {catalog?.scope === scope && catalog.error ? (
            <p role="alert" className="text-xs text-red-300">{catalog.error}{" "}
              <button type="button" className="underline" onClick={() => setCatalogAttempt((n) => n + 1)}>{t("dashboard.wp6.retry", "Retry")}</button></p>
          ) : (
            <TaxonomyCombobox terms={terms} levels={2} value={taxonomy} storedLabels={storedLabels}
              onChange={(next) => { save.retireDraftIntent(); setTaxonomy(next); }} />
          )}

          <section className="grid gap-2">
            <span className="text-xs">{t("dashboard.wp6.photos", "Photos")}</span>
            {fetchedGoogleMedia.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label={t("dashboard.wp6.googlePhotos", "Photos from Google")}>
                {fetchedGoogleMedia.map((image, index) => (
                  <li key={image.mediaId ?? index} className="relative">
                    <img src={image.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                    <button type="button" aria-label={t("dashboard.wp6.removePhoto", "Remove photo")} onClick={() => setFetchedGoogleMedia((m) => m.filter((x) => x !== image))}
                      className="absolute right-1 top-1 rounded bg-black/70 px-1 text-xs">×</button>
                  </li>
                ))}
              </ul>
            )}
            {photosLoading && <p className="text-xs text-gray-400">{t("dashboard.wp6.fetchingPhotos", "Fetching photos…")}</p>}
            {editing && save.savedPhotoIds.length > 0 && (
              <ReorderableMediaStrip items={save.savedPhotoIds.map((id) => ({ id, url: `/api/explorers/v1/media/${id}/content` }))}
                onChange={(next) => save.setSavedPhotoIds(next.map((item) => item.id))} noun="Saved photo" alt="" removeLabel="Remove saved photo" removable={false} disabled={isLoading} />
            )}
            {previewUrl.length > 0 && (
              <ReorderableFileStrip files={previewUrl.map((p) => p.file)} previews={previewUrl.map((p) => p.url)} kinds={previewUrl.map((p) => p.type)}
                noun="New photo" alt="" removeLabel="Remove new photo" disabled={isLoading}
                onChange={(files) => {
                  if (files.length < previewUrl.length) {
                    const removed = previewUrl.findIndex((p) => !files.includes(p.file));
                    if (removed >= 0) save.handleDeleteUserImage(previewUrl[removed].url, removed);
                  } else save.reorderUserMedia(files);
                }} />
            )}
            <button type="button" onClick={save.handleUploadMedia} className="min-h-11 justify-self-start rounded-xl border border-dashed border-blue-400/60 px-4 text-sm text-blue-300">
              {t("dashboard.wp6.addPhotos", "Add photos")}</button>
            <input ref={userInputRef} type="file" multiple hidden accept={ACCEPTED_IMAGE_ACCEPT_ATTRIBUTE} onChange={(e) => void save.handleFileChange(e)} />
          </section>

          <div className="grid gap-1 text-xs"><span>{t("dashboard.wp6.yourRating", "Your rating")}</span>
            <StarRating value={rating} onChange={setRating} label={t("dashboard.wp6.yourRating", "Your rating")} /></div>
          <div className="grid gap-1 text-xs"><span>{t("dashboard.wp6.note", "Why you recommend it")}</span>
            <TiptapEditor value={note} onChange={setNote} placeholder={t("dashboard.wp6.notePlaceholder", "What makes this place worth a visit?")} /></div>
          <label className="grid gap-1 text-xs">{t("dashboard.wp6.recommendedBy", "Recommended by")}
            <input className={field} value={recommendedBy} placeholder="@handle or link" onChange={(e) => setRecommendedBy(e.target.value)} /></label>
          <label className="grid gap-1 text-xs">{t("dashboard.wp6.placeLink", "Place's website or social link")}
            <input className={field} value={socialLink} onChange={(e) => setSocialLink(e.target.value)} /></label>
        </div>
      )}
    </AddItemPage>
  );
}

export default withGoogleMapsProvider(AddPlacePage);
