import type { IStorage } from "../storage";

export interface YouTubePlaylistItem {
  youtubeId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
}

export interface YouTubePlaylistResponse {
  sourcePlaylistId: string;
  videosFetched: number;
  videosAdded: number;
  targetPlaylistId?: number;
  status: string;
}

interface YouTubeAPIResponse {
  items?: Array<{
    snippet: {
      title: string;
      videoOwnerChannelTitle?: string;
      channelTitle?: string;
      thumbnails?: {
        default?: { url: string };
        medium?: { url: string };
      };
    };
    contentDetails: {
      videoId: string;
    };
  }>;
  nextPageToken?: string;
  pageInfo?: {
    totalResults?: number;
  };
  error?: {
    message: string;
    code: number;
  };
}

/**
 * Fetches all items from a YouTube Music playlist using the YouTube Data API v3
 * @param playlistId - The YouTube playlist ID (extracted from URL)
 * @param apiKey - The YouTube API key
 * @returns Array of normalized playlist items
 */
export async function fetchYouTubeMusicPlaylist(
  playlistId: string,
  apiKey: string
): Promise<YouTubePlaylistItem[]> {
  if (!playlistId) {
    throw new Error("Playlist ID is required");
  }

  if (!apiKey) {
    throw new Error("YouTube API key is required");
  }

  const allItems: YouTubePlaylistItem[] = [];
  let nextPageToken: string | undefined = undefined;
  let pageCount = 0;
  const maxPages = 100; // Safety limit to prevent infinite loops

  try {
    do {
      pageCount++;
      if (pageCount > maxPages) {
        console.warn(`Reached maximum page limit (${maxPages}) for playlist ${playlistId}`);
        break;
      }

      const params = new URLSearchParams({
        part: "snippet,contentDetails",
        maxResults: "50",
        playlistId: playlistId,
        key: apiKey,
      });

      if (nextPageToken) {
        params.append("pageToken", nextPageToken);
      }

      const apiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`;
      console.log(
        `Fetching YouTube playlist page ${pageCount} for playlist ${playlistId}`,
        apiUrl.replace(apiKey, "[REDACTED]")
      );

      const response = await fetch(apiUrl, {
        headers: {
          Accept: "application/json",
          referer: "https://cosmic-playlist.replit.app/",
        },
      });

      if (!response.ok) {
        const errorData: YouTubeAPIResponse = await response.json();
        console.error("YouTube API error response:", errorData);

        if (response.status === 403) {
          const errorMessage =
            errorData.error?.message || "API key validation failed or quota exceeded";
          throw new Error(`YouTube API error (403): ${errorMessage}`);
        }

        if (response.status === 404) {
          throw new Error(
            "Playlist not found. It may be private, deleted, or the playlist ID is invalid."
          );
        }

        throw new Error(
          `YouTube API error: ${errorData.error?.message || response.statusText}`
        );
      }

      const data: YouTubeAPIResponse = await response.json();

      if (data.error) {
        throw new Error(`YouTube API error: ${data.error.message}`);
      }

      if (!data.items || data.items.length === 0) {
        if (pageCount === 1) {
          throw new Error("Playlist is empty or has no accessible items");
        }
        break; // No more items
      }

      // Normalize and extract data from each item
      for (const item of data.items) {
        // Skip items without required data
        if (!item.contentDetails?.videoId || !item.snippet?.title) {
          console.warn("Skipping item with missing required data:", item);
          continue;
        }

        const normalizedItem: YouTubePlaylistItem = {
          youtubeId: item.contentDetails.videoId,
          title: item.snippet.title,
          artist:
            item.snippet.videoOwnerChannelTitle ||
            item.snippet.channelTitle ||
            "Unknown Artist",
          thumbnailUrl:
            item.snippet.thumbnails?.default?.url ||
            item.snippet.thumbnails?.medium?.url ||
            "",
        };

        allItems.push(normalizedItem);
      }

      console.log(
        `Fetched ${data.items.length} items from page ${pageCount}. Total so far: ${allItems.length}`
      );

      nextPageToken = data.nextPageToken;
    } while (nextPageToken);

    console.log(
      `Successfully fetched ${allItems.length} items from YouTube playlist ${playlistId}`
    );
    return allItems;
  } catch (error) {
    console.error("Error fetching YouTube playlist:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to fetch YouTube playlist");
  }
}

/**
 * Imports a YouTube Music playlist and adds all songs to a target playlist
 * @param url - The YouTube Music playlist URL
 * @param userId - The authenticated user ID
 * @param targetPlaylistId - The target playlist ID where songs should be added
 * @param storage - The storage interface for database operations
 * @param apiKey - The YouTube API key
 * @returns Summary of the import operation
 */
export async function importYouTubeMusicPlaylist(
  url: string,
  userId: number,
  targetPlaylistId: number,
  storage: IStorage,
  apiKey: string
): Promise<YouTubePlaylistResponse> {
  try {
    // Parse the playlist URL and extract the list parameter
    let playlistId: string | null = null;

    try {
      const urlObj = new URL(url);
      playlistId = urlObj.searchParams.get("list");

      if (!playlistId) {
        throw new Error("Invalid playlist URL: missing 'list' parameter");
      }
    } catch (urlError) {
      if (urlError instanceof TypeError) {
        throw new Error("Invalid playlist URL format");
      }
      throw urlError;
    }

    // Verify the target playlist exists and belongs to the user
    const targetPlaylist = await storage.getPlaylistById(targetPlaylistId);
    if (!targetPlaylist) {
      throw new Error("Target playlist not found");
    }

    if (targetPlaylist.userId !== userId) {
      throw new Error("Unauthorized: Target playlist does not belong to user");
    }

    // Fetch all items from the YouTube playlist
    console.log(
      `Starting import of YouTube playlist ${playlistId} to target playlist ${targetPlaylistId}`
    );
    const playlistItems = await fetchYouTubeMusicPlaylist(playlistId, apiKey);

    if (playlistItems.length === 0) {
      return {
        sourcePlaylistId: playlistId,
        videosFetched: 0,
        videosAdded: 0,
        targetPlaylistId,
        status: "success",
      };
    }

    // Add all songs to the target playlist in a single transaction
    await storage.addSongsToPlaylist(targetPlaylistId, playlistItems);

    console.log(
      `Successfully imported ${playlistItems.length} songs from YouTube playlist ${playlistId} to playlist ${targetPlaylistId}`
    );

    return {
      sourcePlaylistId: playlistId,
      videosFetched: playlistItems.length,
      videosAdded: playlistItems.length,
      targetPlaylistId,
      status: "success",
    };
  } catch (error) {
    console.error("Error importing YouTube playlist:", error);
    throw error;
  }
}

/**
 * Imports a YouTube Music playlist and adds all songs to the main playlist
 * @param url - The YouTube Music playlist URL
 * @param userId - The authenticated user ID
 * @param storage - The storage interface for database operations
 * @param apiKey - The YouTube API key
 * @returns Summary of the import operation
 */
export async function importYouTubeMusicPlaylistToMain(
  url: string,
  userId: number,
  storage: IStorage,
  apiKey: string
): Promise<YouTubePlaylistResponse> {
  try {
    // Parse the playlist URL and extract the list parameter
    let playlistId: string | null = null;

    try {
      const urlObj = new URL(url);
      playlistId = urlObj.searchParams.get("list");

      if (!playlistId) {
        throw new Error("Invalid playlist URL: missing 'list' parameter");
      }
    } catch (urlError) {
      if (urlError instanceof TypeError) {
        throw new Error("Invalid playlist URL format");
      }
      throw urlError;
    }

    // Fetch all items from the YouTube playlist
    console.log(
      `Starting import of YouTube playlist ${playlistId} to main playlist for user ${userId}`
    );
    const playlistItems = await fetchYouTubeMusicPlaylist(playlistId, apiKey);

    if (playlistItems.length === 0) {
      return {
        sourcePlaylistId: playlistId,
        videosFetched: 0,
        videosAdded: 0,
        status: "success",
      };
    }

    // Add all songs to the main playlist one by one
    let addedCount = 0;
    for (const item of playlistItems) {
      try {
        await storage.addSong(userId, {
          youtubeId: item.youtubeId,
          title: item.title,
          artist: item.artist,
          thumbnailUrl: item.thumbnailUrl,
          position: 0, // storage.addSong assigns the real queue position
        });
        addedCount++;
      } catch (error) {
        console.error(`Failed to add song ${item.title} to main playlist:`, error);
        // Continue with other songs even if one fails
      }
    }

    console.log(
      `Successfully imported ${addedCount} songs from YouTube playlist ${playlistId} to main playlist for user ${userId}`
    );

    return {
      sourcePlaylistId: playlistId,
      videosFetched: playlistItems.length,
      videosAdded: addedCount,
      status: "success",
    };
  } catch (error) {
    console.error("Error importing YouTube playlist to main:", error);
    throw error;
  }
}



