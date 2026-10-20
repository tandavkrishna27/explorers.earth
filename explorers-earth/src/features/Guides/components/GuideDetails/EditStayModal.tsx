/**
 * EditStayModal Component
 * Modal for editing a single stay/accommodation from the Stay tab
 * 
 * SINGLE SOURCE OF TRUTH ENFORCEMENT:
 * When a stay is edited, this component updates ALL related fields to maintain perfect sync:
 * 
 * 1. Stay Field: Updates the accommodation in the Stay.accommodations array (matched by id)
 * 2. Timeline Field: Updates all occurrences in morning/afternoon/evening arrays (matched by id)
 * 3. Budget Field: Updates budget entries in corresponding periods (matched by localId)
 * 
 * This ensures that:
 * - Editing from Stay tab updates Timeline tab (and vice versa)
 * - All views reflect the most recent data
 * - No duplicate or stale data exists
 * - ID-based matching ensures correct object updates everywhere
 */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {useGuideEditing} from '../../context/GuideEditingProvider';
import { toast } from "sonner";
import AddressInput from "../../../Profile/components/AddressInput";
import Button from "../../../../components/ui/Button";
import { DayPlace, StayData, TimelineData, BudgetData, BudgetPlace } from "../../types/guideSectionTypes";
import { parseStay, parseTimeline, parseBudget } from "../../utils/guideDataParser";
import StayIcon from "../../../../assets/icons/StayIcon";
import DialogPanel from "../../../../components/ui/DialogPanel";

interface EditStayModalProps {
  isOpen: boolean;
  onClose: () => void;
  stay: DayPlace;
  sectionId: string;
  sectionTitle: string;
  onSuccess?: () => void;
}

