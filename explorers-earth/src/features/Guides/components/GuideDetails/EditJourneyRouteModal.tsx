/**
 * EditJourneyRouteModal Component
 * Modal for editing multi-city journey route (starting point, intermediate cities, ending point)
 */

import React, { useState, useEffect, useRef } from "react";
import {useGuideEditing} from '../../context/GuideEditingProvider';
import { motion, AnimatePresence } from "framer-motion";
import { Reorder } from "framer-motion";
import { toast } from "sonner";
import AddressInput from "../../../Profile/components/AddressInput";
import Button from "../../../../components/ui/Button";
import DeleteIcon from "../../../../assets/icons/DeleteIcon";
import EditIcon from "../../../../assets/icons/EditIcon";
import VerticalKebab from "../../../../assets/icons/VerticalKebab";
import type { Guide } from "../../types";

interface IntermediateCity {
  id: string;
  place: google.maps.places.PlaceResult | null;
  displayValue: string;
  hasDate?: boolean;
  date?: string;
}

interface EditJourneyRouteModalProps {
  guide: Guide;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const EditJourneyRouteModal: React.FC<EditJourneyRouteModalProps> = ({
  guide,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [arrivalPlace, setArrivalPlace] = useState<google.maps.places.PlaceResult | null>(null);
  const [arrivalDisplay, setArrivalDisplay] = useState("");
  const [departurePlace, setDeparturePlace] = useState<google.maps.places.PlaceResult | null>(null);
  const [departureDisplay, setDepartureDisplay] = useState("");
  const [intermediateCities, setIntermediateCities] = useState<IntermediateCity[]>([]);
  const [newIntermediateCityDisplay, setNewIntermediateCityDisplay] = useState("");
  const [editingCityId, setEditingCityId] = useState<string | null>(null);
  const [editingCityDisplay, setEditingCityDisplay] = useState("");
  const [openKebabMenuId, setOpenKebabMenuId] = useState<string | null>(null);
  const kebabRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const {saveDetails} = useGuideEditing();
  const [loading, setLoading] = useState(false);

  // Initialize form data from guide
  useEffect(() => {
    if (isOpen && guide.Place_Details) {
      try {
        let placeDetails: any = guide.Place_Details;
        if (typeof guide.Place_Details === "string") {
          placeDetails = JSON.parse(guide.Place_Details);
        }

        if (placeDetails?.isMultiCity === true) {
          // Ending Point - support new (ending) and legacy (arrival, to) keys
          const ending = placeDetails.ending || placeDetails.arrival || placeDetails.to;
          if (ending) {
            const endingPlaceObj: google.maps.places.PlaceResult = {
              name: ending.Place_Name,
              formatted_address: ending.Place_Address,
              place_id: ending.Place_Id,
              ...(ending.Geometry == null ? {} : {geometry: {
                location: {
                  lat: () => ending.Geometry.lat,
                  lng: () => ending.Geometry.lng,
                } as google.maps.LatLng,
              } as google.maps.places.PlaceGeometry}),
            } as google.maps.places.PlaceResult;
            setArrivalPlace(endingPlaceObj);
            setArrivalDisplay(ending.Place_Name || ending.Place_Address || "");
          }

          // Starting Point - support new (starting) and legacy (departure, from) keys
          const starting = placeDetails.starting || placeDetails.departure || placeDetails.from;
          if (starting) {
            const startingPlaceObj: google.maps.places.PlaceResult = {
              name: starting.Place_Name,
              formatted_address: starting.Place_Address,
              place_id: starting.Place_Id,
              ...(starting.Geometry == null ? {} : {geometry: {
                location: {
                  lat: () => starting.Geometry.lat,
                  lng: () => starting.Geometry.lng,
                } as google.maps.LatLng,
              } as google.maps.places.PlaceGeometry}),
            } as google.maps.places.PlaceResult;
            setDeparturePlace(startingPlaceObj);
            setDepartureDisplay(starting.Place_Name || starting.Place_Address || "");
          }

          // Intermediate Cities
          const cities = (placeDetails.intermediateCities || []).map((city: any, index: number) => ({
            id: city.id || `intermediate-${index}`,
            place: {
              name: city.Place_Name,
              formatted_address: city.Place_Address,
              place_id: city.Place_Id,
              ...(city.Geometry == null ? {} : {geometry: {
                location: {
                  lat: () => city.Geometry.lat,
                  lng: () => city.Geometry.lng,
                } as google.maps.LatLng,
              } as google.maps.places.PlaceGeometry}),
            } as google.maps.places.PlaceResult,
            displayValue: city.Place_Name || city.Place_Address || "",
            hasDate: city.hasDate || false,
            date: city.date || undefined,
          }));
          setIntermediateCities(cities);
        }
      } catch (error) {
        console.error("Error parsing Place_Details:", error);
        toast.error("Failed to load journey route data");
      }
    }
  }, [isOpen, guide]);

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

  const formatPlaceDetails = (place: google.maps.places.PlaceResult) => {
    return {
      Place_Id: place.place_id || "",
      Place_Name: place.name || "",
      Place_Address: place.formatted_address || "",
      Geometry: place.geometry?.location ? {
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      } : null,
    };
  };

  const handleArrivalSelect = (place: any) => {
    setArrivalPlace(place as google.maps.places.PlaceResult);
    setArrivalDisplay(place.name || place.formatted_address || "");
  };

  const handleDepartureSelect = (place: any) => {
    setDeparturePlace(place as google.maps.places.PlaceResult);
    setDepartureDisplay(place.name || place.formatted_address || "");
  };

  const handleAddIntermediateCity = (place: any) => {
    const newCity: IntermediateCity = {
      id: `intermediate-${Date.now()}-${Math.random()}`,
      place: place as google.maps.places.PlaceResult,
      displayValue: place.name || place.formatted_address || "",
    };
    setIntermediateCities([...intermediateCities, newCity]);
    setTimeout(() => {
      setNewIntermediateCityDisplay("");
    }, 100);
  };

  const handleRemoveIntermediateCity = (id: string) => {
    setIntermediateCities(intermediateCities.filter((city) => city.id !== id));
    setOpenKebabMenuId(null);
  };

  const handleEditIntermediateCity = (id: string) => {
    const city = intermediateCities.find((c) => c.id === id);
    if (city) {
      setEditingCityId(id);
      setEditingCityDisplay(city.displayValue);
    }
    setOpenKebabMenuId(null);
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
  };

  const handleCancelEdit = () => {
    setEditingCityId(null);
    setEditingCityDisplay("");
  };

  const handleToggleDate = (id: string) => {
    setIntermediateCities(
      intermediateCities.map((city) =>
        city.id === id
          ? {
            ...city,
            hasDate: !city.hasDate,
            date: !city.hasDate ? new Date().toISOString().split("T")[0] : undefined,
          }
          : city
      )
    );
  };

  const handleDateChange = (id: string, date: string) => {
    setIntermediateCities(
      intermediateCities.map((city) =>
        city.id === id ? { ...city, date } : city
      )
    );
  };

  const handleSubmit = async () => {
    if (!arrivalPlace || !departurePlace) {
      toast.error("Please select both starting and ending points");
      return;
    }

    try {
      const placeDetails = {
        ending: formatPlaceDetails(arrivalPlace),
        starting: formatPlaceDetails(departurePlace),
        intermediateCities: intermediateCities
          .filter((city) => city.place)
          .map((city) => ({
            id: city.id,
            ...formatPlaceDetails(city.place!),
            hasDate: city.hasDate || false,
            date: city.date || undefined,
          })),
        isMultiCity: true,
      };

      // The route is the guide's place for a multi-city guide, stored in the shape the
      // journey display reads. Reducing it to a single point would drop the route.
      setLoading(true);
      await saveDetails({
        place: {...placeDetails, isMultiCity: true as const},
        multiCity: true,
      });

      toast.success("Journey route updated successfully!");
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Error updating journey route:", error);
      toast.error("Failed to update journey route");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal centering wrapper */}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-2 sm:px-4 md:px-12 lg:px-[15%] xl:px-[20%] pointer-events-none"
          >
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full max-h-[85vh] overflow-hidden pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="max-h-[85vh] bg-dashboard-bg rounded-2xl shadow-2xl border-2 border-white overflow-y-auto scrollbar-hide">
                {/* Header */}
                <div className="sticky top-0 bg-dashboard-bg/95 backdrop-blur-sm border-b border-dashboard-muted px-4 sm:px-6 py-4 z-10">
                  <div className="flex items-center justify-between">
                    <h2 className="text-dashboard text-xl sm:text-2xl font-poppins font-bold">
                      Edit Journey Route
                    </h2>
                    <button
                      onClick={onClose}
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-dashboard-bg hover:bg-dashboard-muted text-dashboard-light hover:text-dashboard transition-all duration-200"
                      aria-label="Close modal"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 sm:p-6 space-y-6">
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
                      value={departureDisplay}
                      onChange={(value) => setDepartureDisplay(value)}
                      setPlaces={handleDepartureSelect}
                      label="Starting Point"
                      placeHolder="Search for starting point"
                      className="w-full"
                    />
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
                      value={arrivalDisplay}
                      onChange={(value) => setArrivalDisplay(value)}
                      setPlaces={handleArrivalSelect}
                      label="Ending Point"
                      placeHolder="Search for ending point"
                      className="w-full"
                    />
                  </div>

                  {/* Intermediate Cities */}
                  <div className="group">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-dashboard font-semibold font-poppins text-sm md:text-base flex items-center gap-1">
                        <svg className="w-4 h-4 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                        Multiple stops along your journey
                      </label>
                    </div>

                    {/* Journey Flow Visualization */}
                    {intermediateCities.length > 0 && (
                      <div className="mb-4 p-3 bg-dashboard-bg/30 rounded-lg border border-dashboard-muted/30">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <div className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-poppins font-semibold whitespace-nowrap">
                              Start
                            </div>
                            <svg className="w-4 h-4 text-white/60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                          </div>
                          {intermediateCities.map((city, index) => (
                            <div key={city.id} className="flex items-center gap-1.5 flex-shrink-0">
                              <div className="px-2 py-1 bg-dashboard-accent/20 text-dashboard-accent rounded text-xs font-poppins font-semibold whitespace-nowrap">
                                {index + 1}
                              </div>
                              <svg className="w-4 h-4 text-white/60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                              </svg>
                            </div>
                          ))}
                          <div className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-poppins font-semibold whitespace-nowrap flex-shrink-0">
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
                            <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-dashboard-bg rounded-lg border border-dashboard-muted/50 hover:border-dashboard-accent/50 transition-all">
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
                                    onChange={(value) => setEditingCityDisplay(value)}
                                    setPlaces={(place) => handleUpdateIntermediateCity(city.id, place)}
                                    label={`City ${index + 1}`}
                                    placeHolder="Search for city"
                                    className="flex-1"
                                  />
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
                                  <div className="flex-1 min-w-0 pr-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="text-dashboard font-poppins font-medium text-sm truncate flex-1 min-w-0">
                                        {city.displayValue}
                                      </p>
                                      {/* Date Input - Show inline when date is enabled */}
                                      {city.hasDate && (
                                        <input
                                          type="date"
                                          value={city.date || ""}
                                          onChange={(e) => handleDateChange(city.id, e.target.value)}
                                          onClick={(e) => e.stopPropagation()}
                                          className="px-2 py-1 text-xs font-poppins rounded border border-dashboard-muted bg-dashboard-bg text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent w-auto min-w-[140px] sm:min-w-[160px] flex-shrink-0"
                                        />
                                      )}
                                    </div>
                                    {city.hasDate && city.date && (
                                      <p className="text-xs text-dashboard-light mt-1 truncate">
                                        {new Date(city.date).toLocaleDateString("en-US", {
                                          month: "short",
                                          day: "numeric",
                                          year: "numeric",
                                        })}
                                      </p>
                                    )}
                                  </div>

                                  {/* Kebab Menu */}
                                  <div className="relative flex-shrink-0" ref={(el) => (kebabRefs.current[city.id] = el)}>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenKebabMenuId(openKebabMenuId === city.id ? null : city.id);
                                      }}
                                      className="p-1.5 hover:bg-dashboard-muted rounded transition-colors"
                                    >
                                      <VerticalKebab />
                                    </button>
                                    {openKebabMenuId === city.id && (
                                      <div className="absolute right-0 top-full mt-1 bg-dashboard-bg border border-dashboard-muted rounded-lg shadow-lg z-10 min-w-[150px]">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditIntermediateCity(city.id);
                                          }}
                                          className="w-full px-4 py-2 text-left text-sm text-dashboard hover:bg-dashboard-muted flex items-center gap-2 transition-colors whitespace-nowrap"
                                        >
                                          <EditIcon color="currentColor" />
                                          <span>Edit</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleDate(city.id);
                                            setOpenKebabMenuId(null);
                                          }}
                                          className="w-full px-4 py-2 text-left text-sm text-dashboard hover:bg-dashboard-muted flex items-center gap-2 transition-colors whitespace-nowrap"
                                        >
                                          <svg
                                            className="w-4 h-4 flex-shrink-0"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                            />
                                          </svg>
                                          <span className="whitespace-nowrap">{city.hasDate ? "Remove date" : "Set date"}</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveIntermediateCity(city.id);
                                          }}
                                          className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-dashboard-muted flex items-center gap-2 transition-colors whitespace-nowrap"
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

                    {/* Add Intermediate City */}
                    <div className="mb-4">
                      <AddressInput
                        key={`add-city-${intermediateCities.length}`}
                        value={newIntermediateCityDisplay}
                        onChange={(value) => setNewIntermediateCityDisplay(value)}
                        setPlaces={handleAddIntermediateCity}
                        label="Add Intermediate City"
                        placeHolder="Search for a city to add"
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-dashboard-muted">
                    <Button
                      onClickHandler={onClose}
                      variant="secondary"
                      className="px-6"
                      btnText="Cancel"
                    />
                    <Button
                      onClickHandler={handleSubmit}
                      variant="primary"
                      className="px-6"
                      disabled={loading}
                      btnText={loading ? "Saving..." : "Save Changes"}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default EditJourneyRouteModal;

