import { FC, memo } from "react";
import { keyboardActivation } from "../../utils/keyboardActivation";

interface MediaItem {
  url: string;
  alt?: string;
  mime?: string;
  ext?: string;
  type?: "image" | "video";
}

interface MediaPreviewGridProps {
  mediaItems: MediaItem[];
  onViewAllMedia?: () => void;
  onMediaClick?: (index: number) => void;
}

const isVideo = (item: MediaItem): boolean => {
  // Check mime type first
  if (item.mime) {
    return item.mime.startsWith("video/");
  }

  // Fallback to URL-based detection
  const videoExtensions = [".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"];
  const url = item.url.toLowerCase();
  return videoExtensions.some((ext) => url.includes(ext));
};

const MediaPreviewGrid: FC<MediaPreviewGridProps> = memo(
  ({ mediaItems, onViewAllMedia, onMediaClick }) => {
    if (!mediaItems || mediaItems.length === 0) {
      return null;
    }

    const handleMediaClick = (index: number) => {
      if (onMediaClick) {
        onMediaClick(index);
      }
    };

    return (
      <div className="mt-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-poppins text-white font-semibold text-sm">
            Photos & Videos
          </h2>
        </div>

        {/* Dynamic Media Grid */}
        <div className="grid grid-cols-4 grid-rows-2 gap-2 h-40">
          {/* First large media - spans 2x2 */}
          {mediaItems[0] && (
            <div className="col-span-2 row-span-2 rounded-lg overflow-hidden">
              {isVideo(mediaItems[0]) ? (
                <video
                  src={mediaItems[0].url}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-200 cursor-pointer"
                  muted
                  preload="metadata"
                  onClick={() => handleMediaClick(0)}
                />
              ) : (
                <img
                  src={mediaItems[0].url}
                  alt={mediaItems[0].alt || "Media"}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-200 cursor-pointer"
                  {...keyboardActivation(() => handleMediaClick(0))}
                />
              )}
            </div>
          )}

          {/* Second media - top right */}
          {mediaItems[1] && (
            <div className="col-span-2 row-span-1 rounded-lg overflow-hidden">
              {isVideo(mediaItems[1]) ? (
                <video
                  src={mediaItems[1].url}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-200 cursor-pointer"
                  muted
                  preload="metadata"
                  onClick={() => handleMediaClick(1)}
                />
              ) : (
                <img
                  src={mediaItems[1].url}
                  alt={mediaItems[1].alt || "Media"}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-200 cursor-pointer"
                  {...keyboardActivation(() => handleMediaClick(1))}
                />
              )}
            </div>
          )}

          {/* Third and fourth media - bottom right, split */}
          {mediaItems[2] && (
            <div className="col-span-1 row-span-1 rounded-lg overflow-hidden">
              {isVideo(mediaItems[2]) ? (
                <video
                  src={mediaItems[2].url}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-200 cursor-pointer"
                  muted
                  preload="metadata"
                  onClick={() => handleMediaClick(2)}
                />
              ) : (
                <img
                  src={mediaItems[2].url}
                  alt={mediaItems[2].alt || "Media"}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-200 cursor-pointer"
                  {...keyboardActivation(() => handleMediaClick(2))}
                />
              )}
            </div>
          )}

          {mediaItems[3] && (
            <div className="col-span-1 row-span-1 rounded-lg overflow-hidden relative">
              {isVideo(mediaItems[3]) ? (
                <video
                  src={mediaItems[3].url}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-200 cursor-pointer"
                  muted
                  preload="metadata"
                  onClick={() => handleMediaClick(3)}
                />
              ) : (
                <img
                  src={mediaItems[3].url}
                  alt={mediaItems[3].alt || "Media"}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-200 cursor-pointer"
                  {...keyboardActivation(() => handleMediaClick(3))}
                />
              )}

              {/* Clickable Overlay for additional media count */}
              {mediaItems.length > 4 && (
                <div
                  {...keyboardActivation(() => onViewAllMedia?.())}
                  className="absolute inset-0 bg-black bg-opacity-60 flex flex-col items-center justify-center rounded-lg cursor-pointer hover:bg-opacity-70 transition-all duration-200 group"
                >
                  <span className="text-white text-xs font-semibold mb-1">
                    +{mediaItems.length - 4}
                  </span>
                  <span className="text-white text-xs opacity-80 group-hover:opacity-100 transition-opacity">
                    View all →
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);

export default MediaPreviewGrid;
