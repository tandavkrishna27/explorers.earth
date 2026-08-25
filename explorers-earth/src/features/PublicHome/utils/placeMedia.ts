type MediaAsset = { url?: string | null } | null | undefined;

export type PlaceCardMedia = {
  media_details?: {
    thumbnail?: MediaAsset;
    imageDetails?: MediaAsset[] | null;
  } | null;
  Media?: MediaAsset[] | null;
  Place_Details?: {
    Photos?: Array<string | null | undefined> | null;
  } | null;
};

const firstUrl = (assets?: MediaAsset[] | null) =>
  assets?.find((asset): asset is { url: string } => Boolean(asset?.url))?.url;

/**
 * Keeps every public Places card on the same storage-first image contract.
 * Item media is preferred, then the list's stored thumbnail, then the shared
 * generic image. Legacy Place_Details photos remain an item-level fallback.
 */
export const selectPlaceCardImage = (
  place: PlaceCardMedia | null | undefined,
  listThumbnail: string | null | undefined,
  fallbackImage: string,
) =>
  place?.media_details?.thumbnail?.url ||
  firstUrl(place?.media_details?.imageDetails) ||
  firstUrl(place?.Media) ||
  place?.Place_Details?.Photos?.find(Boolean) ||
  listThumbnail ||
  fallbackImage;
