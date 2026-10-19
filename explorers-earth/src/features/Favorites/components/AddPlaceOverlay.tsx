import { mapsBrowserKey } from "../../../lib/publicRuntimeConfig";
import { memo, useEffect, useRef, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import CrossIcon from "../../../assets/icons/CrossIcon";
import TopPlacesByCategory from "./TopPlacesByCategory";
import { useCityStore } from "../../../store/useCityStore";
import { GooglePlace } from "./TopPlacesByCategory";
import { createPlaceQueryParams } from "../../../utils/transformGooglePlace";
import { toast } from "sonner";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import axios from "axios";
import { withGoogleMapsProvider } from "../../../components/GoogleMapsProvider";

// ── Types ──────────────────────────────────────────────────────────

interface AddPlaceOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    // A manually entered place has no provider id, and the native DTO says so rather
    // than substituting an internal id for one.
    existingRecommendations?: Array<{
        Place_Details: { Place_Id: string | null; Place_Name: string; Title: string };
    }>;
    selectedLocationCoords?: { lat: number; lng: number } | null;
    onPlaceAdded?: () => void;
    topPlacesKey?: number;
}

// ── Component ──────────────────────────────────────────────────────
const AddPlaceOverlay = memo(
    ({
        isOpen,
        onClose,
        existingRecommendations = [],
        selectedLocationCoords,
        onPlaceAdded,
        topPlacesKey = 0,
    }: AddPlaceOverlayProps) => {
        const { selectedCity } = useCityStore();
        const navigate = useNavigate();
        const placesLibrary = useMapsLibrary("places");

        const [searchValue, setSearchValue] = useState("");

        const searchInputRef = useRef<HTMLInputElement>(null);
        const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

        // ── Body scroll lock ──────────────────────────────────────────
        useEffect(() => {
            if (isOpen) {
                document.body.style.overflow = "hidden";
                setTimeout(() => searchInputRef.current?.focus(), 300);
            } else {
                document.body.style.overflow = "";
            }
            return () => {
                document.body.style.overflow = "";
            };
        }, [isOpen]);

        // ── Reset on close ────────────────────────────────────────────
        useEffect(() => {
            if (!isOpen) {
                setSearchValue("");
            }
        }, [isOpen]);

        // ── Google Places Autocomplete ─────────────────────────────────
        useEffect(() => {
            if (!searchInputRef.current || !placesLibrary || !isOpen) return;

            if (autocompleteRef.current) {
                google.maps.event.clearInstanceListeners(autocompleteRef.current);
                autocompleteRef.current = null;
            }

            try {
                const autocomplete = new placesLibrary.Autocomplete(searchInputRef.current, {
                    fields: [
                        "place_id",
                        "name",
                        "formatted_address",
                        "geometry",
                        "types",
                        "address_components",
                        "rating",
                        "user_ratings_total",
                    ],
                    types: ["establishment", "geocode"],
                });

                autocomplete.addListener("place_changed", async () => {
                    const place = autocomplete.getPlace();
                    if (!place?.place_id) return;
                    if (!selectedCity?.documentId) {
                        toast.error("Please select a location first.");
                        return;
                    }

                    try {
                        const res = await axios.get(
                            `https://places.googleapis.com/v1/places/${place.place_id}`,
                            {
                                headers: {
                                    "X-Goog-Api-Key": mapsBrowserKey(),
                                    "X-Goog-FieldMask":
                                        "id,displayName,formattedAddress,types,primaryType,primaryTypeDisplayName,addressComponents,location,rating,userRatingCount",
                                },
                            }
                        );
                        const pd = res.data;
                        const params = new URLSearchParams({
                            placeId: pd.id || place.place_id,
                            name: encodeURIComponent(pd.displayName?.text || place.name || ""),
                            address: encodeURIComponent(
                                pd.formattedAddress || place.formatted_address || ""
                            ),
                            lat: (
                                pd.location?.latitude ??
                                place.geometry?.location?.lat() ??
                                0
                            ).toString(),
                            lng: (
                                pd.location?.longitude ??
                                place.geometry?.location?.lng() ??
                                0
                            ).toString(),
                            rating: (pd.rating ?? place.rating ?? "").toString(),
                            userRatingsTotal: (pd.userRatingCount ?? "").toString(),
                            primaryType: (pd.primaryType || place.types?.[0]) ?? "",
                            source: "suggestion",
                        });
                        navigate(`/${selectedCity.documentId}/new?${params.toString()}`);
                    } catch {
                        const params = new URLSearchParams({
                            placeId: place.place_id,
                            name: encodeURIComponent(place.name || ""),
                            address: encodeURIComponent(place.formatted_address || ""),
                            lat: (place.geometry?.location?.lat() ?? 0).toString(),
                            lng: (place.geometry?.location?.lng() ?? 0).toString(),
                            rating: (place.rating ?? "").toString(),
                            primaryType: place.types?.[0] ?? "",
                            source: "suggestion",
                        });
                        navigate(`/${selectedCity.documentId}/new?${params.toString()}`);
                    }
                    if (onPlaceAdded) onPlaceAdded();
                    onClose();
                });

                autocompleteRef.current = autocomplete;
            } catch (err) {
                console.error("Error initializing Places Autocomplete:", err);
            }

            return () => {
                if (autocompleteRef.current) {
                    google.maps.event.clearInstanceListeners(autocompleteRef.current);
                    autocompleteRef.current = null;
                }
            };
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [placesLibrary, isOpen]);

        // ── Nearby suggestion card click ──────────────────────────────
        const handlePlaceSelect = useCallback(
            (place: GooglePlace) => {
                if (!selectedCity?.documentId) {
                    toast.error("Please select a location first.");
                    return;
                }
                const queryParams = createPlaceQueryParams(place);
                navigate(
                    `/${selectedCity.documentId}/new?${new URLSearchParams(queryParams).toString()}`
                );
                if (onPlaceAdded) onPlaceAdded();
                onClose();
            },
            [selectedCity, navigate, onPlaceAdded, onClose]
        );

        // ── Portal render ─────────────────────────────────────────────
        const overlayContent = (
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            key="add-place-backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="add-place-overlay-backdrop"
                            onClick={onClose}
                        />

                        {/* Full-screen panel */}
                        <motion.div
                            key="add-place-panel"
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                            className="add-place-overlay-panel"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="add-place-overlay-header">
                                <h2 className="add-place-overlay-title">Add a Place</h2>
                                <button
                                    id="add-place-close-btn"
                                    className="add-place-close-btn"
                                    onClick={onClose}
                                    aria-label="Close"
                                >
                                    <CrossIcon size="5" stroke="currentColor" />
                                </button>
                            </div>

                            {/* Scrollable content */}
                            <div className="add-place-overlay-content">

                                {/* Input section */}
                                <div className="add-place-inner">

                                    {/* ── Search Manually ── */}
                                    <div className="add-place-input-group">
                                        <label className="add-place-input-label">Search Manually</label>
                                        <input
                                            ref={searchInputRef}
                                            id="add-place-search-input"
                                            type="text"
                                            placeholder="e.g. Blue Tokai Coffee, Lucknow"
                                            className="add-place-input"
                                            value={searchValue}
                                            onChange={(e) => setSearchValue(e.target.value)}
                                            autoComplete="off"
                                        />
                                        <p className="add-place-search-hint">
                                            Start typing — select a place from the dropdown to auto-fill the form.
                                        </p>
                                    </div>

                                </div>

                                {/* ── Nearby Suggestions ── */}
                                <div className="add-place-suggestions-section" data-walkthrough="suggestion-button">
                                    <h3 className="add-place-suggestions-title">Nearby Suggestions</h3>
                                    <TopPlacesByCategory
                                        key={`overlay-${selectedCity?.documentId || "loc"}-${topPlacesKey}`}
                                        selectedLocationName={selectedCity?.List_Name}
                                        selectedLocationCoords={selectedLocationCoords}
                                        existingRecommendations={existingRecommendations}
                                        onPlaceSelect={handlePlaceSelect}
                                        onPlaceAdded={onPlaceAdded}
                                    />
                                </div>

                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        );

        return ReactDOM.createPortal(overlayContent, document.body);
    }
);

export default withGoogleMapsProvider(AddPlaceOverlay);
