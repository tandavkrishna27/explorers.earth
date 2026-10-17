import { FC, memo } from "react";
import type { Guide } from "../types";
import { isDisplayableNumber, toDisplayNumber } from "../../../utils/rating";

interface PublicGuideCardProps {
  guide: Guide;
  onClickHandler: (guide: Guide) => void;
}

const PublicGuideCard: FC<PublicGuideCardProps> = memo(
  ({ guide, onClickHandler }) => {
    // Get image from Guide_Media
    const coverImage =
      guide.Guide_Media?.[0]?.url || "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=400";

    // Parse Place_Details if it's a string
    let placeDetails: any = {};
    if (guide.Place_Details) {
      if (typeof guide.Place_Details === "string") {
        try {
          const parsed = JSON.parse(guide.Place_Details);
          // A legacy value can parse to null/number/array — only keep real objects
          // so `.Rating` / Object.keys() below can't throw.
          if (parsed && typeof parsed === "object") placeDetails = parsed;
        } catch (error) {
          console.error("Error parsing Place_Details:", error);
        }
      } else if (typeof guide.Place_Details === "object") {
        placeDetails = guide.Place_Details;
      }
    }

    // Get rating for display (fallback to 5.0). Guard against non-numeric
    // strings persisted in Place_Details so rating.toFixed can't crash.
    const rating = isDisplayableNumber(placeDetails.Rating)
      ? toDisplayNumber(placeDetails.Rating)
      : 5.0;

    // Extract location tags based on single vs multi-city
    const getLocationTags = (): string[] => {
      if (!placeDetails || Object.keys(placeDetails).length === 0) {
        return [];
      }

      // Check if it's multi-city format
      if (
        placeDetails.isMultiCity === true &&
        ((placeDetails.ending || placeDetails.arrival || placeDetails.to) &&
          (placeDetails.starting || placeDetails.departure || placeDetails.from))
      ) {
        const cities: string[] = [];
        
        // Add starting city
        const starting = placeDetails.starting || placeDetails.departure || placeDetails.from;
        if (starting?.Place_Name) {
          cities.push(starting.Place_Name);
        } else if (starting?.Place_Address) {
          cities.push(starting.Place_Address);
        }

        // Add intermediate cities
        const intermediateCities = placeDetails.intermediateCities || [];
        intermediateCities.forEach((city: any) => {
          if (city.Place_Name) {
            cities.push(city.Place_Name);
          } else if (city.Place_Address) {
            cities.push(city.Place_Address);
          }
        });

        // Add ending city
        const ending = placeDetails.ending || placeDetails.arrival || placeDetails.to;
        if (ending?.Place_Name) {
          cities.push(ending.Place_Name);
        } else if (ending?.Place_Address) {
          cities.push(ending.Place_Address);
        }

        return cities;
      } else {
        // Single city format
        const locationName = placeDetails.Place_Name || placeDetails.Place_Address;
        return locationName ? [locationName] : [];
      }
    };

    const locationTags = getLocationTags();

    return (
      <div
        onClick={() => onClickHandler(guide)}
        className="bg-[var(--category-card,rgba(255,255,255,0.03))] border border-[var(--category-control-border,rgba(255,255,255,0.06))] rounded-2xl overflow-hidden relative flex flex-col min-h-[200px] cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:border-[var(--category-control-border,rgba(255,255,255,0.15))]"
      >
        {/* Cover Image */}
        <div
          className="h-[110px] w-full bg-cover bg-center border-b border-[var(--category-control-border,rgba(255,255,255,0.06))] relative"
          style={{ backgroundImage: `url('${coverImage}')` }}
        />

        {/* Card Details */}
        <div className="p-3 flex flex-col justify-between flex-grow">
          <div>
            <h3 className="text-[0.72rem] md:text-[0.82rem] font-bold text-[var(--category-text,#FFFFFF)] leading-snug line-clamp-2 mb-1 font-poppins">
              {guide.Title}
            </h3>
            <span className="text-[0.58rem] text-[var(--category-muted,rgba(255,255,255,0.45))] font-medium font-poppins block">
              ★ {rating.toFixed(1)} &middot; {guide.Number_Of_Days || 0} {guide.Number_Of_Days === 1 ? "Day" : "Days"} &middot; {guide.Guide_Type || "Itinerary"}
            </span>
          </div>

          {/* Location Tags Badges */}
          {locationTags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {locationTags.slice(0, 3).map((tag, index) => (
                <span
                  key={index}
                  className="text-[0.52rem] bg-[var(--category-card,rgba(255,255,255,0.06))] px-1.5 py-0.5 rounded text-[var(--category-muted,rgba(255,255,255,0.75))] font-poppins truncate max-w-[80px]"
                  title={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
);

PublicGuideCard.displayName = "PublicGuideCard";

export default PublicGuideCard;
