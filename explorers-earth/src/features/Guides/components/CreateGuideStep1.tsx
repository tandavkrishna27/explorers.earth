import { useState, useEffect, useRef } from "react";
import { Reorder } from "framer-motion";
import AddressInput from "../../Profile/components/AddressInput";
import Button from "../../../components/ui/Button";
import DeleteIcon from "../../../assets/icons/DeleteIcon";
import EditIcon from "../../../assets/icons/EditIcon";
import VerticalKebab from "../../../assets/icons/VerticalKebab";

// Location mode type: single city or multi city
type LocationMode = "single" | "multi";

// Intermediate city interface
interface IntermediateCity {
  id: string;
  place: google.maps.places.PlaceResult | null;
  displayValue: string;
  hasDate?: boolean;
  date?: string; // ISO date string (YYYY-MM-DD)
}

interface CreateGuideStep1Props {
  initialGuideType?: string;
  initialLocation?: google.maps.places.PlaceResult | null;
  initialLocationDisplay?: string;
  // Multi-city initial values
  initialFromLocation?: google.maps.places.PlaceResult | null;
  initialFromLocationDisplay?: string;
  initialToLocation?: google.maps.places.PlaceResult | null;
  initialToLocationDisplay?: string;
  initialIntermediateCities?: IntermediateCity[];
  initialLocationMode?: LocationMode;
  onNext: (data: {
    guideType: string;
    // Single city payload (backward compatible)
    selectedPlace?: google.maps.places.PlaceResult;
    locationDisplayValue?: string;
    // Multi city payload
    fromLocation?: google.maps.places.PlaceResult;
    fromLocationDisplayValue?: string;
    toLocation?: google.maps.places.PlaceResult;
    toLocationDisplayValue?: string;
    intermediateCities?: IntermediateCity[];
    // Mode indicator
    locationMode: LocationMode;
  }) => void;
  onCancel: () => void;
}

