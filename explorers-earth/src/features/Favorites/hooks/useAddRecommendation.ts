import { mapsBrowserKey } from "../../../lib/publicRuntimeConfig";
import { normalizeRecommendationLink, normalizeSocialProfileUrl } from "../../../utils/url";
import { validateImageFiles, maxImageMegabytes, type RejectedImage } from "../../../utils/imageFileValidation";
import { useRef, useState } from "react";
import { KeyValuePair } from "../formValues";
import axios from "axios";
import { Places } from "../../Profile/types/types";
import useAuthStore from "../../../store/store";
import {ExplorersApiError,type RecommendationObservation} from "../../../lib/explorersApiClient";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useCityStore } from "../../../store/useCityStore";
import { GOOGLE_PLACES_API_BASE_URL } from "../../../config";
import { usePlacesCommands } from "../api/placesCommands";
import { usePlacesOwner } from "./usePlacesOwner";
import { richNoteFromEditor } from "../../../../../tunes/shared/explorersRichNoteContract";
import { emptyPlaceContext, type PlaceEntityDetails, type PlaceRecommendationContext } from "../../../../../tunes/shared/explorersPlaceContract";
import {placesTaxonomyAssignmentSchema} from '../../../../../tunes/shared/explorersTaxonomyContract';
import { placeListPath } from "../placeListRoute";

/**
 * Ticket 5.1. Adding and editing a place recommendation, on the native owner API.
 *
 * The create → upload → attach state machine is unchanged in substance, because it exists
 * for a real reason: a media failure must never lose the recommendation the creator
 * already wrote, and a retry must never create a second one. What changed underneath it:
 *
 *  - Media goes through the media route as owned assets. The creator's own uploads become
 *    the recommendation's media; provider photos become the place's photo gallery. Both
 *    are owned assets in S3 either way (owner decision, 2026-10-07), so a provider outage
 *    cannot empty a gallery.
 *  - There is no id lookup step. Strapi needed a numeric id before media could be
 *    attached; the native command addresses the recommendation by the id it returned, so
 *    media can never be attached to a different recommendation than the one created.
 *  - The creator's contact details and links are their recommendation's own context, and
 *    contact disclosure is private unless they choose otherwise.
 *  - A correction to the place's own facts repoints this recommendation at a corrected
 *    place rather than rewriting the shared one.
 *  - The claimable-place directory write is gone: 5.1 derives claim lookup from the
 *    canonical place rows and forbids a second, asynchronously stale directory.
 *
 * Places taxonomy is optional, canonical and separate from provider facts.
 */
export const toNumberOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

// TypeScript declaration for window.__walkthrough
declare global {
  interface Window {
    __walkthrough?: {
      advanceToNextStepRef?: { current: (() => void) | null };
      markProcessingCompleteRef?: () => void;
    };
  }
}

// 'self' = the creator pressed Recommend. 'suggestion' = they pressed + on a suggestion.
/** 0047 bounds recommendation_place_photos.slot_index at 0..9. */
export const PLACE_PHOTO_LIMIT = 10;

const RECOMMENDATION_SOURCES = { SELF: "self", SUGGESTION: "suggestion" } as const;
type RecommendationSource = typeof RECOMMENDATION_SOURCES[keyof typeof RECOMMENDATION_SOURCES];

const determineRecommendationSource = (searchParams: URLSearchParams): RecommendationSource => {
  const sourceParam = searchParams.get("source");
  return sourceParam === RECOMMENDATION_SOURCES.SUGGESTION ? RECOMMENDATION_SOURCES.SUGGESTION : RECOMMENDATION_SOURCES.SELF;
};

type GoogleMedia = {
  photoBlob?: Blob;
  /** A provider photo the API already imported into owned media (PLC-02). */
  mediaId?: string;
  fileName?: string;
  url?: string;
  documentId?: string;
  isThumbnail?: boolean;
};

export type RecommendationMediaStatus =
  | "saved"
  | "not-selected"
  | "upload-failed"
  | "metadata-failed";

type PendingRecommendationMedia = {
  key: string;
  /** Exactly one of these: bytes still to upload, or media the API already imported. */
  blob?: Blob;
  mediaId?: string;
  fileName?: string;
  isThumbnail: boolean;
  /** Provider imagery becomes the place's gallery; the creator's own becomes their media. */
  origin: "provider" | "creator";
};

