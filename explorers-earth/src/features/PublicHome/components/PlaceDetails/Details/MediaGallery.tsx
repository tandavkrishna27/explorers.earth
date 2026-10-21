import { FC, memo, useMemo } from "react";
import MediaViewer from "../../../../../components/ui/MediaViewer";
import {
  useMediaViewer,
  convertToMediaItems,
} from "../../../../../hooks/useMediaViewer";
import { keyboardActivation } from "../../../../../utils/keyboardActivation";

interface MediaItem {
  url: string;
  mime?: string;
  ext?: string;
}

interface MediaGalleryProps {
  Media?: MediaItem[];
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

const MediaGallery: FC<MediaGalleryProps> = memo(({ Media }) => {
  // MediaViewer state
  const { isOpen, currentIndex, openViewer, closeViewer } = useMediaViewer();

  // Convert media items for MediaViewer
  const mediaItems = useMemo(() => {
    if (!Media || !Array.isArray(Media)) return [];
    return convertToMediaItems(
      Media.map((item, index) => ({
        id: `media-${index}`,
        url: item.url,
        alt: `Media ${index + 1}`,
        type: isVideo(item) ? "video" : ("image" as const),
      }))
    );
  }, [Media]);

  // Early return if Media is not provided or empty
  if (!Media || !Array.isArray(Media) || Media.length === 0) {
    return (
      <div className="mt-4 flex justify-center mb-20 gap-6 items-center">
        <div className="text-center text-dashboard-light py-8">
          <p className="text-sm">No media available</p>
        </div>
      </div>
    );
  }

  // Handle media click
  const handleMediaClick = (index: number) => {
    openViewer(index);
  };

  return (
    <div className="mt-4 flex justify-center mb-20 gap-6 items-center overflow-x-hidden px-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full max-w-full">
        {Media?.length > 0 ? (
          Media.map((mediaItem: MediaItem, index: number) => (
            <div key={index} className="relative w-full">
              {isVideo(mediaItem) ? (
                <video
                  src={mediaItem.url}
                  className="object-cover cursor-pointer h-40 w-full rounded-xl"
                  controls={false}
                  muted
                  preload="metadata"
                  poster="" // Could add thumbnail generation here
                  onClick={() => handleMediaClick(index)}
                />
              ) : (
                <img
                  src={mediaItem.url}
                  alt="Preview"
                  className="object-cover cursor-pointer h-40 w-full rounded-xl"
                  {...keyboardActivation(() => handleMediaClick(index))}
                />
              )}
            </div>
          ))
        ) : (
          <span className="text-dashboard font-poppins font-semibold">
            No Media
          </span>
        )}
      </div>

      {/* MediaViewer for media gallery */}
      <MediaViewer
        mediaItems={mediaItems}
        initialIndex={currentIndex}
        isOpen={isOpen}
        onClose={closeViewer}
      />
    </div>
  );
});

export default MediaGallery;
