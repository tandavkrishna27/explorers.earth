import React, { useMemo, useState, useRef } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";
import worldTopologyUrl from "world-atlas/countries-110m.json?url";
import { AnalyticsEvent } from "../../api/queries";
import { useResponsiveChart } from "../../../../hooks/useResponsiveChart";
import EmptyState from '../EmptyState';

/**
 * Props interface for WorldMapChart component
 */
interface WorldMapChartProps {
  events: AnalyticsEvent[];
  isResolvingCountries?: boolean;
}

/**
 * Country data interface for map visualization
 */
interface CountryData {
  country: string;
  views: number;
}

/**
 * World Map Chart Component
 *
 * This component:
 * 1. Takes analytics events as props
 * 2. Filters for view events from public-home and public-profile pages
 * 3. Aggregates views by country
 * 4. Renders an interactive world map with country highlighting
 * 5. Shows tooltips on hover with view counts
 * 6. Uses responsive design for different screen sizes
 */
const WorldMapChart: React.FC<WorldMapChartProps> = ({ events, isResolvingCountries = false }) => {
  const { chartConfig } = useResponsiveChart();
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Handle mouse movement for tooltip positioning
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (mapContainerRef.current) {
      const rect = mapContainerRef.current.getBoundingClientRect();
      setMousePosition({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    }
  };

  // Handle mouse leave to hide tooltip
  const handleMouseLeave = () => {
    setHoveredCountry(null);
    setMousePosition(null);
  };

  // Transform events into country data for map visualization
  const countryData = useMemo(() => {
    // Filter for view events from both public-home and public-profile pages
    const viewEvents = events.filter(
      (event) =>
        event.type === "view" &&
        event.country &&
        (event.page === "public-home" || event.page === "public-profile")
    );

    // Group events by country and count views
    const countryMap: Record<string, number> = {};

    viewEvents.forEach((event) => {
      if (event.country) {
        const country = event.country;
        countryMap[country] = (countryMap[country] || 0) + 1;
      }
    });

    // Convert to array format
    const countryDataArray: CountryData[] = Object.entries(countryMap)
      .map(([country, views]) => ({
        country,
        views,
      }))
      .sort((a, b) => b.views - a.views);

    return countryDataArray;
  }, [events]);

  // Get maximum views for color scaling
  const maxViews = useMemo(() => {
    return countryData.length > 0
      ? Math.max(...countryData.map((d) => d.views))
      : 0;
  }, [countryData]);

  // Country code to name mapping
  const countryCodeToName: Record<string, string> = {
    US: "United States of America",
    IN: "India",
    GB: "United Kingdom",
    CA: "Canada",
    AU: "Australia",
    DE: "Germany",
    FR: "France",
    IT: "Italy",
    ES: "Spain",
    BR: "Brazil",
    MX: "Mexico",
    JP: "Japan",
    CN: "China",
    RU: "Russia",
    KR: "South Korea",
    NL: "Netherlands",
    SE: "Sweden",
    NO: "Norway",
    DK: "Denmark",
    FI: "Finland",
    CH: "Switzerland",
    AT: "Austria",
    BE: "Belgium",
    PL: "Poland",
    CZ: "Czech Republic",
    HU: "Hungary",
    RO: "Romania",
    BG: "Bulgaria",
    GR: "Greece",
    PT: "Portugal",
    IE: "Ireland",
    IS: "Iceland",
    LU: "Luxembourg",
    MT: "Malta",
    CY: "Cyprus",
    EE: "Estonia",
    LV: "Latvia",
    LT: "Lithuania",
    SI: "Slovenia",
    SK: "Slovakia",
    HR: "Croatia",
    BA: "Bosnia and Herzegovina",
    RS: "Serbia",
    ME: "Montenegro",
    MK: "North Macedonia",
    AL: "Albania",
    XK: "Kosovo",
    MD: "Moldova",
    UA: "Ukraine",
    BY: "Belarus",
    GE: "Georgia",
    AM: "Armenia",
    AZ: "Azerbaijan",
    KZ: "Kazakhstan",
    UZ: "Uzbekistan",
    KG: "Kyrgyzstan",
    TJ: "Tajikistan",
    TM: "Turkmenistan",
    AF: "Afghanistan",
    PK: "Pakistan",
    BD: "Bangladesh",
    LK: "Sri Lanka",
    MV: "Maldives",
    NP: "Nepal",
    BT: "Bhutan",
    MM: "Myanmar",
    TH: "Thailand",
    LA: "Laos",
    KH: "Cambodia",
    VN: "Vietnam",
    MY: "Malaysia",
    SG: "Singapore",
    BN: "Brunei",
    ID: "Indonesia",
    PH: "Philippines",
    TL: "East Timor",
    MN: "Mongolia",
    KP: "North Korea",
    TW: "Taiwan",
    HK: "Hong Kong",
    MO: "Macau",
    SA: "Saudi Arabia",
    AE: "United Arab Emirates",
    QA: "Qatar",
    KW: "Kuwait",
    BH: "Bahrain",
    OM: "Oman",
    YE: "Yemen",
    IQ: "Iraq",
    IR: "Iran",
    SY: "Syria",
    LB: "Lebanon",
    JO: "Jordan",
    IL: "Israel",
    PS: "Palestine",
    TR: "Turkey",
    EG: "Egypt",
    LY: "Libya",
    TN: "Tunisia",
    DZ: "Algeria",
    MA: "Morocco",
    SD: "Sudan",
    SS: "South Sudan",
    ET: "Ethiopia",
    ER: "Eritrea",
    DJ: "Djibouti",
    SO: "Somalia",
    KE: "Kenya",
    UG: "Uganda",
    TZ: "Tanzania",
    RW: "Rwanda",
    BI: "Burundi",
    MW: "Malawi",
    ZM: "Zambia",
    ZW: "Zimbabwe",
    BW: "Botswana",
    NA: "Namibia",
    ZA: "South Africa",
    LS: "Lesotho",
    SZ: "Eswatini",
    MG: "Madagascar",
    MU: "Mauritius",
    SC: "Seychelles",
    KM: "Comoros",
    MZ: "Mozambique",
    AO: "Angola",
    CD: "Democratic Republic of the Congo",
    CG: "Republic of the Congo",
    CF: "Central African Republic",
    TD: "Chad",
    CM: "Cameroon",
    NG: "Nigeria",
    NE: "Niger",
    ML: "Mali",
    BF: "Burkina Faso",
    CI: "Ivory Coast",
    GH: "Ghana",
    TG: "Togo",
    BJ: "Benin",
    SN: "Senegal",
    GM: "Gambia",
    GW: "Guinea-Bissau",
    GN: "Guinea",
    SL: "Sierra Leone",
    LR: "Liberia",
    MR: "Mauritania",
    CV: "Cape Verde",
    ST: "São Tomé and Príncipe",
    GQ: "Equatorial Guinea",
    GA: "Gabon",
    AR: "Argentina",
    BO: "Bolivia",
    CL: "Chile",
    CO: "Colombia",
    EC: "Ecuador",
    FK: "Falkland Islands",
    GF: "French Guiana",
    GY: "Guyana",
    PY: "Paraguay",
    PE: "Peru",
    SR: "Suriname",
    UY: "Uruguay",
    VE: "Venezuela",
    CU: "Cuba",
    JM: "Jamaica",
    HT: "Haiti",
    DO: "Dominican Republic",
    PR: "Puerto Rico",
    TT: "Trinidad and Tobago",
    BB: "Barbados",
    LC: "Saint Lucia",
    VC: "Saint Vincent and the Grenadines",
    GD: "Grenada",
    AG: "Antigua and Barbuda",
    KN: "Saint Kitts and Nevis",
    DM: "Dominica",
    BS: "Bahamas",
    BZ: "Belize",
    GT: "Guatemala",
    SV: "El Salvador",
    HN: "Honduras",
    NI: "Nicaragua",
    CR: "Costa Rica",
    PA: "Panama",
    NZ: "New Zealand",
    FJ: "Fiji",
    PG: "Papua New Guinea",
    SB: "Solomon Islands",
    VU: "Vanuatu",
    NC: "New Caledonia",
    PF: "French Polynesia",
    WS: "Samoa",
    TO: "Tonga",
    KI: "Kiribati",
    TV: "Tuvalu",
    NR: "Nauru",
    PW: "Palau",
    FM: "Micronesia",
    MH: "Marshall Islands",
  };

  // Get country views by name (handles both country codes and names)
  const getCountryViews = (countryName: string): number => {
    // First try direct match
    let country = countryData.find((d) => d.country === countryName);

    // If not found, try to find by country code mapping
    if (!country) {
      const countryCode = Object.keys(countryCodeToName).find(
        (code) => countryCodeToName[code] === countryName
      );
      if (countryCode) {
        country = countryData.find((d) => d.country === countryCode);
      }
    }

    // If still not found, try reverse lookup (country code to name)
    if (!country) {
      const mappedName = countryCodeToName[countryName];
      if (mappedName) {
        country = countryData.find((d) => d.country === mappedName);
      }
    }

    return country ? country.views : 0;
  };

  // Get color based on view count using red gradient
  const getCountryColor = (countryName: string): string => {
    const views = getCountryViews(countryName);

    if (views === 0) return "#F3F4F6"; // Light gray for no views

    // Red gradient scale - varying intensity based on view count
    const intensity = views / maxViews;

    // Create smooth red gradient from light to intense (improved readability)
    if (intensity <= 0.1) return "#FCA5A5"; // Light-medium red (more distinguishable)
    if (intensity <= 0.2) return "#F87171"; // Medium red
    if (intensity <= 0.3) return "#EF4444"; // Medium-dark red
    if (intensity <= 0.4) return "#DC2626"; // Dark red
    if (intensity <= 0.5) return "#B91C1C"; // Darker red
    if (intensity <= 0.6) return "#991B1B"; // Very dark red
    if (intensity <= 0.7) return "#7F1D1D"; // Reduced darkness
    if (intensity <= 0.8) return "#7F1D1D"; // Same as previous for smoother transition
    if (intensity <= 0.9) return "#991B1B"; // Lighter than before
    return "#B91C1C"; // Much lighter darkest red for highest views (improved readability)
  };

  // World map topology: shipped with the app as a hashed same-origin asset, so no
  // third-party origin is contacted (the production CSP only allows 'self').
  const geoUrl = worldTopologyUrl;

  // Responsive map dimensions
  const mapDimensions = {
    width: chartConfig.chartHeight * 2, // Make map wider than tall
    height: chartConfig.chartHeight,
  };

  // Show loading state while resolving countries
  if (isResolvingCountries) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: `${chartConfig.chartHeight}px` }}
      >
        <div className="flex flex-col items-center gap-4">
          <div style={{ width: "40px", height: "40px", overflow: "visible" }}>
            <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="dt-subtext text-sm">
            Resolving country data...
          </p>
        </div>
      </div>
    );
  }

  // No data state
  if (countryData.length === 0) {
    const viewEvents = events.filter((e) => e.type === "view");
    const eventsWithCountry = events.filter(
      (e) => e.type === "view" && e.country
    );

    return (
      <div className="w-full">
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <EmptyState
            icon="map"
            message="No Geographic Data Available"
            description="Geographic data will appear once visitors interact with your content from different locations."
          />

          <div className="space-y-2 text-left mt-4">
            <div className="p-3 bg-dashboard-muted rounded-lg">
              <p className="dt-subtext text-sm">
                <strong>Analytics Summary:</strong>
              </p>
              <ul className="dt-subtext text-xs mt-1 space-y-1">
                <li>• {viewEvents.length} total view events</li>
                <li>• {eventsWithCountry.length} events with country data</li>
                <li>
                  • {viewEvents.length - eventsWithCountry.length} events
                  pending geolocation
                </li>
              </ul>
            </div>

            <p className="dt-subtext text-xs opacity-75">
              Geographic data will appear automatically once IP geolocation
              services are available.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Map Container */}
      <div
        ref={mapContainerRef}
        className="w-full bg-dashboard-muted/20 rounded-lg overflow-hidden relative"
        style={{
          height: `${chartConfig.chartHeight}px`,
          overflow: "hidden",
          position: "relative",
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <ComposableMap
          projection="geoMercator"
          width={mapDimensions.width}
          height={mapDimensions.height}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup>
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  // Try different property names for country name
                  const countryName =
                    geo.properties?.NAME ||
                    geo.properties?.name ||
                    geo.properties?.NAME_EN ||
                    geo.properties?.name_en ||
                    "Unknown";

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={getCountryColor(countryName)}
                      stroke="#374151"
                      strokeWidth={0.5}
                      style={{
                        default: {
                          fill: getCountryColor(countryName),
                          stroke: "#374151",
                          strokeWidth: 0.5,
                          outline: "none",
                        },
                        hover: {
                          fill: "#F59E0B", // Amber on hover
                          stroke: "#374151",
                          strokeWidth: 1,
                          outline: "none",
                        },
                        pressed: {
                          fill: "#D97706", // Darker amber when pressed
                          stroke: "#374151",
                          strokeWidth: 1,
                          outline: "none",
                        },
                      }}
                      onMouseEnter={() => setHoveredCountry(countryName)}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {/* Tooltip */}
        {hoveredCountry && mousePosition && (
          <div
            className="absolute z-10 dt-surface p-3 rounded-lg border border-dashboard shadow-dashboard-elevated pointer-events-none"
            style={{
              left: `${mousePosition.x}px`,
              top: `${mousePosition.y}px`,
              transform: "translate(-50%, -100%)",
              marginTop: "-10px",
              maxWidth: "200px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              // Ensure tooltip stays within container bounds
              ...(mousePosition.x < 100 && {
                transform: "translate(0, -100%)",
              }),
              ...(mousePosition.x >
                (mapContainerRef.current?.offsetWidth || 0) - 100 && {
                transform: "translate(-100%, -100%)",
              }),
              ...(mousePosition.y < 50 && {
                transform: "translate(-50%, 0)",
                marginTop: "10px",
              }),
            }}
          >
            <p className="dt-label mb-1">{hoveredCountry}</p>
            <p className="dt-subtext text-dashboard-accent">
              {getCountryViews(hoveredCountry)} views
            </p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="dt-subtext text-sm">Views:</span>
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: "#F3F4F6" }}
            ></div>
            <span className="dt-subtext text-xs">0</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: "#FCA5A5" }}
            ></div>
            <span className="dt-subtext text-xs">Low</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: "#F87171" }}
            ></div>
            <span className="dt-subtext text-xs">Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: "#DC2626" }}
            ></div>
            <span className="dt-subtext text-xs">High</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: "#B91C1C" }}
            ></div>
            <span className="dt-subtext text-xs">Highest</span>
          </div>
        </div>

        <div className="dt-subtext text-xs">
          {countryData.length} countries with views
        </div>
      </div>
    </div>
  );
};

export default WorldMapChart;