/** A create whose photo upload failed: what the creator submitted, kept for the retry. */
type PendingCreateAttempt = {
  values: KeyValuePair;
  selected: PendingRecommendationMedia[];
};

/** Runs `work` over `items` with at most `limit` in flight; results keep the input order. */
async function mapLimited<T, R>(items: T[], limit: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await work(items[index], index); }
  }));
  return results;
}

/** Photos upload three at a time (OWN-17): serial uploads were one round trip each. */
const PHOTO_UPLOAD_CONCURRENCY = 3;

interface AddRecommendation {
  places?: Places | null;
  listId?: string;
  type?: string;
  googlePlaceRefId?: string;
  placeId?: string;
  fetchedListId?: string;
  fetchedGoogleMedia: GoogleMedia[];
  instagramMedia?: GoogleMedia[];
  setPreviewUrl: React.Dispatch<React.SetStateAction<Array<{ url: string; type: 'image' | 'video'; file: File }>>>;
  setIsLoading: (boolean: boolean) => void;
  userInputRef: React.RefObject<HTMLInputElement>;
  isCustom: boolean;
  /** Where a create lands instead of the list (Save and add another). Read at completion. */
  afterCreatePathRef?: { current: string | null };
  media_details?: {
    scalarId?: string;
    imageDetails?: { id: string; documentId: string }[];
  };
  fetchedPlace?: any;
  editObservation?: RecommendationObservation;
}

/** numeric(10,7) is the stored precision; a provider double is rounded to it. */
const coordinate = (value: unknown): number | null => {
  const parsed = typeof value === "function" ? (value as () => unknown)() : value;
  const numeric = typeof parsed === "string" ? Number(parsed) : parsed;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) return null;
  return Math.round(numeric * 1e7) / 1e7;
};

/**
 * The place's own facts, from whatever the form and the provider supplied.
 *
 * Coordinates are both or neither: zero is a real point and a half-known pair is not a
 * location, so it is stored as none rather than as (0,0).
 */
export function placeFacts(input: {
  address?: unknown; geoCoords?: unknown; places?: Places | null; provider?: any;
}): Partial<PlaceEntityDetails> {
  let latitude: number | null = null;
  let longitude: number | null = null;
  try {
    if (typeof input.geoCoords === "string" && input.geoCoords) {
      const parsed = JSON.parse(input.geoCoords) as { lat?: unknown; lng?: unknown };
      latitude = coordinate(parsed.lat);
      longitude = coordinate(parsed.lng);
    } else if (input.places?.geometry?.location) {
      latitude = coordinate(input.places.geometry.location.lat);
      longitude = coordinate(input.places.geometry.location.lng);
    } else if (input.provider?.location) {
      latitude = coordinate(input.provider.location.latitude);
      longitude = coordinate(input.provider.location.longitude);
    }
  } catch (error) {
    console.warn("Error parsing place coordinates:", error);
    latitude = null;
    longitude = null;
  }
  const paired = latitude !== null && longitude !== null;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const types = Array.isArray(input.places?.types) ? input.places.types.slice(0, 32) : [];
  const priceRange = input.provider?.priceRange;
  return {
    formattedAddress: text(input.address) ?? text(input.places?.formatted_address),
    latitude: paired ? latitude : null,
    longitude: paired ? longitude : null,
    providerRating: toNumberOrNull(input.provider?.rating) ?? toNumberOrNull(input.places?.rating),
    ratingsCount: toNumberOrNull(input.provider?.userRatingCount),
    providerTypes: types,
    priceRange: priceRange && typeof priceRange === "object" ? priceRange : text(priceRange),
  };
}

/**
 * The creator's own context for this recommendation. Contact disclosure stays private
 * unless an existing selection says otherwise, so an edit carries the creator's choice
 * forward rather than re-defaulting it.
 */
