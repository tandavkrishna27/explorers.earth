import { RECOMMENDATION_CATEGORY_IDS } from "../../src/features/Profile/types/themeTypes";

// Test-only reader/oracle: Music is a landing destination, not an orderable category.
export const PROFILE_BATCH_CATEGORY_IDS = RECOMMENDATION_CATEGORY_IDS;

type CategoryId = (typeof PROFILE_BATCH_CATEGORY_IDS)[number];
export type ProfileBatchOrderShape = "canonical" | "reverse" | "rotate" | "preferred-first";

export function parseProfileBatchRecommendationOrder(value: unknown): CategoryId[] {
  if (!Array.isArray(value) || value.length !== PROFILE_BATCH_CATEGORY_IDS.length) {
    throw new Error("Dashboard recommendation order is invalid");
  }
  const seen = new Set<CategoryId>();
  for (const id of value) {
    if (typeof id !== "string" || !PROFILE_BATCH_CATEGORY_IDS.includes(id as CategoryId)
        || seen.has(id as CategoryId)) {
      throw new Error("Dashboard recommendation order is invalid");
    }
    seen.add(id as CategoryId);
  }
  return [...seen];
}

export function profileBatchSavedOrder(shape: ProfileBatchOrderShape, firstView: string): CategoryId[] {
  const canonical = [...PROFILE_BATCH_CATEGORY_IDS];
  if (shape === "reverse") return canonical.reverse();
  if (shape === "rotate") return [...canonical.slice(2), ...canonical.slice(0, 2)];
  if (shape === "preferred-first" && PROFILE_BATCH_CATEGORY_IDS.includes(firstView as CategoryId)) {
    return [firstView as CategoryId, ...canonical.filter((id) => id !== firstView)];
  }
  return canonical;
}

export function profileBatchPublicOrder(shape: ProfileBatchOrderShape, firstView: string): CategoryId[] {
  const savedOrder = profileBatchSavedOrder(shape, firstView);
  if (PROFILE_BATCH_CATEGORY_IDS.includes(firstView as CategoryId)) {
    return [firstView as CategoryId, ...savedOrder.filter((id) => id !== firstView)];
  }
  return savedOrder;
}
