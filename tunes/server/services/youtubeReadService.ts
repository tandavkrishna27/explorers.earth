import { MusicIdentityError } from "../../shared/musicError";
import { cancelResponseBody, readBoundedResponseBody } from "./upstreamResponseBody";

interface SearchInput { query: string; pageToken?: string; }

export function createYouTubeReadService(apiKey: string | undefined, fetchImpl: typeof fetch = fetch) {
  const key = apiKey?.trim();
  const request = async (path: "search" | "videos", parameters: Record<string, string>) => {
    if (!key) throw new MusicIdentityError("UPSTREAM_UNAVAILABLE", 503, "YouTube search is temporarily unavailable.", "retry", true, 30);
    const query = new URLSearchParams({ part: "snippet", key, ...parameters });
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    timeout.unref?.();
    try {
      response = await fetchImpl(`https://www.googleapis.com/youtube/v3/${path}?${query}`, {
        headers: { Accept: "application/json" },
        redirect: "manual",
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timeout);
      throw new MusicIdentityError("UPSTREAM_UNAVAILABLE", 503, "YouTube search is temporarily unavailable.", "retry", true, 30);
    }
    try {
      if (!response.ok) {
        await cancelResponseBody(response);
        throw new MusicIdentityError("UPSTREAM_UNAVAILABLE", 502, "YouTube search is temporarily unavailable.", "retry", true);
      }
      let value: any;
      const body = await readBoundedResponseBody(response, 128 * 1024, 5_000, controller);
      try { value = JSON.parse(body); }
      catch { value = undefined; }
      if (!value || !Array.isArray(value.items)) {
        throw new MusicIdentityError("UPSTREAM_MALFORMED", 502, "YouTube returned an invalid response.", "retry", true);
      }
      return value;
    } catch (error) {
      if (error instanceof MusicIdentityError) throw error;
      if (!(error instanceof RangeError || error instanceof SyntaxError || error instanceof TypeError)) {
        throw new MusicIdentityError("UPSTREAM_UNAVAILABLE", 503, "YouTube search is temporarily unavailable.", "retry", true, 30);
      }
      throw new MusicIdentityError("UPSTREAM_MALFORMED", 502, "YouTube returned an invalid response.", "retry", true);
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    async search(input: SearchInput) {
      const value = await request("search", {
        maxResults: "20",
        q: input.query,
        type: "video",
        videoEmbeddable: "true",
        videoSyndicated: "true",
        ...(input.pageToken ? { pageToken: input.pageToken } : {}),
      });
      return {
        nextPageToken: typeof value.nextPageToken === "string" ? value.nextPageToken : null,
        items: value.items.map(mapSearchItem).filter(Boolean),
      };
    },
    async videoFromUrl(url: string) {
      const videoId = youtubeVideoId(url);
      if (!videoId) return undefined;
      const value = await request("videos", { id: videoId, part: "snippet,status" });
      const item = value.items[0];
      return item ? mapVideoItem(item) : undefined;
    },
  };
}

function safeSnippet(value: any) {
  if (!value || typeof value.title !== "string" || typeof value.channelTitle !== "string"
      || typeof value.thumbnails?.default?.url !== "string") return undefined;
  return {
    title: value.title.slice(0, 1_024),
    channelTitle: value.channelTitle.slice(0, 1_024),
    thumbnails: { default: { url: value.thumbnails.default.url.slice(0, 2_048) } },
  };
}

function mapSearchItem(value: any) {
  const videoId = value?.id?.videoId;
  const snippet = safeSnippet(value?.snippet);
  return typeof videoId === "string" && /^[A-Za-z0-9_-]{11}$/.test(videoId) && snippet
    ? { id: { videoId }, snippet }
    : undefined;
}

function mapVideoItem(value: any) {
  const videoId = value?.id;
  const snippet = safeSnippet(value?.snippet);
  return value?.status?.embeddable === true
    && typeof videoId === "string" && /^[A-Za-z0-9_-]{11}$/.test(videoId) && snippet
    ? { id: { videoId }, snippet }
    : undefined;
}

function youtubeVideoId(value: string): string | undefined {
  let url: URL;
  try { url = new URL(value); } catch { return undefined; }
  const host = url.hostname.toLowerCase();
  const candidate = host === "youtu.be" ? url.pathname.slice(1)
    : ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host) ? url.searchParams.get("v") ?? ""
      : "";
  return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : undefined;
}
