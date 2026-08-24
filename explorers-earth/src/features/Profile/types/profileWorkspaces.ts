export type ProfileWorkspaceId = "profile" | "gallery" | "appearance";

export type ProfileWorkspaceWidth = "readable" | "wide";

export interface ProfileWorkspace<TSection> {
  id: ProfileWorkspaceId;
  headingId: string;
  sections: TSection[];
  width: ProfileWorkspaceWidth;
}

export interface FeedAsyncState {
  pending: boolean;
  operation: FeedAsyncOperation;
  requestId: string;
}

export type FeedAsyncOperation =
  | "manual-upload"
  | "google-fetch"
  | "google-import"
  | "instagram-fetch"
  | "instagram-import";