const CreateGuideStep1: React.FC<CreateGuideStep1Props> = ({
  initialGuideType = "",
  initialLocation = null,
  initialLocationDisplay = "",
  initialFromLocation = null,
  initialFromLocationDisplay = "",
  initialToLocation = null,
  initialToLocationDisplay = "",
  initialIntermediateCities = [],
  initialLocationMode = "single",
  onNext,
  onCancel,
}) => {
  // Guide type state
  const [guideType, setGuideType] = useState(initialGuideType);
  
  // Location mode: single or multi city
  const [locationMode, setLocationMode] = useState<LocationMode>(initialLocationMode);
  
  // Single city location state (preserved for backward compatibility)
  const [selectedPlace, setSelectedPlace] =
    useState<google.maps.places.PlaceResult | null>(initialLocation);
  const [locationDisplayValue, setLocationDisplayValue] = useState(
    initialLocationDisplay
  );
  
  // Multi city location state
  const [fromPlace, setFromPlace] =
    useState<google.maps.places.PlaceResult | null>(initialFromLocation);
  const [fromLocationDisplayValue, setFromLocationDisplayValue] = useState(
    initialFromLocationDisplay
  );
  const [toPlace, setToPlace] =
    useState<google.maps.places.PlaceResult | null>(initialToLocation);
  const [toLocationDisplayValue, setToLocationDisplayValue] = useState(
    initialToLocationDisplay
  );
  
  // Intermediate cities state
  const [intermediateCities, setIntermediateCities] = useState<IntermediateCity[]>(
    initialIntermediateCities
  );
  
  // State for adding new intermediate city
  const [newIntermediateCityDisplay, setNewIntermediateCityDisplay] = useState("");
  const [editingCityId, setEditingCityId] = useState<string | null>(null);
  const [editingCityDisplay, setEditingCityDisplay] = useState("");

  // Kebab menu state for intermediate cities
  const [openKebabMenuId, setOpenKebabMenuId] = useState<string | null>(null);
  const kebabRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Error state
  const [error, setError] = useState("");

  const guideTypes = ["Itinerary", "Theme"];

  // Sync state with initial props
  useEffect(() => {
    setGuideType(initialGuideType);
    setLocationMode(initialLocationMode);
    setSelectedPlace(initialLocation);
    setLocationDisplayValue(initialLocationDisplay);
    setFromPlace(initialFromLocation);
    setFromLocationDisplayValue(initialFromLocationDisplay);
    setToPlace(initialToLocation);
    setToLocationDisplayValue(initialToLocationDisplay);
    setIntermediateCities(initialIntermediateCities);
  }, [
    initialGuideType,
    initialLocation,
    initialLocationDisplay,
    initialFromLocation,
    initialFromLocationDisplay,
    initialToLocation,
    initialToLocationDisplay,
    initialIntermediateCities,
    initialLocationMode,
  ]);

  // Click outside handler for kebab menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const clickedOutside = !Object.values(kebabRefs.current).some(
        (ref) => ref && ref.contains(event.target as Node)
      );

      if (clickedOutside && openKebabMenuId) {
        setOpenKebabMenuId(null);
      }
    };

    if (openKebabMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openKebabMenuId]);

  // Explicitly accept the entered label; no provider identity or coordinates are inferred.
  const useEnteredLocation = (value: string, select: (place: google.maps.places.PlaceResult) => void) => {
    const label = value.trim();
    if (!label || label.length > 500 || /[\u0000-\u001f\u007f]/.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) {
      setError("Enter a location of 1–500 characters without control characters");
      return;
    }
    select({ name: label, formatted_address: label });
  };

  // Single city location handler (preserves existing behavior)
  const handlePlaceSelect = (place: any) => {
    setSelectedPlace(place as google.maps.places.PlaceResult);
    setLocationDisplayValue(place.name || place.formatted_address || "");
    setError("");
  };

  // Multi city: from location handler
  const handleFromPlaceSelect = (place: any) => {
    setFromPlace(place as google.maps.places.PlaceResult);
    setFromLocationDisplayValue(place.name || place.formatted_address || "");
    setError("");
  };

  // Multi city: to location handler
  const handleToPlaceSelect = (place: any) => {
    setToPlace(place as google.maps.places.PlaceResult);
    setToLocationDisplayValue(place.name || place.formatted_address || "");
    setError("");
  };

  // Intermediate city handlers
  const handleAddIntermediateCity = (place: any) => {
    const newCity: IntermediateCity = {
      id: `intermediate-${Date.now()}-${Math.random()}`,
      place: place as google.maps.places.PlaceResult,
      displayValue: place.name || place.formatted_address || "",
    };
    setIntermediateCities([...intermediateCities, newCity]);
    setNewIntermediateCityDisplay("");
    setError("");
  };

  const handleRemoveIntermediateCity = (id: string) => {
    setIntermediateCities(intermediateCities.filter((city) => city.id !== id));
  };

  const handleEditIntermediateCity = (id: string) => {
    const city = intermediateCities.find((c) => c.id === id);
    if (city) {
      setEditingCityId(id);
      setEditingCityDisplay(city.displayValue);
    }
  };

  const handleUpdateIntermediateCity = (id: string, place: any) => {
    setIntermediateCities(
      intermediateCities.map((city) =>
        city.id === id
          ? {
              ...city,
              place: place as google.maps.places.PlaceResult,
              displayValue: place.name || place.formatted_address || "",
            }
          : city
      )
    );
    setEditingCityId(null);
    setEditingCityDisplay("");
    setError("");
  };

  const handleToggleDate = (id: string) => {
    setIntermediateCities(
      intermediateCities.map((city) =>
        city.id === id
          ? {
              ...city,
              hasDate: !city.hasDate,
              date: !city.hasDate ? new Date().toISOString().split('T')[0] : undefined,
            }
          : city
      )
    );
  };

  const handleDateChange = (id: string, date: string) => {
    setIntermediateCities(
      intermediateCities.map((city) =>
        city.id === id
          ? {
              ...city,
              date,
            }
          : city
      )
    );
  };

  const handleCancelEdit = () => {
    setEditingCityId(null);
    setEditingCityDisplay("");
  };

  // Handle tab change - preserve form state when switching tabs
  const handleTabChange = (mode: LocationMode) => {
    setLocationMode(mode);
    setError(""); // Clear errors when switching tabs
  };

  const handleNext = () => {
    setError("");

    if (locationMode === "multi" && (editingCityId || intermediateCities.some((city) => !city.place))) {
      setError("Select or use the entered location for each intermediate city");
      return;
    }

    // Validate guide type (required for both modes)
    if (!guideType) {
      setError("Please select a guide type");
      return;
    }

    // Validate location based on selected mode
    if (locationMode === "single") {
      // Single city validation (existing behavior)
      if (!selectedPlace) {
        setError("Please select a location for this guide");
        return;
      }

      // Single city payload (backward compatible)
      onNext({
        guideType,
        selectedPlace,
        locationDisplayValue,
        locationMode: "single",
      });
    } else {
      // Multi city validation - check in UI order: Starting first, then Ending
      if (!fromPlace) {
        setError("Please select a starting point");
        return;
      }
      if (!toPlace) {
        setError("Please select an ending point");
        return;
      }

      // Multi city payload
      onNext({
        guideType,
        fromLocation: fromPlace,
        fromLocationDisplayValue,
        toLocation: toPlace,
        toLocationDisplayValue,
        intermediateCities,
        locationMode: "multi",
      });
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-0">
      <div className="bg-dashboard-sidebar p-4 md:p-6 rounded-lg shadow-dashboard-elevated border border-dashboard-muted">
        {/* Step Indicator */}
        <div className="mb-4 md:mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-dashboard-accent flex items-center justify-center text-white text-sm font-semibold">
                1
              </div>
              <span className="text-dashboard font-poppins font-semibold text-sm md:text-base">
                Getting Started
              </span>
            </div>
            <span className="text-dashboard-accent text-xs md:text-sm font-poppins font-medium">
              Step 1 of {guideType === "Itinerary" ? "3" : "2"}
            </span>
          </div>
          <div className="w-full h-1.5 md:h-2 bg-dashboard-bg rounded-full overflow-hidden">
            <div className={`h-full bg-gradient-to-r from-dashboard-accent to-dashboard-secondary transition-all duration-500 ease-out ${guideType === "Itinerary" ? "w-1/3" : "w-1/2"}`}></div>
          </div>
        </div>

        <div className="space-y-4 md:space-y-5">
          {/* Location Mode Tabs */}
          <div className="group">
            {/* Tab UI */}
            <div className="flex items-center gap-2 bg-dashboard-bg p-1 rounded-xl border-2 border-dashboard">
              <button
                type="button"
                onClick={() => handleTabChange("single")}
                className={`flex-1 px-4 py-2.5 rounded-lg font-poppins text-sm md:text-base font-medium transition-all duration-200 ${
                  locationMode === "single"
                    ? "bg-dashboard-accent text-white shadow-md"
                    : "text-dashboard-light hover:text-dashboard hover:bg-dashboard-sidebar"
                }`}
              >
                Single City
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("multi")}
                className={`flex-1 px-4 py-2.5 rounded-lg font-poppins text-sm md:text-base font-medium transition-all duration-200 ${
                  locationMode === "multi"
                    ? "bg-dashboard-accent text-white shadow-md"
                    : "text-dashboard-light hover:text-dashboard hover:bg-dashboard-sidebar"
                }`}
              >
                Multi City
              </button>
            </div>
          </div>

          {/* Guide Type Selection */}
          <div className="group">
            <label className="text-dashboard font-semibold mb-2 font-poppins text-sm md:text-base flex items-center gap-1">
              <svg className="w-4 h-4 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Guide Type <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full px-4 py-3 md:py-2.5 bg-dashboard-sidebar border-2 border-dashboard rounded-xl text-dashboard placeholder-dashboard-light focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:border-transparent transition-all duration-200 text-base hover:border-dashboard-accent/50"
              value={guideType}
              onChange={(e) => {
                setGuideType(e.target.value);
                setError("");
              }}
            >
              <option value="">Select type</option>
              {guideTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Location Selection - Conditional Rendering Based on Tab */}
          {locationMode === "single" ? (
            /* Single City Location Field (Default - Preserves Existing Behavior) */
            <div className="group">
              <label className="text-dashboard font-semibold mb-2 font-poppins text-sm md:text-base flex items-center gap-1">
                <svg className="w-4 h-4 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Location <span className="text-red-500">*</span>
              </label>
              <AddressInput
                value={locationDisplayValue}
                onChange={(value, origin) => {
                  setLocationDisplayValue(value);
                  if (origin !== "selection") setSelectedPlace(null);
                  setError("");
                }}
                setPlaces={handlePlaceSelect}
                label="Location"
                placeHolder="Search for a location"
                className="w-full"
              />
              <button
                type="button"
                onClick={() => useEnteredLocation(locationDisplayValue, handlePlaceSelect)}
                className="mt-2 text-sm font-poppins text-dashboard-accent hover:underline"
              >
                Use entered location
              </button>
            </div>
          ) : (
            /* Multi City Location Fields */
            <div className="space-y-4">
              {/* Starting Point */}
              <div className="group">
                <label className="text-dashboard font-semibold mb-2 font-poppins text-sm md:text-base flex items-center gap-1">
                  <svg className="w-4 h-4 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Starting Point <span className="text-red-500">*</span>
                </label>
                <AddressInput
                  value={fromLocationDisplayValue}
                  onChange={(value, origin) => {
                    setFromLocationDisplayValue(value);
                    if (origin !== "selection") setFromPlace(null);
                    setError("");
                  }}
                  setPlaces={handleFromPlaceSelect}
                  label=""
                  placeHolder="Search for starting location"
                  className="w-full"
                />
              <button
                type="button"
                onClick={() => useEnteredLocation(fromLocationDisplayValue, handleFromPlaceSelect)}
                className="mt-2 text-sm font-poppins text-dashboard-accent hover:underline"
              >
                Use entered location
              </button>
              </div>

              {/* Ending Point */}
              <div className="group">
                <label className="text-dashboard font-semibold mb-2 font-poppins text-sm md:text-base flex items-center gap-1">
                  <svg className="w-4 h-4 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Ending Point <span className="text-red-500">*</span>
                </label>
                <AddressInput
                  value={toLocationDisplayValue}
                  onChange={(value, origin) => {
                    setToLocationDisplayValue(value);
                    if (origin !== "selection") setToPlace(null);
                    setError("");
                  }}
                  setPlaces={handleToPlaceSelect}
                  label=""
                  placeHolder="Search for destination location"
                  className="w-full"
                />
              <button
                type="button"
                onClick={() => useEnteredLocation(toLocationDisplayValue, handleToPlaceSelect)}
                className="mt-2 text-sm font-poppins text-dashboard-accent hover:underline"
              >
                Use entered location
              </button>
              </div>

              {/* Intermediate Cities Section */}
              <div className="group">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-dashboard font-semibold font-poppins text-sm md:text-base flex items-center gap-1">
                  <svg className="w-4 h-4 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    Intermediate Cities
                  </label>
                  <span className="text-xs text-white font-poppins">
                    Multiple stops along your journey
                  </span>
                </div>

                {/* Journey Flow Visualization */}
                {intermediateCities.length > 0 && (
                  <div className="mb-4 p-3 bg-dashboard-bg/30 rounded-lg border border-dashboard-muted/30">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <div className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-poppins font-semibold">
                          Start
                        </div>
                        <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </div>
                      {intermediateCities.map((city, index) => (
                        <div key={city.id} className="flex items-center gap-1.5">
                          <div className="px-2 py-1 bg-dashboard-accent/20 text-dashboard-accent rounded text-xs font-poppins font-semibold">
                            {index + 1}
                          </div>
                          <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </div>
                      ))}
                      <div className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-poppins font-semibold">
                        End
                      </div>
                    </div>
                  </div>
                )}

                {/* Intermediate Cities List */}
                {intermediateCities.length > 0 && (
                  <Reorder.Group
                    axis="y"
                    values={intermediateCities}
                    onReorder={setIntermediateCities}
                    className="space-y-2 mb-4"
                  >
                    {intermediateCities.map((city, index) => (
                      <Reorder.Item
                        key={city.id}
                        value={city}
                        className="relative"
                      >
                        <div className="flex items-center gap-3 p-3 bg-dashboard-bg rounded-lg border border-dashboard-muted/50 hover:border-dashboard-accent/50 transition-all">
                          {/* Drag Handle */}
                          <div className="flex-shrink-0 cursor-grab active:cursor-grabbing text-white/60 hover:text-white transition-colors">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              fill="currentColor"
                            >
                              <circle cx="5" cy="4" r="1.5" />
                              <circle cx="11" cy="4" r="1.5" />
                              <circle cx="5" cy="8" r="1.5" />
                              <circle cx="11" cy="8" r="1.5" />
                              <circle cx="5" cy="12" r="1.5" />
                              <circle cx="11" cy="12" r="1.5" />
                            </svg>
                          </div>

                          {/* City Number */}
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-dashboard-accent text-white flex items-center justify-center text-xs font-poppins font-bold">
                            {index + 1}
                          </div>

                          {/* City Info */}
                          {editingCityId === city.id ? (
                            <div className="flex-1 flex items-center gap-2">
                              <AddressInput
                                value={editingCityDisplay}
                                onChange={(value, origin) => {
                                  setEditingCityDisplay(value);
                                  if (origin !== "selection") setIntermediateCities(intermediateCities.map((entry) => entry.id === city.id ? {...entry, place: null, displayValue: value} : entry));
                                }}
                                setPlaces={(place) => handleUpdateIntermediateCity(city.id, place)}
                                label={`City ${index + 1}`}
                                placeHolder="Search for city"
                                className="flex-1"
                              />
              <button
                type="button"
                onClick={() => useEnteredLocation(editingCityDisplay, (place) => handleUpdateIntermediateCity(city.id, place))}
                className="mt-2 text-sm font-poppins text-dashboard-accent hover:underline"
              >
                Use entered location
              </button>
                              <button
                                type="button"
                                onClick={handleCancelEdit}
                                className="px-3 py-1.5 text-xs font-poppins text-dashboard-light hover:text-dashboard rounded-lg hover:bg-dashboard-bg transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1 min-w-0">
                                <p className="text-dashboard font-poppins font-medium text-sm truncate">
                                  {city.displayValue}
                                </p>
                                {/* Date Section */}
                                <div className="mt-2 flex items-center gap-3">
                                  <label className="flex items-center gap-2 cursor-pointer group">
                                    <div className="relative">
                                      <input
                                        type="checkbox"
                                        checked={city.hasDate || false}
                                        onChange={() => handleToggleDate(city.id)}
                                        className="sr-only"
                                      />
                                      <div
                                        className={`w-4 h-4 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                                          city.hasDate
                                            ? "bg-dashboard-accent border-dashboard-accent"
                                            : "bg-dashboard-muted border-dashboard-light/40 group-hover:border-dashboard-accent/60"
                                        }`}
                                      >
                                        {city.hasDate && (
                                          <svg
                                            className="w-3 h-3 text-white"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={3}
                                              d="M5 13l4 4L19 7"
                                            />
                  </svg>
                                        )}
                                      </div>
                                    </div>
                                    <span className="text-xs text-white font-poppins">
                                      Set date
                                    </span>
                </label>
                                  {city.hasDate && (
                                    <input
                                      type="date"
                                      value={city.date || ""}
                                      onChange={(e) => handleDateChange(city.id, e.target.value)}
                                      className="px-2 py-1 text-xs bg-dashboard-muted border border-dashboard rounded text-white font-poppins focus:outline-none focus:ring-2 focus:ring-dashboard-accent"
                                      min={new Date().toISOString().split('T')[0]}
                                    />
                                  )}
                                </div>
                              </div>
                              {/* Kebab Menu Container */}
                              <div
                                ref={(el) =>
                                  (kebabRefs.current[`city-${city.id}`] = el)
                                }
                                className="relative"
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenKebabMenuId(
                                      openKebabMenuId === city.id ? null : city.id
                                    );
                                  }}
                                  className="flex-shrink-0 p-1.5 rounded-lg hover:bg-dashboard-muted transition-all"
                                  aria-label="City options"
                                >
                                  <VerticalKebab size="4" />
                                </button>
                                {openKebabMenuId === city.id && (
                                  <div className="absolute right-0 top-full mt-1 bg-dashboard-sidebar shadow-dashboard-elevated rounded-md border border-dashboard z-50 min-w-[140px]">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditIntermediateCity(city.id);
                                        setOpenKebabMenuId(null);
                                      }}
                                      className="flex items-center gap-2 w-full text-dashboard hover:bg-dashboard-muted px-3 py-2 transition-colors text-sm font-poppins"
                                      title="Edit"
                                    >
                                      <EditIcon />
                                      <span>Edit</span>
                                    </button>
                                    <div className="h-px bg-dashboard-muted"></div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveIntermediateCity(city.id);
                                        setOpenKebabMenuId(null);
                                      }}
                                      className="flex items-center gap-2 w-full text-red-400 hover:bg-dashboard-muted px-3 py-2 transition-colors text-sm font-poppins"
                                      title="Delete"
                                    >
                                      <DeleteIcon stroke="currentColor" />
                                      <span>Delete</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>
                )}

                {/* Add New Intermediate City */}
                <div className="border-2 border-dashed border-dashboard-muted/50 rounded-lg p-3 hover:border-dashboard-accent/50 transition-colors">
                <AddressInput
                    key={`intermediate-city-input-${intermediateCities.length}`}
                    value={newIntermediateCityDisplay}
                  onChange={(value) => {
                      setNewIntermediateCityDisplay(value);
                    setError("");
                  }}
                    setPlaces={(place) => {
                      handleAddIntermediateCity(place);
                      // Clear the input field after adding
                      setTimeout(() => {
                        setNewIntermediateCityDisplay("");
                      }, 0);
                    }}
                    label="Add Intermediate City"
                    placeHolder="Search for a city to add to your journey"
                  className="w-full"
                />
              <button
                type="button"
                onClick={() => useEnteredLocation(newIntermediateCityDisplay, handleAddIntermediateCity)}
                className="mt-2 text-sm font-poppins text-dashboard-accent hover:underline"
              >
                Use entered location
              </button>
                  <p className="text-xs text-white font-poppins mt-2">
                    Add cities you'll visit between starting and ending points
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border-l-4 border-red-500 text-red-500 px-4 py-3 rounded-lg text-sm font-poppins flex items-start gap-2 animate-in slide-in-from-top-2 duration-300">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col-reverse md:flex-row gap-3 md:gap-3 justify-end pt-5 border-t-2 border-dashboard-muted/50">
            <Button
              type="button"
              variant="ghost"
              btnText="Cancel"
              onClickHandler={onCancel}
            />
            <Button
              type="button"
              variant="primary"
              btnText="Next"
              onClickHandler={handleNext}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateGuideStep1;
