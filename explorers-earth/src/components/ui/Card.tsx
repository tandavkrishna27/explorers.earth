import { FC, memo, ReactElement, useState, useEffect, useRef } from "react";
import { isDisplayableNumber, toDisplayNumber } from "../../utils/rating";
import VerticalKebab from "../../assets/icons/VerticalKebab";
import Location from "../../assets/icons/Location";
import Profile from "../../assets/icons/Profile";
import { motion } from "framer-motion";
import { IMAGE_CONFIG } from "../../config";
import { useTranslation } from "react-i18next";

interface MenuItem {
  icon?: ReactElement;
  label?: string;
  action: () => void;
  disabled?: boolean;
  title?: string;
}

interface CardProps {
  title?: string;
  image?: string;
  rating?: number;
  reviews?: number;
  onClickhandler?: () => void;
  cardType?: "default" | "menuCard" | "map" | "suggestion";
  menuItems?: MenuItem[];
  hasBottomButton?: boolean; // New prop to control bottom border radius
  recommendationType?: "place" | "person"; // Type of recommendation for icon display
  numberOfDays?: number | null;
  locationTags?: string[];
  visibility?: boolean | null;
  isPinned?: boolean;
}

const Card: FC<CardProps> = memo(
  ({
    onClickhandler,
    title,
    image,
    rating,
    reviews,
    cardType,
    menuItems,
    hasBottomButton,
    recommendationType,
    numberOfDays,
    locationTags,
    visibility,
    isPinned,
  }) => {
    const { t } = useTranslation();
    const [showMenu, setShowMenu] = useState(false);
    const kebabContainerRef = useRef<HTMLDivElement>(null);


    const handleMenuToggle = () => {
      setShowMenu((prev) => !prev);
    };

    // Close menu when clicking outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          kebabContainerRef.current &&
          !kebabContainerRef.current.contains(event.target as Node)
        ) {
          setShowMenu(false);
        }
      };

      if (showMenu) {
        document.addEventListener("mousedown", handleClickOutside);
      }

      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [showMenu]);

    // Determine if this is a guide card (has numberOfDays or locationTags)
    // Guide cards have numberOfDays (even if 0) or locationTags
    const isGuideCard = (numberOfDays !== null && numberOfDays !== undefined) || (locationTags && locationTags.length > 0);

    return (
      <motion.div
        whileHover={
          cardType === "suggestion"
            ? {}
            : {
              scale: cardType === "map" ? 1.05 : 1.05,
              zIndex: cardType === "map" ? 10 : 1,
            }
        }
        transition={{ type: "spring", stiffness: 200 }}
        className={`white-theme ${cardType === "map"
          ? "flex-shrink-0 w-48 h-48 md:h-48 md:w-[20rem] relative rounded-xl overflow-hidden"
          : cardType === "suggestion"
            ? `w-32 h-20 md:h-24 md:w-40 relative overflow-hidden ${hasBottomButton ? "rounded-t-lg" : "rounded-lg"
            }`
            : isGuideCard
              ? "relative w-full aspect-[16/9] md:aspect-[4/3] max-w-none mx-auto rounded-xl overflow-hidden"
              : "relative w-full aspect-square md:aspect-[4/3] max-w-[200px] md:max-w-none mx-auto rounded-xl overflow-hidden"
          }  cursor-pointer`}
        style={{
          transformOrigin: "center center", // Ensure scaling happens from center
        }}
        onClick={
          cardType === "default" ||
            cardType === "map" ||
            cardType === "suggestion" ||
            cardType === "menuCard"
            ? onClickhandler
            : undefined
        }
      >
        {cardType === "menuCard" && (
          <>
            {/* Gradient overlay at the top for kebab button visibility */}
            <div
              className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/60 via-black/40 to-transparent pointer-events-none z-30 w-full"
            />
          </>
        )}

        {/* Recommendation Type Icon - Top Left (for both menuCard and default) */}
        {recommendationType && (
          <div
            className="absolute z-40 left-2 top-2 p-1.5 rounded-full bg-black/40 backdrop-blur-sm pointer-events-none"
          >
            {recommendationType === "person" ? (
              <Profile fill="white" />
            ) : (
              <Location fill="white" size={20} className="size-5" />
            )}
          </div>
        )}

        {/* Number of Days Badge - Top Left (for guide cards) */}
        {/* Show on guide cards (has numberOfDays) but not on suggestion cards */}
        {/* For menuCard with recommendationType, position below the icon; otherwise at top left */}
        {numberOfDays !== null && numberOfDays !== undefined && cardType !== "suggestion" && (
          <div className={`absolute z-40 bg-dashboard-accent/90 backdrop-blur-sm text-white px-2 py-1 rounded-md flex items-center gap-1 ${cardType === "menuCard" && recommendationType
            ? "left-2 top-12" // Position below recommendation type icon (for recommendation cards)
            : "left-2 top-2"   // Default top left position (for guide cards)
            }`}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-poppins font-semibold">{numberOfDays} {numberOfDays === 1 ? 'Day' : 'Days'}</span>
          </div>
        )}

        {/* Status Badge - Top Right next to Kebab */}
        {((visibility !== undefined && visibility !== null) || isPinned) && cardType === "menuCard" && (
          <div className={`absolute z-40 right-10 top-2 px-1.5 py-1 rounded-md flex items-center gap-1 backdrop-blur-sm ${
            visibility
              ? "bg-emerald-500/90 text-white"
              : "bg-slate-500/90 text-white"
            }`}>
            {isPinned && (
              <svg className="w-2.5 h-2.5 text-amber-400 fill-amber-400 flex-shrink-0" viewBox="0 0 24 24">
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
              </svg>
            )}
            {visibility !== undefined && visibility !== null && (
              <span className="text-[10px] font-poppins font-semibold uppercase tracking-wider">
                {visibility ? t("dashboard.categoryPages.public") : t("dashboard.home.draft")}
              </span>
            )}
          </div>
        )}

        {cardType === "menuCard" && (
          <div ref={kebabContainerRef} className="absolute z-40 right-2 top-2">
            <button
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                handleMenuToggle();
              }}
            >
              <VerticalKebab size={"5"} />
            </button>
            {showMenu && (
              <div className="absolute z-50 right-0 top-full mt-1 bg-dashboard-sidebar shadow-dashboard-elevated rounded-md p-2 border border-dashboard">
                {menuItems?.map((item, index) => (
                  <button
                    key={index}
                    disabled={item.disabled}
                    title={item.title}
                    className="flex w-full items-center gap-2 mb-2 text-sm text-dashboard hover:bg-dashboard-muted rounded px-2 py-1 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed border-none bg-transparent text-left"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.disabled) return;
                      item.action();
                      setShowMenu(false);
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <img
          src={image || IMAGE_CONFIG.defaultImages.place}
          alt={title || ""}
          loading="lazy"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (target.src !== IMAGE_CONFIG.defaultImages.place) {
              target.src = IMAGE_CONFIG.defaultImages.place;
            }
          }}
          className={`object-cover ${cardType === "map"
            ? "w-48 h-48 md:w-full md:h-48"
            : cardType === "suggestion"
              ? "w-32 h-20 md:w-40 md:h-24"
              : isGuideCard
                ? "w-full aspect-[16/9] md:aspect-[4/3] object-cover"
                : "w-full aspect-square md:aspect-[4/3] object-cover"
            }`}
        />
        <div
          className={`absolute inset-0 bg-gradient-to-t from-black/70 to-transparent ${cardType === "map"
            ? "w-48 md:w-full"
            : cardType === "suggestion"
              ? "w-32 md:w-40"
              : "w-full"
            }`}
        />
        <div
          className={`absolute bottom-0 text-white ${cardType === "map"
            ? "w-48 md:w-full px-2 py-2"
            : cardType === "suggestion"
              ? "w-32 md:w-40 px-1.5 py-1.5"
              : "w-full px-2 py-2"
            }`}
        >
          <h3
            className={`font-poppins font-medium ${cardType === "suggestion"
              ? "text-xs leading-tight truncate"
              : "md:text-base text-sm truncate"
              }`}
          >
            {title}
          </h3>

          {/* Location Tags - Below Title */}
          {locationTags && locationTags.length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 max-h-12 overflow-hidden ${cardType === "suggestion" ? "max-h-4" : ""
              }`}>
              {locationTags.slice(0, 4).map((tag, index) => {
                const isLast = index === 3;
                const hasMore = locationTags.length > 4;
                const shouldShowEllipsis = isLast && hasMore;

                return (
                  <span
                    key={index}
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-poppins font-medium bg-white/20 backdrop-blur-sm text-white border border-white/30 ${cardType === "suggestion" ? "text-[10px] px-1 py-0" : ""
                      }`}
                  >
                    {shouldShowEllipsis ? `${tag}...` : tag}
                  </span>
                );
              })}
            </div>
          )}

          {(rating !== undefined || reviews !== undefined) && (
            <div
              className={`flex items-center gap-1 ${cardType === "suggestion" ? "mt-0.5" : "mt-1"
                }`}
            >
              {isDisplayableNumber(rating) && (
                <div className="flex items-center gap-0.5">
                  <span
                    className={`text-dashboard-accent ${cardType === "suggestion" ? "text-xs" : "text-xs"
                      }`}
                  >
                    ★
                  </span>
                  <span
                    className={`font-poppins ${cardType === "suggestion" ? "text-xs" : "text-xs"
                      }`}
                  >
                    {toDisplayNumber(rating).toFixed(1)}
                  </span>
                </div>
              )}
              {reviews !== undefined && reviews > 0 && (
                <span
                  className={`text-dashboard-light font-poppins ${cardType === "suggestion"
                    ? "text-xs truncate max-w-16"
                    : "text-xs"
                    }`}
                >
                  ({reviews > 999 ? `${Math.floor(reviews / 1000)}k` : reviews})
                </span>
              )}
            </div>
          )}
        </div>
      </motion.div>
    );
  }
);

export default Card;
