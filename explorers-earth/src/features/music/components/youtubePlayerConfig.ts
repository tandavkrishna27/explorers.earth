type YouTubeErrorEvent = { currentTarget?: { error?: { code?: unknown } } };

const EMBED_REJECTION_CODES = new Set([101, 150, 153]);

/**
 * ReactPlayer v3 forwards this to youtube-video-element.  YouTube requires a
 * stable page origin for API-backed embeds and must receive a non-empty
 * referrer on modern browsers.
 */
export function createYouTubePlayerConfig(
  origin: string = window.location.origin,
  widgetReferrer: string = window.location.href,
) {
  return {
    youtube: {
      origin,
      widget_referrer: widgetReferrer,
      referrerpolicy: "strict-origin-when-cross-origin",
    },
  };
}

export function isYouTubeEmbedRejection(cause: unknown): boolean {
  const code = Number((cause as YouTubeErrorEvent | undefined)?.currentTarget?.error?.code);
  return EMBED_REJECTION_CODES.has(code);
}

export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}