export function recommendationContext(values: KeyValuePair, options: {
  recommendationType: "place" | "person";
  source: RecommendationSource;
  existing?: PlaceRecommendationContext | null;
}): PlaceRecommendationContext {
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const person = options.recommendationType === "person";
  // "@handle" and "instagram.com/x" become the full URL the contract requires (PLC-05);
  // the form's own validation has already refused anything that cannot.
  const profile = (value: unknown) => { const raw = text(value); return raw === null ? null : normalizeSocialProfileUrl(raw) ?? raw; };
  // OWN-11. "Recommended by" takes a handle, a profile or any web link; the form refuses
  // what cannot become a URL, so the raw fallback is only reached by legacy values.
  const link = (value: unknown) => { const raw = text(value); return raw === null ? null : normalizeRecommendationLink(raw) ?? raw; };
  return {
    ...emptyPlaceContext(),
    recommendationType: options.recommendationType,
    sourceOfRecommendation: options.source,
    contactName: text(values.contactName),
    contactNumber: text(values.contactNumber),
    // The form's own choice wins; an edit that did not touch it keeps the stored one.
    contactVisibility:
      values.contactVisibility === "public" || values.contactVisibility === "private"
        ? values.contactVisibility
        : options.existing?.contactVisibility ?? "private",
    placeSocialUrl: person ? null : text(values.socialLink),
    placeWebsiteUrl: person ? text(values.socialLink) : null,
    creatorSocialUrl: link(values.recommendationLink) ?? (person ? profile(values.recommendation) : options.existing?.creatorSocialUrl ?? null),
    legacyPlaceNote: options.existing?.legacyPlaceNote ?? null,
    personProfileUrl: person ? profile(values.recommendation) ?? link(values.recommendationLink) : null,
    personAddress: person ? text(values.address) : null,
  };
}

