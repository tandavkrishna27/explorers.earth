import { motion, AnimatePresence } from "framer-motion";
import { FC, useState, useEffect, useRef, useCallback } from "react";
import CrossIcon from "../assets/icons/CrossIcon";
import Button from "./ui/Button";
import ImageWithFallback from "./ui/ImageWithFallback";
import { useTranslation } from "react-i18next";

import { usePublicCategoryThemeStyles } from "../features/PublicHome/components/PublicCategoryThemeContext";

interface Place {
  List_Name: string;
  List_Name_Details?: {
    thumbnail?: string;
  };
  Visibility: boolean;
  // A list has no thumbnail until its cover media is set.
  imageUrl?: string;
  documentId?: string;
}

interface CircularPlacesModalProps {
  isOpen: boolean;
  onClose: () => void;
  places: Place[];
  handleCitySelect: (city: Place) => void;
}

const CircularPlacesModal: FC<CircularPlacesModalProps> = ({
  isOpen,
  onClose,
  places,
  handleCitySelect,
}) => {
  const { t } = useTranslation();
  const categoryStyles = usePublicCategoryThemeStyles();
  const [visiblePlaces, setVisiblePlaces] = useState<Place[]>([]);
  const [currentIndex, setCurrentIndex] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedAll, setHasLoadedAll] = useState(false);
  const [isScrollEnabled, setIsScrollEnabled] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const ITEMS_PER_LOAD = 10;

  // Lock/unlock body scroll when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      // Store current scroll position
      const scrollY = window.scrollY;

      // Lock body scroll
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";

      // Cleanup function to restore scroll
      return () => {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.width = "";
        document.body.style.overflow = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  // Initialize visible places when modal opens
  useEffect(() => {
    if (isOpen && places.length > 0) {
      setVisiblePlaces(places.slice(0, ITEMS_PER_LOAD));
      setCurrentIndex(ITEMS_PER_LOAD);
      setHasLoadedAll(false);
      setIsLoading(false);
      setIsScrollEnabled(true);
      loadingRef.current = false;
    }
  }, [isOpen, places]);

  // Load more places function
  const loadMorePlaces = useCallback(() => {
    // Multiple guards to prevent unnecessary loading
    if (
      loadingRef.current ||
      hasLoadedAll ||
      currentIndex >= places.length ||
      !isScrollEnabled
    ) {
      return;
    }

    loadingRef.current = true;
    setIsLoading(true);

    // Simulate loading delay for better UX
    setTimeout(() => {
      const nextBatch = places.slice(
        currentIndex,
        currentIndex + ITEMS_PER_LOAD
      );
      const newIndex = currentIndex + ITEMS_PER_LOAD;

      setVisiblePlaces((prev) => [...prev, ...nextBatch]);
      setCurrentIndex(newIndex);

      // Check if we've loaded all places
      if (newIndex >= places.length) {
        setHasLoadedAll(true);
        setIsScrollEnabled(false); // Disable scroll detection completely
      }

      setIsLoading(false);
      loadingRef.current = false;
    }, 300);
  }, [currentIndex, places.length, hasLoadedAll, isScrollEnabled]);

  // Check if we need to load more content when modal opens or content changes
  useEffect(() => {
    if (
      isOpen &&
      visiblePlaces.length > 0 &&
      !hasLoadedAll &&
      !isLoading &&
      !loadingRef.current
    ) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        const container = scrollContainerRef.current;
        if (container) {
          const { scrollHeight, clientHeight } = container;
          const hasOverflow = scrollHeight > clientHeight;

          // If no overflow and there are more places to load, load more
          if (!hasOverflow && currentIndex < places.length) {
            loadMorePlaces();
          }
        }
      }, 100);
    }
  }, [
    isOpen,
    visiblePlaces,
    hasLoadedAll,
    isLoading,
    currentIndex,
    places.length,
    loadMorePlaces,
  ]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setVisiblePlaces([]);
      setCurrentIndex(ITEMS_PER_LOAD);
      setIsLoading(false);
      setHasLoadedAll(false);
      setIsScrollEnabled(true);
      loadingRef.current = false;
    }
  }, [isOpen]);

  // Enhanced scroll detection for mobile and desktop
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      // Early return if scroll is disabled or all places are loaded
      if (!isScrollEnabled || hasLoadedAll || loadingRef.current) {
        return;
      }

      const target = e.currentTarget;
      const { scrollTop, scrollHeight, clientHeight } = target;

      // Calculate scroll percentage more accurately
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

      // Load more when user scrolls to 80% of the content
      if (scrollPercentage > 0.8) {
        loadMorePlaces();
      }
    },
    [loadMorePlaces, hasLoadedAll, isScrollEnabled]
  );

  // Touch event handler for mobile devices
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      // Early return if scroll is disabled or all places are loaded
      if (!isScrollEnabled || hasLoadedAll || loadingRef.current) {
        return;
      }

      const target = e.currentTarget;
      const { scrollTop, scrollHeight, clientHeight } = target;

      // Calculate scroll percentage
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

      // Load more when user scrolls to 80% of the content
      if (scrollPercentage > 0.8) {
        loadMorePlaces();
      }
    },
    [loadMorePlaces, hasLoadedAll, isScrollEnabled]
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/60 flex items-center justify-center z-[150]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          data-category-circular-places={categoryStyles ? true : undefined}
          className={categoryStyles ? "relative backdrop-blur-lg bg-[var(--category-panel)] p-6 rounded-lg shadow-lg h-full w-full flex flex-col" : "relative backdrop-blur-lg bg-black/20 p-6 rounded-lg shadow-lg h-full w-full flex flex-col"}
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.8 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute top-4 right-6">
            <Button
              startIcon={<CrossIcon size="6" stroke={categoryStyles ? "currentColor" : "white"} />}
              variant="ghost"
              onClickHandler={onClose}
            />
          </div>

          {/* Places count indicator */}
          <div className="text-center mb-4 mt-2">
            <p className={categoryStyles ? "text-[var(--category-text)] text-sm font-medium" : "text-white text-sm font-medium"}>
              {t("dashboard.recommendations.placesModal.placesCount", {
                visible: visiblePlaces.length,
                total: places.length,
              })}
            </p>
            {!hasLoadedAll && (
              <p className={categoryStyles ? "text-[var(--category-muted)] text-xs mt-1" : "text-gray-400 text-xs mt-1"}>
                {t("dashboard.recommendations.placesModal.scrollToLoadMore")}
              </p>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center">
            <div
              ref={scrollContainerRef}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-6 p-2 overflow-y-auto max-h-[80vh] overscroll-contain scrollbar-hide"
              style={{
                WebkitOverflowScrolling: "touch", // Enable smooth scrolling on iOS
                scrollBehavior: "smooth",
              }}
              onScroll={isScrollEnabled ? handleScroll : undefined}
              onTouchEnd={isScrollEnabled ? handleTouchEnd : undefined}
            >
              {visiblePlaces.map((place) => (
                <motion.div
                  key={place.List_Name}
                  className="flex flex-col items-center cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => {
                    handleCitySelect(place);
                    onClose();
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                  >
                    <ImageWithFallback
                      referrerPolicy="no-referrer"
                      src={place?.List_Name_Details?.thumbnail}
                      alt={place.List_Name}
                      className={`w-20 h-20 md:w-24 md:h-24 border-2 rounded-full aspect-square object-cover ${
                        place.Visibility ? "border-green-500" : "border-red-500"
                      }`}
                    />
                  </motion.div>
                  <p className={categoryStyles ? "text-[var(--category-text)] text-sm font-medium mt-2 text-center" : "text-white text-sm font-medium mt-2 text-center"}>
                    {place.List_Name}
                  </p>
                </motion.div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="col-span-full flex justify-center items-center py-4">
                  <div className="flex items-center space-x-2">
                    <div className={categoryStyles ? "w-4 h-4 bg-[var(--category-accent)] rounded-full animate-bounce" : "w-4 h-4 bg-purple-500 rounded-full animate-bounce"}></div>
                    <div
                      className={categoryStyles ? "w-4 h-4 bg-[var(--category-accent)] rounded-full animate-bounce" : "w-4 h-4 bg-purple-500 rounded-full animate-bounce"}
                      style={{ animationDelay: "0.1s" }}
                    ></div>
                    <div
                      className={categoryStyles ? "w-4 h-4 bg-[var(--category-accent)] rounded-full animate-bounce" : "w-4 h-4 bg-purple-500 rounded-full animate-bounce"}
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                  </div>
                </div>
              )}

              {/* End of list indicator removed for cleaner UI */}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CircularPlacesModal;
