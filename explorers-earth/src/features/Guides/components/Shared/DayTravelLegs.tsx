import React, { useMemo } from "react";
import { getTransportSegments } from "../../utils/guideHelpers";
import { dayTravelLegs, formatTravelLeg } from "../../utils/travelLegs";
import { getTravelModeConfig } from "../../utils/travelModeConfig";
import { parseTimeline } from "../../utils/guideDataParser";

/**
 * Distance and travel time between consecutive stops of a day, as the Edit Day form shows
 * them (UAT GDE-X05). Renders nothing for a day with fewer than two locatable stops.
 */
const DayTravelLegs: React.FC<{ section: any; className?: string }> = ({ section, className = "" }) => {
  const legs = useMemo(() => {
    const timeline = parseTimeline(section?.Timeline);
    return dayTravelLegs([...timeline.morning, ...timeline.afternoon, ...timeline.evening], getTransportSegments(section ?? {}));
  }, [section]);

  if (legs.length === 0) return null;

  return (
    <ul className={`flex flex-col gap-1.5 ${className}`} aria-label="Travel between places">
      {legs.map(({ from, to, leg }, index) => (
        <li key={`${from.id ?? from.place_id}-${to.id ?? to.place_id}-${index}`}
          className="flex items-center gap-2 text-xs font-poppins text-dashboard-light">
          <span className="w-4 h-4 flex items-center justify-center text-dashboard-accent shrink-0">
            {getTravelModeConfig(leg.mode)?.icon}
          </span>
          <span className="truncate">{from.name || "Place"} → {to.name || "Place"}</span>
          <span className="text-dashboard font-medium whitespace-nowrap">{formatTravelLeg(leg)}</span>
        </li>
      ))}
    </ul>
  );
};

export default DayTravelLegs;
