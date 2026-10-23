import { explorersApiClient } from "../../../lib/explorersApiClient";
import { reorderCategoryLists } from "../../../lib/reorderCategoryLists";
import type { PlaceCollectionDetails } from "../../../../../tunes/shared/explorersPlaceContract";
import type { CategoryKey } from "./categoryConfig";
import type { ListStatus } from "./models";

const key = () => crypto.randomUUID();

export interface CreateListInput {
  category: CategoryKey;
  title: string;
  slug: string;
  description: string | null;
  placeLocation?: PlaceCollectionDetails;
  coverMediaId?: string;
}

export function createList({ placeLocation, coverMediaId, ...input }: CreateListInput) {
  return explorersApiClient.createMyCollection({
    ...input, visibility: "private", publicationState: "draft",
    ...(placeLocation === undefined ? {} : { placeLocation }),
    ...(coverMediaId === undefined ? {} : { coverMediaId }),
  }, key());
}

export async function setListStatus(id: string, next: ListStatus) {
  const observed = await explorersApiClient.getMyEditableCollection(id);
  return explorersApiClient.updateMyCollection(observed,
    next === "public" ? { visibility: "public", publicationState: "published" } : { visibility: "private", publicationState: "draft" }, key());
}

export async function setListPin(id: string, pinOrder: number | null) {
  const observed = await explorersApiClient.getMyEditableCollection(id);
  return explorersApiClient.updateMyCollection(observed, { pinOrder }, key());
}

export function orderLists(category: CategoryKey, orderedIds: string[]) {
  return reorderCategoryLists(category, "display", orderedIds);
}