const EditStayModal: React.FC<EditStayModalProps> = ({
  isOpen,
  onClose,
  stay,
  sectionId,
  sectionTitle,
  onSuccess,
}) => {
  const [stayPlace, setStayPlace] = useState<google.maps.places.PlaceResult | null>(null);
  const [stayDisplay, setStayDisplay] = useState("");
  const [loading, setLoading] = useState(false);
  const {getSection, saveSection} = useGuideEditing();


  // Initialize form with current stay data
  useEffect(() => {
    if (isOpen && stay) {
      // Convert DayPlace to PlaceResult format for AddressInput
      const placeObj: google.maps.places.PlaceResult = {
        name: stay.name,
        formatted_address: stay.formatted_address,
        place_id: stay.place_id,
        geometry: stay.geometry
          ? ({
              location: {
                lat: () => stay.geometry!.location.lat,
                lng: () => stay.geometry!.location.lng,
              } as google.maps.LatLng,
            } as google.maps.places.PlaceGeometry)
          : undefined,
        types: stay.types || [],
      } as google.maps.places.PlaceResult;

      setStayPlace(placeObj);
      setStayDisplay(stay.name || stay.formatted_address || "");
    }
  }, [isOpen, stay]);

  const handlePlaceSelect = (place: google.maps.places.PlaceResult) => {
    if (!place || !place.geometry) {
      toast.error("Please select a valid place");
      return;
    }

    setStayPlace(place);
    setStayDisplay(place.name || place.formatted_address || "");
  };

  // Wrapper to convert Google Maps PlaceResult to Places interface format
  const handlePlaceSelectFromInput = (place: any) => {
    // Convert to google.maps.places.PlaceResult format
    const placeResult: google.maps.places.PlaceResult = {
      ...place,
      geometry: place.geometry ? {
        location: {
          lat: typeof place.geometry.location.lat === "function" 
            ? place.geometry.location.lat 
            : () => place.geometry.location.lat,
          lng: typeof place.geometry.location.lng === "function"
            ? place.geometry.location.lng
            : () => place.geometry.location.lng,
        } as any,
      } : undefined,
    };
    handlePlaceSelect(placeResult);
  };

  const handleSubmit = async () => {
    if (!stayPlace || !stayPlace.geometry) {
      toast.error("Please select a valid accommodation");
      return;
    }

    setLoading(true);

    try {
      // No re-fetch: the page holds every section at one revision, and the blocks arrive
      // parsed rather than as JSON strings.
      const section = getSection(sectionId);
      if (!section) {
        throw new Error("Section not found");
      }

      // Create updated DayPlace from selected place
      const location = stayPlace.geometry?.location;
      
      if (!location) {
        toast.error("Selected place has no location data");
        return;
      }
      
      const updatedStay: DayPlace = {
        ...stay, // Keep money, photos, notes and provenance unless explicitly edited.
        id: stay.id, // Preserve the original id - this is the key for syncing
        name: stayPlace.name || "",
        formatted_address: stayPlace.formatted_address || "",
        place_id: stayPlace.place_id || "",
        geometry: {
          location: {
            lat: typeof location.lat === "function" ? location.lat() : Number(location.lat),
            lng: typeof location.lng === "function" ? location.lng() : Number(location.lng),
          },
        },
        types: stayPlace.types || [],
        // Preserve optional fields from original stay
        tips: stay.tips,
        priceLevel: stay.priceLevel,
        priceRange: stay.priceRange,
        customBudget: stay.customBudget,
      };

      // ============================================
      // UPDATE STAY FIELD (Single Source of Truth)
      // ============================================
      const currentStayData = parseStay(section.Stay);
      const accommodations = Array.isArray(currentStayData.accommodations)
        ? [...currentStayData.accommodations]
        : [];

      // Find and update the specific stay by id in Stay field
      const stayIndex = accommodations.findIndex((acc) => acc.id === stay.id);
      if (stayIndex === -1) {
        throw new Error("Stay not found in section");
      }

      // Update the accommodation in the Stay array
      accommodations[stayIndex] = updatedStay;

      // Create updated Stay data
      const updatedStayData: StayData = {
        accommodations,
      };



      // ============================================
      // UPDATE TIMELINE FIELD (Sync with Timeline arrays)
      // ============================================
      // Parse current Timeline data
      const currentTimelineData = parseTimeline(section.Timeline);
      
      // Helper function to update all occurrences of a stay by ID in an array
      const updateStayInArray = (places: DayPlace[]): DayPlace[] => {
        return places.map((place) => {
          // If this place has the same ID as the stay being edited, update it
          if (place.id === stay.id) {
            return updatedStay;
          }
          return place;
        });
      };

      // Update all timeline arrays (morning, afternoon, evening)
      const updatedTimeline: TimelineData = {
        morning: updateStayInArray(currentTimelineData.morning || []),
        afternoon: updateStayInArray(currentTimelineData.afternoon || []),
        evening: updateStayInArray(currentTimelineData.evening || []),
      };



      // ============================================
      // UPDATE BUDGET FIELD (Sync budget entries)
      // ============================================
      // Budget rows belong to a local timeline entry; provider ids can be shared.
      const currentBudgetData = parseBudget(section.Budget);
      const newPlaceId = updatedStay.place_id;

      const stayInMorning = updatedTimeline.morning.some((p) => p.id === stay.id);
      const stayInAfternoon = updatedTimeline.afternoon.some((p) => p.id === stay.id);
      const stayInEvening = updatedTimeline.evening.some((p) => p.id === stay.id);

      const updateBudgetInPeriod = (
        budgetPlaces: BudgetPlace[],
        hasStayInPeriod: boolean
      ): BudgetPlace[] => {
        if (!hasStayInPeriod) {
          return budgetPlaces.filter((bp) => bp.localId !== stay.id);
        }

        const existingIndex = budgetPlaces.findIndex((bp) => bp.localId === stay.id);
        const existing = budgetPlaces[existingIndex];
        if (!newPlaceId || (!existing && updatedStay.priceLevel === undefined &&
            !updatedStay.priceRange && !updatedStay.customBudget && updatedStay.budgetAmount === undefined)) {
          return budgetPlaces;
        }

        const newBudgetPlace: BudgetPlace = {
          priceLevel: updatedStay.priceLevel,
          priceRange: updatedStay.priceRange,
          customBudget: updatedStay.customBudget,
          budgetAmount: updatedStay.budgetAmount,
          budgetCurrency: updatedStay.budgetCurrency,
          ...existing, // A location edit keeps this period's saved pricing metadata.
          localId: updatedStay.id,
          place_id: newPlaceId,
          name: updatedStay.name,
        };
        if (existingIndex >= 0) {
          return budgetPlaces.map((bp, index) => index === existingIndex ? newBudgetPlace : bp);
        }
        return [...budgetPlaces, newBudgetPlace];
      };
      const updatedBudget: BudgetData = {
        morning: updateBudgetInPeriod(currentBudgetData.morning || [], stayInMorning),
        afternoon: updateBudgetInPeriod(currentBudgetData.afternoon || [], stayInAfternoon),
        evening: updateBudgetInPeriod(currentBudgetData.evening || [], stayInEvening),
      };



      // Stay, Timeline and Budget all move together: a stay shown in the timeline and
      // priced in the budget is one fact in three places, and updating one of them alone
      // is what makes a guide disagree with itself. Blocks not named here keep their
      // current value, so nothing else is touched.
      await saveSection(sectionId, {
        title: section.Title,
        description: section.Description ?? null,
        Timeline: updatedTimeline,
        Stay: updatedStayData,
        Budget: updatedBudget,
      });

      toast.success("Stay updated successfully!");
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error("Error updating stay:", error);
      toast.error(error.message || "Failed to update stay. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />

          {/* Modal */}
          <DialogPanel onClose={onClose}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-dashboard-sidebar rounded-2xl shadow-2xl border border-dashboard-muted w-full max-w-md max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-dashboard-sidebar border-b border-dashboard-muted p-6 rounded-t-2xl z-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 text-blue-400 flex items-center justify-center ring-1 ring-blue-400/20">
                    <StayIcon size="5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-dashboard font-poppins font-bold text-lg">
                      Edit Accommodation
                    </h2>
                    <p className="text-dashboard-light text-xs font-poppins truncate">
                      {sectionTitle}
                    </p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-dashboard font-poppins font-medium text-sm mb-2">
                    Accommodation Location
                  </label>
                  <AddressInput
                    value={stayDisplay}
                    onChange={(value) => setStayDisplay(value)}
                    setPlaces={handlePlaceSelectFromInput}
                    label="Search for accommodation"
                    placeHolder="Search for hotels, lodges, or accommodations"
                    className="w-full"
                  />
                  {stayPlace && (
                    <p className="mt-2 text-xs text-dashboard-light font-poppins">
                      Selected: {stayPlace.name || stayPlace.formatted_address}
                    </p>
                  )}
                </div>

                {/* Current stay info */}
                {stay && (
                  <div className="p-3 bg-dashboard-bg/50 rounded-lg border border-dashboard-muted/30">
                    <p className="text-xs text-dashboard-light font-poppins mb-1">
                      Current:
                    </p>
                    <p className="text-sm text-dashboard font-poppins font-medium">
                      {stay.name}
                    </p>
                    {stay.formatted_address && (
                      <p className="text-xs text-dashboard-light font-poppins mt-1">
                        {stay.formatted_address}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 bg-dashboard-sidebar border-t border-dashboard-muted p-6 rounded-b-2xl flex gap-3">
                <Button
                  variant="ghost"
                  onClickHandler={onClose}
                  btnText="Cancel"
                  className="flex-1"
                />
                <Button
                  variant="primary"
                  onClickHandler={handleSubmit}
                  btnText={loading ? "Saving..." : "Save Changes"}
                  className="flex-1"
                  disabled={loading || !stayPlace}
                />
              </div>
            </div>
          </DialogPanel>
        </>
      )}
    </AnimatePresence>
  );
};

export default EditStayModal;