export const useAddRecommendation = ({
  places,
  placeId,
  googlePlaceRefId,
  type,
  isCustom,
  listId,
  fetchedListId,
  fetchedGoogleMedia,
  instagramMedia = [],
  setPreviewUrl,
  setIsLoading,
  userInputRef,
  afterCreatePathRef,
  fetchedPlace: fetchedPlaceResult,
  editObservation,
}: AddRecommendation) => {
  const fetchedPlace=fetchedPlaceResult?.recommendedPlace ?? fetchedPlaceResult;
  const { selectedCity, setSelectedCity } = useCityStore();
  const navigate = useNavigate();
  const [editConflict,setEditConflict]=useState(false);
  const commands = usePlacesCommands();
  const generation = useAuthStore(state=>state.generation);
  const accountId = useAuthStore(state=>state.accountId);
  const editAttempt = useRef<{scope:string; observation:RecommendationObservation; signature:string; photoKey:string; files:File[]; uploadedIds:string[]; patch:Parameters<typeof commands.updatePlace>[1]|null}|null>(null);
  const scope = JSON.stringify([generation,accountId,placeId,listId,fetchedListId]);
  if(editAttempt.current && (editAttempt.current.scope!==scope || editAttempt.current.observation!==editObservation))editAttempt.current=null;
  const retireDraftIntent = ()=>{editAttempt.current=null;commands.retireDraftIntent();};
  const owner = usePlacesOwner(fetchedListId || listId, Boolean(fetchedListId || listId));

  const [uploadedUserMedia, setUploadedUserMedia] = useState<{ file: File; fileName: string }[]>([]);
  const [mediaStatus, setMediaStatus] = useState<RecommendationMediaStatus | null>(null);
  const [createdRecommendationDocumentId, setCreatedRecommendationDocumentId] = useState<string | null>(null);
  // Set once the recommendation exists, so no later click can create a second one.
  const createdRecommendationRef = useRef<string | null>(null);
  const pendingCreateRef = useRef<PendingCreateAttempt | null>(null);
  // Bytes already uploaded in this form, so a retry uploads only what is still missing.
  const uploadedMediaIds = useRef(new Map<Blob, string>());
  const submissionInFlightRef = useRef(false);
  const completionInFlightRef = useRef(false);

  const { t } = useTranslation();
  const { user } = useAuthStore();

  // A place holds ten photos (0047 bounds slot_index at 0..9). Every source counts against
  // the same ten: provider photos and Instagram imports on create, the saved photos on edit.
  const observedPlacePhotoIds = (): string[] => {
    const observed = editObservation?.detail.category === 'places' ? editObservation.detail.placePhotos?.photoMediaIds : undefined;
    return Array.isArray(observed) ? observed.filter(Boolean) : [];
  };
  // The owner's arrangement of the photos already saved, held against the observation it was
  // made on so a reload (a new observation) starts again from what the server holds.
  const [savedPhotoArrangement, setSavedPhotoArrangement] = useState<{ observation: unknown; ids: string[] } | null>(null);
  const existingPlacePhotoIds = (): string[] =>
    savedPhotoArrangement && savedPhotoArrangement.observation === editObservation ? savedPhotoArrangement.ids : observedPlacePhotoIds();
  const otherPhotoCount = (): number => type === "edit" ? existingPlacePhotoIds().length
    : (Array.isArray(fetchedGoogleMedia) ? fetchedGoogleMedia : []).filter(media => media.photoBlob instanceof Blob || media.mediaId).length
      + (Array.isArray(instagramMedia) ? instagramMedia : []).filter(media => media.photoBlob instanceof Blob).length;
  const refusePhotoOverflow = (total: number): boolean => {
    if (total <= PLACE_PHOTO_LIMIT) return false;
    toast.error(t("toast.error.placePhotoLimit", { limit: PLACE_PHOTO_LIMIT, count: total - PLACE_PHOTO_LIMIT }));
    return true;
  };

  /** Arranges (or removes from) the photos already saved on this place. Order is slot order. */
  const setSavedPhotoIds = (ids: string[]) => {
    retireDraftIntent();
    setSavedPhotoArrangement({ observation: editObservation, ids });
  };
  /** Arranges the photos chosen in this form; they upload and save in this order. */
  const reorderUserMedia = (files: File[]) => {
    const position = new Map(files.map((file, index) => [file, index]));
    if (position.size !== uploadedUserMedia.length || uploadedUserMedia.some(item => !position.has(item.file))) return;
    retireDraftIntent();
    setUploadedUserMedia(prev => [...prev].sort((a, b) => position.get(a.file)! - position.get(b.file)!));
    setPreviewUrl(prev => [...prev].sort((a, b) => (position.get(a.file) ?? 0) - (position.get(b.file) ?? 0)));
  };

  const handleDeleteUserImage = (_fileName: string, index: number) => {
    retireDraftIntent();
    setUploadedUserMedia((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrl((prev) => prev.filter((_, i) => i !== index));
    toast.success(t("toast.success.mediaRemovedSuccessfully"));
  };

  const snapshotSelectedMedia = (): PendingRecommendationMedia[] => {
    const google = (Array.isArray(fetchedGoogleMedia) ? fetchedGoogleMedia : [])
      .flatMap((media, index): PendingRecommendationMedia[] => media.mediaId ? [{
        key: `google-${index}-${media.mediaId}`,
        mediaId: media.mediaId,
        isThumbnail: media.isThumbnail === true,
        origin: "provider",
      }] : media.photoBlob instanceof Blob ? [{
        key: `google-${index}-${media.fileName || "media"}`,
        blob: media.photoBlob,
        fileName: media.fileName,
        isThumbnail: media.isThumbnail === true,
        origin: "provider",
      }] : []);
    const userMedia = uploadedUserMedia.map(({ file, fileName }, index) => ({
      key: `user-${index}-${file.name}`,
      blob: file,
      fileName,
      isThumbnail: false,
      origin: "creator" as const,
    }));
    const instagram = (Array.isArray(instagramMedia) ? instagramMedia : [])
      .flatMap((media, index) => media.photoBlob instanceof Blob ? [{
        key: `instagram-${index}-${media.fileName || "media"}`,
        blob: media.photoBlob,
        fileName: media.fileName,
        isThumbnail: false,
        origin: "creator" as const,
      }] : []);
    // The thumbnail leads the place gallery, as it did in the legacy media_details.
    return [...google.filter(item => item.isThumbnail), ...google.filter(item => !item.isThumbnail), ...userMedia, ...instagram];
  };

  const finishCreatedRecommendation = async (status: "saved" | "not-selected" | "continued") => {
    if (completionInFlightRef.current) return;
    completionInFlightRef.current = true;
    setIsLoading(true);

    try {
      const refreshed = owner.data?.recommendationLists?.find(
        (list) => list.documentId === (listId || fetchedListId)
      );
      if (refreshed) {
        setSelectedCity({
          documentId: selectedCity?.documentId || refreshed.documentId,
          List_Name: selectedCity?.List_Name || refreshed.List_Name,
          slug: selectedCity?.slug || refreshed.slug,
          account: selectedCity?.account || refreshed.account,
          Visibility: refreshed.Visibility,
          recommended_places: refreshed.recommended_places || [],
        } as never);
      }
    } catch (error) {
      console.warn("Recommendation was saved, but refreshing its list failed:", error);
    }

    navigate(afterCreatePathRef?.current ?? placeListPath(listId), {
      state: { justAddedRecommendationToListId: listId },
    });
    if (status === "saved") {
      toast.success("Recommendation and selected media saved successfully.");
    } else if (status === "not-selected") {
      toast.success("Recommendation saved without an image selected.");
    } else {
      toast.success("Recommendation saved. Continuing without a confirmed image.");
    }
    setIsLoading(false);
    setTimeout(() => {
      window.__walkthrough?.advanceToNextStepRef?.current?.();
    }, 500);
  };

  /**
   * Uploads the selected photos, three at a time, before the recommendation is created, so
   * their ids travel on the create and no attach request follows it (OWN-17). Every upload
   * that succeeds is remembered, even when another fails, so a retry uploads only what is
   * still missing and never creates a second recommendation. Null means an upload failed.
   */
  const uploadSelectedMedia = async (selected: PendingRecommendationMedia[]): Promise<string[] | null> => {
    let failed = false;
    const ids = await mapLimited(selected, PHOTO_UPLOAD_CONCURRENCY, async (media) => {
      // Imported provider photos are owned media already; only bytes are uploaded.
      if (media.mediaId) return media.mediaId;
      const blob = media.blob as Blob;
      const known = uploadedMediaIds.current.get(blob);
      if (known) return known;
      try {
        const file = new File([blob], media.fileName || "recommendation", { type: blob.type || "image/jpeg" });
        // Creator and provider uploads share the one typed, publicly projected photo
        // path. The generic recommendation_media leg had no public Places reader.
        const uploaded = await commands.upload(file, "recommendation");
        uploadedMediaIds.current.set(blob, uploaded.id);
        return uploaded.id;
      } catch (error) {
        console.warn("Selected recommendation media upload failed:", error);
        failed = true;
        return "";
      }
    });
    return failed ? null : ids;
  };

  const retryMediaUpload = async () => {
    const pending = pendingCreateRef.current;
    if (!pending || mediaStatus !== "upload-failed" || submissionInFlightRef.current) return;
    await createRecommendation(pending.values, pending.selected);
  };

  // Nothing was created when an upload failed, so continuing creates the place without
  // photos, once.
  const continueWithoutImage = async () => {
    const pending = pendingCreateRef.current;
    if (!pending || mediaStatus !== "upload-failed" || submissionInFlightRef.current) return;
    await createRecommendation(pending.values, [], "continued");
  };

  /** The one provider request the add flow makes, and only for a custom place. */
  const fetchProviderFacts = async (id?: string) => {
    if (!id) return null;
    try {
      const response = await axios.get(
        `${GOOGLE_PLACES_API_BASE_URL}/${id}?fields=id,displayName,formattedAddress,primaryType,primaryTypeDisplayName,priceRange,rating,userRatingCount,location&key=${
          mapsBrowserKey()
        }`
      );
      return response?.data ?? null;
    } catch (error) {
      console.warn("Error fetching place details from Google:", error);
      return null;
    }
  };

  const handleSubmit = (values: KeyValuePair) => createRecommendation(values, null);

  /**
   * Files the recommendation with its photos. `retained` is the media a failed attempt
   * kept (a retry or a continue), so the staged media leaving props does not lose it.
   */
  const createRecommendation = async (
    values: KeyValuePair,
    retained: PendingRecommendationMedia[] | null,
    completion: "saved" | "continued" = "saved",
  ) => {
    if (type === "edit") return;
    if (!listId) {
      toast.error("Recommendation could not be saved. Please try again.");
      return;
    }
    if (submissionInFlightRef.current || createdRecommendationRef.current) return;
    submissionInFlightRef.current = true;
    if (completion === "saved") setMediaStatus(null);

    // Show the loader before any async network work.
    setIsLoading(true);

    try {
      // Refuse a duplicate title inside this list, as before.
      const normalizedNewTitle = values.title?.trim().toLowerCase().replace(/\s+/g, " ") || "";
      const list = owner.data?.recommendationLists?.find((entry) => entry.documentId === listId);
      const isDuplicate = (list?.recommended_places ?? []).some((place) => {
        const existingTitle = place?.Place_Details?.Title?.trim().toLowerCase().replace(/\s+/g, " ");
        return existingTitle === normalizedNewTitle && normalizedNewTitle !== "";
      });
      if (isDuplicate) {
        toast.error(t("toast.error.placeAlreadyExists", { itemType: "place" }));
        setIsLoading(false);
        return;
      }

      const selectedMedia = retained ?? snapshotSelectedMedia();
      // Refuse before anything is created or uploaded, so the creator can remove photos
      // and save again rather than learn afterwards that some were silently dropped.
      if (refusePhotoOverflow(selectedMedia.length)) {
        setIsLoading(false);
        return;
      }

      // Photos upload before the create and travel on it (OWN-17). A failed upload stops
      // here, before anything exists, so the retry cannot create a second recommendation.
      pendingCreateRef.current = { values, selected: selectedMedia };
      const photoMediaIds = await uploadSelectedMedia(selectedMedia);
      if (!photoMediaIds) {
        setMediaStatus("upload-failed");
        setIsLoading(false);
        return;
      }

      const provider = isCustom ? await fetchProviderFacts(places?.place_id) : null;
      const source = determineRecommendationSource(new URLSearchParams(window.location.search));
      const title = provider?.displayName?.text || values.title || "Untitled";
      const draft = {
        ...(values.placesTaxonomy===undefined?{}:{placesTaxonomy:placesTaxonomyAssignmentSchema.parse(values.placesTaxonomy)}),
        title,
        details: placeFacts({ address: values.address, geoCoords: values.geoCoords, places, provider }),
        context: recommendationContext(values, { recommendationType: "place", source }),
        note: richNoteFromEditor(typeof values.reason === "string" ? values.reason : ""),
        userRating: toNumberOrNull(values.userRating),
        photoMediaIds,
      };

      // The create command refreshes the owner view once; the uploads before it did not.
      const created = await commands.createPlace(listId, draft);
      if (!created?.id) {
        throw new Error("Recommendation creation returned no persisted record");
      }

      createdRecommendationRef.current = created.id;
      pendingCreateRef.current = null;
      setCreatedRecommendationDocumentId(created.id);

      if (completion === "continued") {
        await finishCreatedRecommendation("continued");
      } else if (selectedMedia.length === 0) {
        setMediaStatus("not-selected");
        await finishCreatedRecommendation("not-selected");
      } else {
        setMediaStatus("saved");
        await finishCreatedRecommendation("saved");
      }
    } catch (error) {
      console.error("Recommendation creation failed:", error);
      toast.error("Recommendation could not be saved. Please try again.");
      setIsLoading(false);
    } finally {
      submissionInFlightRef.current = false;
    }
  };

  const handleUpdatePlaceDetails = async (values: KeyValuePair) => {
    try {
      setIsLoading(true);

      if (!placeId) {
        toast.error("Place ID is missing. Cannot update.");
        setIsLoading(false);
        return;
      }

      const provider = isCustom && googlePlaceRefId ? await fetchProviderFacts(googlePlaceRefId) : null;

      if(!editObservation)throw new ExplorersApiError(409,"CONFLICT","Refresh the original owner detail before saving");
      const signature=JSON.stringify(values);
      let attempt=editAttempt.current;
      const files=uploadedUserMedia.map(item=>item.file);
      const photoKey=existingPlacePhotoIds().join('|');
      if(!attempt || attempt.signature!==signature || attempt.photoKey!==photoKey || attempt.files.length!==files.length || files.some((file,index)=>file!==attempt!.files[index])){
        attempt={scope,observation:editObservation,signature,photoKey,files,uploadedIds:[],patch:null};
        editAttempt.current=attempt;
      }
      if (refusePhotoOverflow(existingPlacePhotoIds().length + uploadedUserMedia.length)) {
        setIsLoading(false);
        return;
      }
      // Keep successful uploads and the exact patch across response loss or failure. Ids
      // are kept by slot, so photos upload three at a time and still save in form order.
      const current=attempt;
      const missing=uploadedUserMedia.map((_,index)=>index).filter(index=>!current.uploadedIds[index]);
      await mapLimited(missing,PHOTO_UPLOAD_CONCURRENCY,async index=>{
        const {file,fileName}=uploadedUserMedia[index];
        const uploaded=await commands.upload(new File([file],fileName||file.name,{type:file.type}),"recommendation");
        if(editAttempt.current!==current)throw new Error("Edit media attempt retired");
        current.uploadedIds[index]=uploaded.id;
      });
      const uploadedIds=attempt.uploadedIds;
      // Read the existing photos from the authoritative owner detail, not from the
      // presentation view model: the patch preserves what the server says this
      // recommendation holds, and a view model is free to reshape or drop keys.
      const existingPhotoMediaIds = existingPlacePhotoIds();

      const existingContext: PlaceRecommendationContext | null = fetchedPlace?.Contact_Visibility
        ? {
          ...emptyPlaceContext(),
          contactVisibility: fetchedPlace.Contact_Visibility,
          legacyPlaceNote: fetchedPlace.Users_Place_Note ?? null,
        }
        : null;

      if(!editObservation)throw new ExplorersApiError(409,"CONFLICT","Refresh the original owner detail before saving");
      if(!attempt.patch)attempt.patch={
        ...(values.placesTaxonomy===undefined?{}:{placesTaxonomy:placesTaxonomyAssignmentSchema.parse(values.placesTaxonomy)}),
        note: richNoteFromEditor(typeof values.reason === "string" ? values.reason : ""),
        userRating: toNumberOrNull(values.userRating),
        placePhotos: { photoMediaIds: [...existingPhotoMediaIds, ...uploadedIds] },
        placeContext: recommendationContext(values, {
          // A legacy person row keeps its stored type; new writes are always places (ADD-09).
          recommendationType: fetchedPlace?.Recommendation_Type === "person" ? "person" : "place",
          source: determineRecommendationSource(new URLSearchParams(window.location.search)),
          existing: existingContext,
        }),
        // The title is this owner's presentation of a shared place, so it is an override.
        displayOverrides: { title: typeof values.title === "string" && values.title ? values.title : null },
      };
      await commands.updatePlace(placeId, attempt.patch, editObservation);

      // Correcting the place's own facts repoints this recommendation at a corrected
      // place; it never rewrites the place everyone else recommends.
      if (fetchedPlace?.Recommendation_Type !== "person") {
        const facts = placeFacts({ address: values.address, geoCoords: values.geoCoords, places, provider });
        const changed = facts.formattedAddress !== (fetchedPlace?.Place_Details?.Place_Address ?? null)
          || facts.latitude !== (fetchedPlace?.Place_Details?.Geometry?.lat ?? null)
          || facts.longitude !== (fetchedPlace?.Place_Details?.Geometry?.lng ?? null);
        if (changed) {
          await commands.correctFacts(placeId, values.title || fetchedPlace?.Place_Details?.Title || "Untitled", facts);
        }
      }

      editAttempt.current=null;
      toast.success("Recommendation Updated Successfully!!!");
      setIsLoading(false);
      navigate(placeListPath(fetchedListId || listId || selectedCity?.documentId));
    } catch (error: any) {
      if(error instanceof ExplorersApiError && error.status===409)setEditConflict(true);
      console.error("Error updating place details:", error);
      const errorMessage = error?.message || "Failed to update recommendation. Please try again.";
      toast.error(errorMessage);
      setIsLoading(false);
      // Do not navigate on error — let the creator fix and retry.
      throw error;
    }
  };

  const handleUploadMedia = () => {
    userInputRef.current?.click();
  };

  const stageFiles = async (files: File[]): Promise<File[]> => {
    // Max ten photos across every source, duplicates by name and size skipped.
    const remainingSlots = PLACE_PHOTO_LIMIT - otherPhotoCount() - uploadedUserMedia.length;
    if (remainingSlots <= 0 || files.length > remainingSlots) {
      // Extra files are never dropped silently: the refusal says how many do not fit.
      refusePhotoOverflow(PLACE_PHOTO_LIMIT - remainingSlots + files.length);
      if (remainingSlots <= 0) return [];
    }
    const fileArray = files.slice(0, remainingSlots);
    const existingFileSignatures = uploadedUserMedia.map(item => `${item.file.name}-${item.file.size}`);
    const newFiles = fileArray.filter(file => !existingFileSignatures.includes(`${file.name}-${file.size}`));
    if (newFiles.length === 0) return [];

    const newPreviewUrls = newFiles.map((file) => ({
      url: URL.createObjectURL(file),
      type: file.type.startsWith("video/") ? ("video" as const) : ("image" as const),
      file,
    }));
    setPreviewUrl(prev => [...prev, ...newPreviewUrls]);

    const newFileItems = newFiles.map((file) => {
      const fileExtension = file.name.substring(file.name.lastIndexOf("."));
      return { file, fileName: `user---${user?.username || "user"}${fileExtension}` };
    });
    retireDraftIntent();
    setUploadedUserMedia(prev => [...prev, ...newFileItems]);
    return newFiles;
  };

  const reportRejectedImages = (rejected: RejectedImage[]) => {
    for (const { file, reason } of rejected) {
      toast.error(t(
        reason === "type" ? "toast.error.imageTypeUnsupported" : reason === "size" ? "toast.error.imageTooLarge" : "toast.error.imageEmpty",
        { name: file.name, max: maxImageMegabytes() },
      ));
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles) return;
    const reset = () => { if (event.target) event.target.value = ""; };

    // Wrong types and oversized files are refused here, before anything is saved, each
    // with its own message.
    const { valid, rejected } = validateImageFiles(Array.from(uploadedFiles));
    reportRejectedImages(rejected);
    if (valid.length === 0) {
      reset();
      return;
    }

    const remainingSlots = PLACE_PHOTO_LIMIT - otherPhotoCount() - uploadedUserMedia.length;
    if (remainingSlots <= 0) {
      refusePhotoOverflow(PLACE_PHOTO_LIMIT - remainingSlots + valid.length);
      reset();
      return;
    }

    // stageFiles keeps what fits and says how many files were left out.
    const accepted = await stageFiles(valid);
    reset();
    if (accepted.length === 0) {
      toast.error(t("toast.error.allFilesAlreadyUploaded"));
      return;
    }
    if (accepted.length < Math.min(valid.length, remainingSlots)) {
      toast.warning(t("toast.error.duplicateFilesSkipped", { count: Math.min(valid.length, remainingSlots) - accepted.length }));
    }
    toast.success(t("toast.success.filesAddedSuccessfully", { count: accepted.length }));
  };

  const addExternalMedia = async (files: File[]) => {
    if (files.length === 0) return;
    const { valid, rejected } = validateImageFiles(files);
    reportRejectedImages(rejected);
    if (valid.length === 0) return;
    await stageFiles(valid);
  };

  return {
    editConflict, clearEditConflict:()=>{retireDraftIntent();setEditConflict(false);},
    retireDraftIntent,
    handleFileChange,
    handleUploadMedia,
    handleSubmit,
    handleDeleteUserImage,
    reorderUserMedia,
    savedPhotoIds: existingPlacePhotoIds(),
    setSavedPhotoIds,
    handleUpdatePlaceDetails,
    addExternalMedia,
    mediaStatus,
    mediaFeedback: mediaStatus === "upload-failed"
      ? "The selected image could not be uploaded, so the recommendation is not saved yet."
      : mediaStatus === "metadata-failed"
        ? "Recommendation saved and media uploaded, but its image metadata could not be saved."
        : mediaStatus === "saved"
          ? "Recommendation and selected media were saved."
          : mediaStatus === "not-selected"
            ? "Recommendation saved without an image selected."
            : null,
    createdRecommendationDocumentId,
    retryMediaUpload,
    continueWithoutImage,
  };
};
