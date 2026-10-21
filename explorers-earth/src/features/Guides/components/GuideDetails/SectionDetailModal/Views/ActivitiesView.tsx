/**
 * ActivitiesView Component
 * Displays activities and attractions with photo support
 */

import React, { useState } from "react";
import { getPlaceIcon } from "../../../../utils/placeIconMapper";
import DirectionIcon from "../../../../../../assets/icons/DirectionIcon";
import MediaViewer from "../../../../../../components/ui/MediaViewer";
import { useMediaViewer } from "../../../../../../hooks/useMediaViewer";
import type { MediaItem } from "../../../../../../components/ui/MediaViewer";
import { keyboardActivation } from "../../../../../../utils/keyboardActivation";

interface ActivitiesViewProps {
  activities: any;
}

const ActivitiesView: React.FC<ActivitiesViewProps> = ({ activities }) => {
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(
    null
  );
  const { isOpen, currentIndex, openViewer, closeViewer } = useMediaViewer();

  if (!activities) return null;

  try {
    const activitiesData =
      typeof activities === "string"
        ? JSON.parse(activities)
        : activities;

    if (!activitiesData.activities || activitiesData.activities.length === 0) {
      return null;
    }

    const selectedActivity = activitiesData.activities.find(
      (a: any) => a.id === selectedActivityId
    );

    return (
      <div>
        <h3 className="text-dashboard text-lg font-poppins font-semibold mb-3 flex items-center gap-2">
          <svg
            className="w-5 h-5 text-dashboard-accent"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
            />
          </svg>
          Places
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {activitiesData.activities.map((activity: any, idx: number) => {
            const placeIcon = getPlaceIcon(activity.types || [], "5", "white");
            const hasPhotos =
              activity.photos && activity.photos.length > 0;
            const firstPhoto = hasPhotos ? activity.photos[0] : null;

            return (
              <div
                key={idx}
                {...keyboardActivation(() => {
                  if (hasPhotos) {
                    setSelectedActivityId(activity.id);
                    openViewer(0);
                  }
                })}
                className={`group relative bg-dashboard-bg rounded-lg border border-dashboard-muted hover:border-dashboard-accent/40 transition-all shadow-sm overflow-hidden ${
                  hasPhotos ? "cursor-pointer" : ""
                }`}
              >
                {/* Photo or Gradient Background */}
                <div className="relative h-32 sm:h-36 overflow-hidden">
                  {firstPhoto ? (
                    <img
                      src={firstPhoto.url}
                      alt={activity.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-dashboard-sidebar to-dashboard-accent flex items-center justify-center">
                      <div className="text-4xl opacity-80">{placeIcon}</div>
                    </div>
                  )}
                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

                  {/* Photo Count Badge */}
                  {hasPhotos && activity.photos.length > 1 && (
                    <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-xs font-poppins font-medium text-white">
                      +{activity.photos.length}
                    </div>
                  )}
                </div>

                {/* Activity Info */}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h5 className="text-dashboard font-poppins font-semibold text-sm line-clamp-2 mb-1">
                        {activity.name}
                      </h5>
                      {activity.formatted_address && (
                        <p className="text-dashboard-light text-xs font-poppins line-clamp-1">
                          {activity.formatted_address}
                        </p>
                      )}
                    </div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        activity.name
                      )}&query_place_id=${activity.place_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 p-1.5 rounded-lg hover:bg-blue-500/10 text-blue-400 hover:text-blue-500 transition-all"
                      title="Open in Google Maps"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DirectionIcon size="4" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Media Viewer for selected activity photos */}
        {selectedActivity && selectedActivity.photos && selectedActivity.photos.length > 0 && (
          <MediaViewer
            isOpen={isOpen}
            onClose={() => {
              closeViewer();
              setSelectedActivityId(null);
            }}
            initialIndex={currentIndex}
            mediaItems={selectedActivity.photos.map(
              (photo: any): MediaItem => ({
                id: photo.id,
                url: photo.url,
                alt: selectedActivity.name,
                type: "image",
                fileName: photo.fileName,
                width: photo.width,
                height: photo.height,
                aspectRatio: photo.aspectRatio,
              })
            )}
          />
        )}
      </div>
    );
  } catch {
    return null;
  }
};

export default ActivitiesView;

