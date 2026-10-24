import { explorersApiClient } from "../../../lib/explorersApiClient";
import { reorderCategoryLists } from "../../../lib/reorderCategoryLists";
import { setListPin } from "../category/listWrites";
import type { ItemTopPickCategory } from "../category/categoryConfig";

export async function saveItemPins(category: ItemTopPickCategory, orderedRecommendationIds: string[]) {
  const observed = await explorersApiClient.getCompleteMyCategoryContent({ category, status: "active" }, undefined, true);
  const pins = orderedRecommendationIds.map((recommendationId) => {
    const saved = observed.topPicks?.find((pin) => pin.recommendationId === recommendationId);
    const live = observed.memberships.filter((member) => member.recommendationId === recommendationId && !member.collectionArchived && !member.recommendationArchived);
    const member = live.find((value) => value.collectionId === saved?.collectionId) ?? live[0];
    if (!member) throw new Error("This item changed. Refresh and try again.");
    return { recommendationId, collectionId: member.collectionId };
  });
  return explorersApiClient.setMyCategoryTopPicks(observed, pins, crypto.randomUUID());
}

/** Places and Guides: a pinned list carries pinOrder; the pinned scope then fixes the order densely. */
export async function saveListPins(category: "places" | "guides", previous: string[], next: string[]) {
  for (const id of previous) if (!next.includes(id)) await setListPin(id, null);
  const kept = next.filter((id) => previous.includes(id)).length;
  let position = kept;
  for (const id of next) if (!previous.includes(id)) await setListPin(id, position++);
  if (next.length > 0) await reorderCategoryLists(category, "pinned", next);
}
