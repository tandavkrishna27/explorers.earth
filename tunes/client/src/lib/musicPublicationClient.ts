import { apiRequest } from "./queryClient";
import { parseMusicPublicationResponse } from "../../../shared/musicPublicationContract";
import {
  completePendingMusicPublicationCommand,
  getOrCreatePendingMusicPublicationCommand,
} from "./musicPublicationCommandRegistry";
export { clearPendingMusicPublicationCommands } from "./musicPublicationCommandRegistry";

export async function requestUnlistedShareCapability(ownerId: number): Promise<string> {
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) throw new Error("Music sharing requires an immutable owner.");
  const operation = getOrCreatePendingMusicPublicationCommand(ownerId, "unlisted");
  try {
    const response = await apiRequest(
      "POST",
      "/api/music/publication",
      { mode: "unlisted" },
      0,
      3,
      { "Idempotency-Key": operation.key },
    );
    const result = parseMusicPublicationResponse(await response.json(), "unlisted");
    completePendingMusicPublicationCommand(ownerId, "unlisted", operation.key);
    return result.capability;
  } catch (error) {
    throw error;
  }
}
