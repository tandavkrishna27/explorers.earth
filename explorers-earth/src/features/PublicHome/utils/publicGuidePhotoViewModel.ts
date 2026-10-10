import { guideDayPlaceSchema } from '../../../../../tunes/shared/explorersGuideContract';
import { toDayPlace } from '../../Guides/api/guidesViewModel';
import type { ActivityPhoto, DayPlace, TimelineData, StayData, ActivityData } from '../../Guides/types/guideSectionTypes';

type PublicGuidePhotoSection = Record<string, unknown> & {
  Timeline: TimelineData & Record<string, unknown>;
  Stay: StayData & Record<string, unknown>;
  Recommendation_Activity: ActivityData & Record<string, unknown>;
};
type PublicGuidePhotoConversion = { ok: true; section: PublicGuidePhotoSection } | { ok: false };
type GuideSelectablePhoto = Pick<ActivityPhoto, 'url'> & Partial<Omit<ActivityPhoto, 'url'>>;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const filled = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const has = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);

function selectablePhoto(value: unknown): value is GuideSelectablePhoto {
  if (!record(value) || !filled(value.url)) return false;
  for (const key of ['id', 'documentId', 'fileName', 'aspectRatio']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') return false;
  }
  for (const key of ['width', 'height']) {
    if (value[key] !== undefined && (!finite(value[key]) || value[key] < 0)) return false;
  }
  return true;
}
function legacyPhoto(value: unknown): value is ActivityPhoto {
  return selectablePhoto(value) && filled(value.id) && filled(value.documentId)
    && typeof value.fileName === 'string' && typeof value.aspectRatio === 'string'
    && finite(value.width) && finite(value.height);
}
function legacyPlace(value: Record<string, unknown>): DayPlace | undefined {
  if (!filled(value.id) || !filled(value.name) || !filled(value.place_id) || typeof value.formatted_address !== 'string') return undefined;
  if (value.geometry !== undefined && (!record(value.geometry) || !record(value.geometry.location)
    || !finite(value.geometry.location.lat) || !finite(value.geometry.location.lng))) return undefined;
  if (value.types !== undefined && (!Array.isArray(value.types) || !value.types.every(v => typeof v === 'string'))) return undefined;
  for (const key of ['tips', 'priceRange', 'customBudget', 'budgetCurrency']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') return undefined;
  }
  for (const key of ['priceLevel', 'budgetAmount']) {
    if (value[key] !== undefined && !finite(value[key])) return undefined;
  }
  for (const key of ['photosLoading', 'isVerified']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') return undefined;
  }
  if (value.source !== undefined && (typeof value.source !== 'string' || !['google', 'ai-unverified', 'manual'].includes(value.source))) return undefined;
  if (value.photos !== undefined && (!Array.isArray(value.photos) || !value.photos.every(legacyPhoto))) return undefined;
  const geometry = record(value.geometry) && record(value.geometry.location)
    ? { ...value.geometry, location: { ...value.geometry.location } } : undefined;
  // The shape has been checked deliberately above; copy nested values to keep cached input isolated.
  return { ...value, geometry,
    types: value.types === undefined ? undefined : [...value.types],
    photos: value.photos === undefined ? [] : value.photos.map(photo => ({ ...photo })) } as DayPlace;
}
function convertPlace(value: unknown): DayPlace | undefined {
  if (!record(value)) return undefined;
  const canonical = ['localId', 'placeId', 'formattedAddress', 'verified'].some(key => has(value, key))
    || (Array.isArray(value.photos) && value.photos.some(photo => record(photo) && has(photo, 'mediaId')));
  if (canonical) {
    const parsed = guideDayPlaceSchema.safeParse(value);
    return parsed.success ? toDayPlace(parsed.data) : undefined;
  }
  return legacyPlace(value);
}
function block(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) value = {};
  else if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return undefined; }
  }
  if (!record(value)) return undefined;
  const result = { ...value };
  for (const key of keys) {
    const incoming = value[key] === undefined ? [] : value[key];
    if (!Array.isArray(incoming)) return undefined;
    const places: DayPlace[] = [];
    for (const entry of incoming) {
      const place = convertPlace(entry);
      if (!place) return undefined;
      places.push(place);
    }
    result[key] = places;
  }
  return result;
}
export function convertPublicGuideSection(section: unknown): PublicGuidePhotoConversion {
  if (!record(section)) return { ok: false };
  const Timeline = block(section.Timeline, ['morning', 'afternoon', 'evening']);
  const Stay = block(section.Stay, ['accommodations']);
  const Recommendation_Activity = block(section.Recommendation_Activity, ['activities']);
  if (!Timeline || !Stay || !Recommendation_Activity) return { ok: false };
  return { ok: true, section: { ...section, Timeline, Stay, Recommendation_Activity } as PublicGuidePhotoSection };
}
function photos(place: unknown): GuideSelectablePhoto[] {
  return record(place) && Array.isArray(place.photos) ? place.photos.filter(selectablePhoto) : [];
}
function matchingActivities(place: unknown, sections: readonly unknown[]): Record<string, unknown>[] {
  if (!record(place) || !filled(place.place_id)) return [];
  const matches: Record<string, unknown>[] = [];
  for (const section of sections) {
    if (!record(section) || !record(section.Recommendation_Activity) || !Array.isArray(section.Recommendation_Activity.activities)) continue;
    for (const activity of section.Recommendation_Activity.activities) {
      if (record(activity) && activity.place_id === place.place_id) matches.push(activity);
    }
  }
  return matches;
}
export function selectGuidePlaceThumbnail(place: unknown, sections: readonly unknown[]): GuideSelectablePhoto | undefined {
  const own = photos(place)[0];
  if (own) return own;
  let selected: GuideSelectablePhoto | undefined;
  for (const activity of matchingActivities(place, sections)) {
    // Historic thumbnails consider the first supplied photo, never a later replacement.
    const first = Array.isArray(activity.photos) ? activity.photos[0] : undefined;
    if (selectablePhoto(first)) selected = first;
  }
  return selected;
}
export function selectGuidePlaceGallery(place: unknown, sections: readonly unknown[]): GuideSelectablePhoto[] {
  const candidates = [...photos(place), ...matchingActivities(place, sections).flatMap(photos)];
  const seen = new Set<string>();
  return candidates.filter(photo => {
    if (!filled(photo.documentId)) return true;
    if (seen.has(photo.documentId)) return false;
    seen.add(photo.documentId);
    return true;
  });
}
