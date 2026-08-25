export type SavedRecommendation = {
  id: string | number;
  documentId: string;
};

export type SavedRecommendationMedia = {
  thumbnail: unknown;
  imageDetails: unknown[];
  scalarId?: string | number;
};

export type RecommendationMediaSaveStage = "lookup" | "upload" | "metadata";

export class RecommendationMediaSaveError extends Error {
  readonly stage: RecommendationMediaSaveStage;
  readonly originalError: unknown;

  constructor(stage: RecommendationMediaSaveStage, cause: unknown) {
    super(`Unable to save recommendation media during ${stage}`);
    this.name = "RecommendationMediaSaveError";
    this.stage = stage;
    this.originalError = cause;
  }
}

type RecommendationMediaSaveOperations = {
  lookup: () => Promise<SavedRecommendation>;
  upload: (recommendation: SavedRecommendation) => Promise<SavedRecommendationMedia>;
  saveMetadata: (
    documentId: string,
    media: SavedRecommendationMedia,
  ) => Promise<void>;
};

/**
 * Run the irreversible media-save stages in order. Callers receive the exact
 * failed stage and can keep the form and selected files available for retry.
 */
export const saveRecommendationMedia = async ({
  lookup,
  upload,
  saveMetadata,
}: RecommendationMediaSaveOperations): Promise<SavedRecommendation> => {
  let recommendation: SavedRecommendation;
  try {
    recommendation = await lookup();
  } catch (error) {
    throw new RecommendationMediaSaveError("lookup", error);
  }

  let media: SavedRecommendationMedia;
  try {
    media = await upload(recommendation);
  } catch (error) {
    throw new RecommendationMediaSaveError("upload", error);
  }

  try {
    await saveMetadata(recommendation.documentId, media);
  } catch (error) {
    throw new RecommendationMediaSaveError("metadata", error);
  }

  return recommendation;
};
