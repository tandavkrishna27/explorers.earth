import { memo, useState, useRef, useMemo, useEffect } from "react";
import InstagramIcon from "../../../assets/icons/InstagramIcon";
import Button from "../../../components/ui/Button";
import { useQuery } from "@apollo/client";
import { accountsDetailQuery } from "../api/query";
import { recommendedPlacesQuery } from "../../Favorites/api/query";
import { useTrackAnalytics } from "../../../services/analyticsService";
import HeroSkeleton from "../../../components/ui/HeroSkeleton";
import RecommendationCardSkeleton from "../../../components/ui/RecommendationCardSkeleton";
import PublicPlaceCard from "./PublicPlaceCard";
import { useNavigate, useParams, useLocation, useOutletContext } from "react-router-dom";

import { getCurrentDomain } from "../../../utils/getCurrentDomain";
import PlaceOverview from "./PlaceDetails/PlaceOverview";
import WhatsappIcon from "../../../assets/icons/WhatsappIcon";
import MobileIcon from "../../../assets/icons/MobileIcon";
import ShareModal from "../../../components/ShareModal";
import TwitterIcon from "../../../assets/icons/TwitterIcon";

import QRModal from "../../../components/ui/QRModal";
import { useQRActions } from "../../../hooks/useQRActions";
import { generateUserPlacesQRUrl } from "../../../utils/qrCodeService";
import CircularPlacesModal from "../../../components/CircularPlacesModal";
import { IMAGE_CONFIG } from "../../../config";
import { toUrlSlug } from "../../../utils/formatAddress";
import SEO from "../../../components/SEO";
import { createLocationGEOData } from "../../../utils/geoHelpers";
import { getBaseUrl } from "../../../utils/getCurrentDomain";
import {
  extractUtmParamsFromCurrentUrl,
  createUtmParams,
} from "../../../utils/urlHelpers";
import Location from "../../../assets/icons/Location";
import { Share2, ArrowLeft, Users, ShoppingBag } from "lucide-react";
import { buildImageUrl, deduplicatePeople } from "../../People/utils/personHelpers";
import ProductDetailModal from "../../Products/components/public/ProductDetailModal";
import PersonDetailModal from "../../People/components/public/PersonDetailModal";
import { deduplicateProducts } from "../../Products/utils/productHelpers";
import { AdvancedMarker, Map, Pin, useMap } from "@vis.gl/react-google-maps";
import { getPlaceCoordinatesQuery } from "../api/query";
import { toast } from "sonner";
import { motion, AnimatePresence, PanInfo } from "framer-motion";

type CardDataItem = {
  Media: {
    url: string;
  }[];
  media_details?: {
    scalarId?: string;
    thumbnail?: {
      id?: string;
      url?: string;
    };
    imageDetails?: {
      id: string;
      url: string;
    }[];
  };
  Place_Details: {
    Photos: string[];
    Place_Address: string;
    Place_Id: string;
    Place_Name: string;
    Rating: number;
    Rating_Count: number;
    Title: string;
  };
  Recommendation_Type?: "place" | "person";
  Contact_Name?: string;
  recommendation_category: { Category_Name: string };
  documentId: string;
};

interface City {
  List_Name?: string;
  recommended_places?: CardDataItem[];
  imageUrl?: string;
  documentId?: string;
  Visibility?: boolean;
  List_Name_Details?: {
    thumbnail?: string;
  };
  Social_URL?: string;
  recommendation_link?: string;
  Instagram_Media_URL?: string;
  Note?: string;
  description?: string;
  person_lists?: any[];
  product_lists?: any[];
}

// Helper function to get person image with avatar fallback
const getPersonImageUrl = (data: CardDataItem): string => {
  const imageUrl = data?.media_details?.thumbnail?.url || data?.media_details?.imageDetails?.[0]?.url || data?.Media?.[0]?.url;
  if (imageUrl) return imageUrl;

  // Return data URL for inline SVG avatar
  const svgString = `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="400" fill="#1a1a1a"/><circle cx="200" cy="160" r="70" fill="#2a2a2a"/><circle cx="200" cy="160" r="50" fill="#3a3a3a"/><ellipse cx="200" cy="320" rx="100" ry="80" fill="#3a3a3a"/><circle cx="200" cy="200" r="120" fill="none" stroke="#2a2a2a" stroke-width="2" opacity="0.3"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svgString)}`;
};

// Smooth map controller for preview - only sets initial position once
const MapPreviewController = ({ targetCoords, targetZoom }: { targetCoords: { lat: number; lng: number }; targetZoom: number }) => {
  const map = useMap();
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (map && targetCoords && !hasInitialized.current) {
      map.moveCamera({
        center: targetCoords,
        zoom: targetZoom,
      });
      hasInitialized.current = true;
    }
  }, [map, targetCoords, targetZoom]);

  return null;
};

const PublicHome = memo(() => {
  const { username, placeSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [showAllPlaces, setShowAllPlaces] = useState<boolean>(false);
  const mobileObserverTarget = useRef<HTMLDivElement>(null);
  const desktopObserverTarget = useRef<HTMLDivElement>(null);
  const mobileScrollContainerRef = useRef<HTMLDivElement>(null);
  const desktopScrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasMoreData, setHasMoreData] = useState<boolean>(true);
  const animationTriggeredRef = useRef<boolean>(false);
  const previousPathnameRef = useRef<string>('');
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();

  // Extract UTM parameters from current URL, or create default ones for QR codes
  const utmParams = useMemo(() => {
    const currentUtmParams = extractUtmParamsFromCurrentUrl();
    // If no UTM parameters in current URL, create default ones for QR code sharing
    if (Object.keys(currentUtmParams).length === 0) {
      return createUtmParams.qrCode();
    }
    return currentUtmParams;
  }, []);



  // local state for handle catgeories
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const { data, loading } = useQuery(accountsDetailQuery, {
    variables: {
      filters: {
        username: {
          eq: username,
        },
      },
    },
    skip: !username,
    fetchPolicy: "cache-and-network", // Ensure fresh data is fetched
  });

  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    if (!loading) {
      (window as any).__publicProfileLoaded = true;
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [loading, outletContext]);
  const [_isQRVisible, setIsQRVisible] = useState(false);
  const accountData = data?.accounts[0];

  const [selectedCity, setSelectedCity] = useState<City | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<"places" | "people" | "products">("places");

  // Reset activeTab when selectedCity changes
  useEffect(() => {
    setActiveTab("places");
  }, [selectedCity?.documentId]);

  // Linked person and product lists for the selected city
  const linkedPersonLists = useMemo(() => {
    return (selectedCity?.person_lists || []).filter((l: any) => l.Visibility === true);
  }, [selectedCity]);

  const linkedProductLists = useMemo(() => {
    return (selectedCity?.product_lists || []).filter((l: any) => l.Visibility === true);
  }, [selectedCity]);

  const linkedPeople = useMemo(() => {
    const raw = linkedPersonLists.flatMap((l: any) =>
      (l.recommended_people || []).map((p: any) => ({
        ...p,
        _listName: l.List_Name,
        _listId: l.documentId,
        _listSlug: l.slug,
      }))
    );
    return deduplicatePeople(raw);
  }, [linkedPersonLists]);

  const linkedProducts = useMemo(() => {
    const raw = linkedProductLists.flatMap((l: any) =>
      (l.recommended_products || []).map((p: any) => ({
        ...p,
        _listName: l.List_Name,
        _listId: l.documentId,
        _listSlug: l.slug,
      }))
    );
    return deduplicateProducts(raw);
  }, [linkedProductLists]);

  // local state for inline details modals
  const [isExpanded, setIsExpanded] = useState<{
    visible: boolean;
    documentId: string | null;
    type: "place" | "person" | null;
  }>({
    visible: false,
    documentId: null,
    type: null,
  });
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<any | null>(null);

  // Memoize expensive calculations to prevent unnecessary re-renders
  const PublishedCities = useMemo(() => {
    return (
      accountData?.recommendation_lists?.filter(
        (list: {
          List_Name: string;
          Visibility: boolean;
          recommended_places: string[];
        }) => list.Visibility === true
      ) || []
    );
  }, [accountData?.recommendation_lists]);

  // Analytics tracking - initialize after first city is selected
  const analytics = useTrackAnalytics({
    accountId: accountData?.documentId || "",
    locationId: selectedCity?.documentId || undefined,
    recommendationId: undefined,
    pageName: "public-home",
    pageUsername: username, // Pass the username from URL params
    autoTrackView: true,
    waitForLocation: true, // Wait for location to be set before auto-tracking view
    cityName: selectedCity?.List_Name, // Pass city name for analytics metadata
  });

  // QR URL generation for PublicHome page
  // Always redirect to host/{username}/places regardless of selected city
  // This ensures consistent QR behavior in the public profile view
  const qrContext = "places";
  const qrValue = useMemo(() => {
    if (!username) return "";

    // Always generate places overview URL: host/{username}/places
    // This ensures QR code always redirects to places overview, not specific recommendations
    return generateUserPlacesQRUrl(username, undefined, utmParams);
  }, [username, utmParams]);

  const { handleCopyLink } = useQRActions({
    username: username,
    context: qrContext,
    recommendationListName: undefined, // Always undefined for places overview
    utmParams: utmParams, // Include UTM parameters for tracking
  });

  // Separate query for paginated places
  // CRITICAL: Only query places for published cities
  const {
    data: placesData,
    loading: placesQueryLoading,
    fetchMore,
  } = useQuery(recommendedPlacesQuery, {
    variables: {
      pagination: {
        page: 1,
        pageSize: 10,
      },
      filters: {
        recommendation_list: {
          documentId: {
            eq: selectedCity?.documentId,
          },
        },
      },
    },
    fetchPolicy: "cache-and-network",
    // Skip query if no selectedCity, no documentId, or city is not published
    skip: !selectedCity?.documentId || selectedCity?.Visibility !== true,
  });
  const [showShareModal, setShowShareModal] = useState<boolean>(false);

  // Track recommendation engagement views when card is opened
  useEffect(() => {
    if (isExpanded.visible && isExpanded.documentId && accountData?.documentId && selectedCity?.documentId) {
      // Find the clicked item to get its details from current places data
      const currentPlaces = placesData?.recommendedPlaces || [];
      const clickedItem = currentPlaces.find(
        (item: any) => item.documentId === isExpanded.documentId
      );

      if (clickedItem) {
        const isPersonType = clickedItem?.Recommendation_Type === "person";
        console.log('Tracking recommendation engagement view:', {
          recommendationId: isExpanded.documentId,
          locationId: selectedCity.documentId,
          accountId: accountData.documentId
        });
        analytics.trackEvent({
          type: 'click',
          element: `place-card-${isExpanded.documentId}`,
          metadata: {
            recommendationId: isExpanded.documentId,
            placeId: isExpanded.documentId,
            placeName: isPersonType ? clickedItem.Contact_Name : clickedItem.Place_Details?.Title,
            category: clickedItem.recommendation_category?.Category_Name,
            recommendationType: isPersonType ? 'person' : 'place',
            url: window.location.href,
            originalElement: 'recommendation-engagement'
          }
        });
      }
    }
  }, [isExpanded.visible, isExpanded.documentId, accountData?.documentId, selectedCity?.documentId, placesData?.recommendedPlaces, analytics.trackEvent]);

  // CRITICAL FIX: Auto-select first PUBLISHED city only, not drafts
  useEffect(() => {
    if (PublishedCities?.length) {
      if (placeSlug) {
        // Find the city that matches the placeSlug from PUBLISHED cities only
        const city = PublishedCities.find(
          (list: City) =>
            toUrlSlug(list.List_Name || "") === placeSlug.toLowerCase()
        );
        // If found city exists in published list, select it, otherwise select first published city
        // Additional validation: ensure city is published before selecting
        const cityToSelect = city || PublishedCities[0];
        if (cityToSelect && cityToSelect.Visibility === true) {
          setSelectedCity(cityToSelect);
        } else if (PublishedCities[0]?.Visibility === true) {
          setSelectedCity(PublishedCities[0]);
        }
      } else {
        // Auto-select the first PUBLISHED city when no placeSlug is provided
        // Additional validation: ensure city is published
        if (PublishedCities[0]?.Visibility === true) {
          setSelectedCity(PublishedCities[0]);
        }
      }
    } else {
      // If no published cities, clear selection
      setSelectedCity(undefined);
    }
  }, [PublishedCities, placeSlug]);

  // Handle case when currently selected city becomes unpublished or is a draft
  useEffect(() => {
    if (selectedCity && PublishedCities?.length) {
      // Check if currently selected city is still published
      const isStillPublished = PublishedCities.some(
        (city: City) => city.documentId === selectedCity.documentId
      );

      // Additional check: ensure selectedCity has Visibility === true
      const isSelectedCityPublished = selectedCity.Visibility === true;

      // If selected city is not published anymore or is a draft, select the first published city
      if (!isStillPublished || !isSelectedCityPublished) {
        const firstPublishedCity = PublishedCities.find(
          (city: City) => city.Visibility === true
        );
        if (firstPublishedCity) {
          setSelectedCity(firstPublishedCity);
          // Update URL to reflect the new selection
          navigate(
            `/${username}/places/${toUrlSlug(
              firstPublishedCity.List_Name || ""
            )}`
          );
        } else {
          // No published cities available, clear selection
          setSelectedCity(undefined);
        }
      }
    } else if (selectedCity && PublishedCities?.length === 0) {
      // No published cities available, clear selection
      setSelectedCity(undefined);
    }
  }, [selectedCity, PublishedCities, username, navigate]);

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          !placesQueryLoading &&
          hasMoreData &&
          placesData?.recommendedPlaces?.length > 0
        ) {
          fetchMore({
            variables: {
              pagination: {
                page:
                  Math.ceil((placesData?.recommendedPlaces?.length || 0) / 10) +
                  1,
                pageSize: 10,
              },
              filters: {
                recommendation_list: {
                  documentId: {
                    eq: selectedCity?.documentId,
                  },
                },
              },
            },
            updateQuery: (prev, { fetchMoreResult }) => {
              if (!fetchMoreResult?.recommendedPlaces?.length) {
                setHasMoreData(false);
                return prev;
              }
              // If we get less than the page size, we've reached the end
              if (fetchMoreResult.recommendedPlaces.length < 10) {
                setHasMoreData(false);
              }
              return {
                recommendedPlaces: [
                  ...prev.recommendedPlaces,
                  ...fetchMoreResult.recommendedPlaces,
                ],
              };
            },
          }).catch(() => {
            setHasMoreData(false);
          });
        }
      },
      { threshold: 1.0 }
    );

    // Observe both mobile and desktop targets
    if (mobileObserverTarget.current && hasMoreData) {
      observer.observe(mobileObserverTarget.current);
    }
    if (desktopObserverTarget.current && hasMoreData) {
      observer.observe(desktopObserverTarget.current);
    }

    return () => observer.disconnect();
  }, [
    placesQueryLoading,
    hasMoreData,
    placesData,
    fetchMore,
    selectedCity?.documentId,
  ]);

  // Reset hasMoreData when selectedCity changes
  useEffect(() => {
    setHasMoreData(true);
  }, [selectedCity?.documentId]);

  // Scroll animation (mobile and desktop) only when visiting base places route
  useEffect(() => {
    // Only trigger on base places route (no placeSlug in URL)
    const isBasePlacesRoute = !placeSlug && location.pathname.endsWith('/places');

    // Reset trigger only when navigating TO base places route (pathname changed)
    const pathnameChanged = previousPathnameRef.current !== location.pathname;
    if (isBasePlacesRoute && pathnameChanged) {
      animationTriggeredRef.current = false;
    }
    previousPathnameRef.current = location.pathname;

    // Skip if not on base places route
    if (
      !isBasePlacesRoute ||
      !PublishedCities?.length ||
      PublishedCities.length <= 1 ||
      animationTriggeredRef.current
    ) {
      return;
    }

    // Determine which container to use based on viewport
    const isMobile = window.innerWidth < 768;
    const scrollContainer = isMobile
      ? mobileScrollContainerRef.current
      : desktopScrollContainerRef.current;

    if (!scrollContainer) return;

    const container = scrollContainer;
    if (container.scrollWidth <= container.clientWidth) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Mark as triggered to prevent re-animation when selectedCity changes
    animationTriggeredRef.current = true;

    let scrollBackTimeout: ReturnType<typeof setTimeout>;

    const animationTimeout = setTimeout(() => {
      const currentContainer = isMobile
        ? mobileScrollContainerRef.current
        : desktopScrollContainerRef.current;

      if (!currentContainer) return;

      const scrollAmount = Math.min(200, container.scrollWidth * 0.3);
      const originalScrollLeft = container.scrollLeft;

      currentContainer.scrollTo({
        left: originalScrollLeft + scrollAmount,
        behavior: 'smooth',
      });

      scrollBackTimeout = setTimeout(() => {
        const finalContainer = isMobile
          ? mobileScrollContainerRef.current
          : desktopScrollContainerRef.current;

        if (!finalContainer) return;
        finalContainer.scrollTo({
          left: originalScrollLeft,
          behavior: 'smooth',
        });
      }, 1100);
    }, 400);

    return () => {
      if (animationTimeout) clearTimeout(animationTimeout);
      if (scrollBackTimeout) clearTimeout(scrollBackTimeout);
    };
  }, [PublishedCities, location.pathname, placeSlug]);

  const handleCitySelect = (city: City) => {
    // CRITICAL: Only allow selection of published cities
    if (city.Visibility === true) {
      setSelectedCity(city);
      // Update URL with the new place slug using the /places/ structure
      navigate(`/${username}/places/${toUrlSlug(city.List_Name || "")}`);
      analytics.trackClick("city-select", {
        cityName: city.List_Name,
        cityId: city.documentId,
      });
    } else {
      // If somehow a draft city is clicked, find and select the first published city instead
      const firstPublishedCity = PublishedCities.find(
        (c: City) => c.Visibility === true
      );
      if (firstPublishedCity) {
        setSelectedCity(firstPublishedCity);
        navigate(
          `/${username}/places/${toUrlSlug(firstPublishedCity.List_Name || "")}`
        );
      }
    }
  };

  // Helper function to handle map navigation based on current placeSlug
  const handleMapNavigation = () => {
    if (placeSlug) {
      // If a specific place is selected, navigate to its map view
      navigate(`/${username}/places/${placeSlug}/map`);
    } else {
      // If no specific place is selected, navigate to the general map view
      navigate(`/${username}/places/map`);
    }
    analytics.trackClick("map-view-button", {
      placeSlug: placeSlug || "all",
      selectedCity: selectedCity?.List_Name,
    });
  };

  useEffect(() => {
    if (!showQR) {
      const timer = setInterval(() => {
        setIsQRVisible((prev) => !prev);
      }, 5000);

      return () => clearInterval(timer);
    }
  }, [showQR]);

  const url = getCurrentDomain();



  // Calculate total recommendations count across all published cities
  const totalRecommendations = useMemo(() => {
    return (
      PublishedCities?.reduce((total: number, city: any) => {
        return total + (city.recommended_places?.length || 0);
      }, 0) || 0
    );
  }, [PublishedCities]);



  // Fetch map data for preview (same as MapView)
  const { data: mapData, loading: mapLoading } = useQuery(getPlaceCoordinatesQuery, {
    variables: {
      filters: {
        username: {
          eq: username,
        },
      },
    },
    skip: !username,
  });

  // Calculate map preview coordinates and bounds
  const mapPreviewData = useMemo(() => {
    if (!mapData?.accounts?.[0]?.recommendation_lists) {
      return { coordinates: [], center: { lat: 20.5937, lng: 78.9629 }, zoom: 2, places: [] };
    }

    const recommendationLists = mapData.accounts[0].recommendation_lists;
    const placeDataWithRegion = recommendationLists.flatMap(
      (list: any) =>
        list?.recommended_places?.map((place: any) => ({
          ...place.Place_Details,
          Media: place.Media,
          category: place.recommendation_category?.Category_Name,
          region: list.List_Name || 'Unknown Region',
          documentId: place.documentId,
        })) || []
    );

    const places = placeDataWithRegion.filter(
      (place: any) => place.Geometry && place.Geometry.lat && place.Geometry.lng
    );

    const coordinates = places.map((place: any) => place.Geometry);

    if (coordinates.length === 0) {
      return { coordinates: [], center: { lat: 20.5937, lng: 78.9629 }, zoom: 2, places: [] };
    }

    // Calculate bounds and zoom
    const lats = coordinates.map((coord: any) => coord.lat);
    const lngs = coordinates.map((coord: any) => coord.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    const maxDiff = Math.max(latDiff, lngDiff);

    // Zoom out more for preview to ensure all markers are visible
    // Reduce zoom level by 2-3 levels compared to full map view
    let zoom = 11; // Default zoom (reduced from 13)
    if (maxDiff > 50) zoom = 3;      // Very large spread (country level) - zoom out more
    else if (maxDiff > 20) zoom = 4; // Large spread (state level)
    else if (maxDiff > 10) zoom = 5; // Medium-large spread
    else if (maxDiff > 5) zoom = 6;  // Medium spread
    else if (maxDiff > 2) zoom = 7;  // Medium-small spread
    else if (maxDiff > 1) zoom = 8;  // Small-medium spread
    else if (maxDiff > 0.5) zoom = 9; // Small spread
    else if (maxDiff > 0.2) zoom = 10; // Very small spread
    else if (maxDiff > 0.1) zoom = 11; // Tiny spread
    else if (maxDiff > 0.05) zoom = 12; // Micro spread
    else if (maxDiff > 0.01) zoom = 13; // Very micro spread
    else zoom = 14; // Single point or very close points (reduced from 15)

    // Reduce zoom by 2 more levels for preview to ensure all markers fit
    const previewZoom = Math.max(zoom - 2, 2); // Minimum zoom 2

    return {
      coordinates,
      center: {
        lat: (minLat + maxLat) / 2,
        lng: (minLng + maxLng) / 2,
      },
      zoom: previewZoom,
      places
    };
  }, [mapData]);

  const shareButtons = [
    {
      name: "Instagram",
      icon: <InstagramIcon color="white" />,
      url: `https://www.instagram.com/`,
    },
    {
      name: "Twitter",
      icon: <TwitterIcon color="white" />,
      url: `https://twitter.com/`,
    },
    {
      name: "WhatsApp",
      icon: <WhatsappIcon fill="white" />,
      url: `https://www.whatsapp.com/`,
    },
    {
      name: "Mobile",
      icon: <MobileIcon color="black" />,
      url: `www.gmail.com`,
    },
  ];

  // Use paginated places data instead of nested data from accountsDetailQuery
  const currentPlaces = placesData?.recommendedPlaces || [];

  // fetching categories for the recommendation list
  const categories: string[] = useMemo(() => {
    return Array.from(
      new Set(
        currentPlaces?.map(
          (place: CardDataItem) => place?.recommendation_category?.Category_Name
        )
      )
    );
  }, [currentPlaces]);

  // Filter the recommended places by the selected category
  const filteredPlaces = useMemo(() => {
    return selectedCategory
      ? currentPlaces?.filter(
        (place: CardDataItem) =>
          place?.recommendation_category?.Category_Name === selectedCategory
      )
      : currentPlaces;
  }, [selectedCategory, currentPlaces]);

  // Dynamic SEO data preparation
  const profileName = accountData?.Account_Name || username || "User";
  const profileLocation = accountData?.Primary_Address?.address || "";

  // Extract city names for SEO
  const cityNames = useMemo(() => {
    return (
      PublishedCities?.map((city: City) => city.List_Name).filter(Boolean) || []
    );
  }, [PublishedCities]);

  // Enhanced dynamic meta description with recommendation link and note data
  const selectedCityName = selectedCity?.List_Name || cityNames[0] || "";
  const placesCount = filteredPlaces?.length || 0;

  // ENHANCEMENT: Extract recommendation link for location/list
  const locationRecommendationLink = useMemo(() => {
    return (
      selectedCity?.Social_URL ||
      selectedCity?.recommendation_link ||
      selectedCity?.Instagram_Media_URL ||
      ""
    );
  }, [selectedCity]);

  // ENHANCEMENT: Extract note content from list details
  const locationNote = useMemo(() => {
    // First try direct string fields
    if (selectedCity?.Note && typeof selectedCity.Note === "string") {
      return selectedCity.Note.replace(/<[^>]*>/g, "").substring(0, 150);
    }
    if (
      selectedCity?.description &&
      typeof selectedCity.description === "string"
    ) {
      return selectedCity.description.replace(/<[^>]*>/g, "").substring(0, 150);
    }

    // Then try object fields
    const noteSource = selectedCity?.List_Name_Details;
    if (
      typeof noteSource === "object" &&
      noteSource &&
      (noteSource as any)?.note
    ) {
      return (noteSource as any).note.replace(/<[^>]*>/g, "").substring(0, 150);
    }

    return "";
  }, [selectedCity]);

  const featuredPlacesDetails = useMemo(() => {
    if (
      !selectedCity?.recommended_places ||
      selectedCity.recommended_places.length === 0
    )
      return [];

    return selectedCity.recommended_places
      .slice(0, 3)
      .map((place: any) => {
        const placeDetails = place?.Place_Details;
        return {
          name: placeDetails?.Place_Name || placeDetails?.Title || "",
          category: place?.recommendation_category?.Category_Name || "",
          rating: placeDetails?.Rating || null,
          address: placeDetails?.Place_Address || "",
        };
      })
      .filter((place) => place.name);
  }, [selectedCity]);

  const featuredPlacesText =
    featuredPlacesDetails.length > 0
      ? featuredPlacesDetails
        .map((place) => {
          let description = place.name;
          if (place.category) description += ` (${place.category})`;
          if (place.rating) description += ` ⭐${place.rating}`;
          return description;
        })
        .join(", ")
      : "";

  // ENHANCED meta description with recommendation link and note
  const metaDescription =
    selectedCityName && placesCount > 0
      ? `Discover top places and recommendations by ${profileName} in ${selectedCityName} with explorers. Explore hidden gems, local favorites, and must-visit spots. ${locationNote
        ? `${locationNote.substring(0, 100)}${locationNote.length > 100 ? "..." : ""
        } `
        : ""
      }${featuredPlacesText
        ? `Featured: ${featuredPlacesText}${placesCount > 3 ? " and more" : ""
        }. `
        : ""
      }${locationRecommendationLink
        ? `Connect via ${locationRecommendationLink}.`
        : ""
      }`
      : selectedCityName
        ? `Browse ${profileName}'s curated recommendations in ${selectedCityName} on explorers. Find local favorites, hidden gems, and authentic suggestions. ${locationNote ? `${locationNote} ` : ""
        }${locationRecommendationLink
          ? `Connect via ${locationRecommendationLink}.`
          : ""
        }`
        : `Explore curated recommendations and favorite places by ${profileName} on explorers. Discover hidden gems, top spots, and user insights.`;

  const pageTitle = selectedCityName
    ? `${profileName} | ${selectedCityName} Recommendations | explorers`
    : `${profileName} | Recommendations | explorers`;

  const allPlaceNamesInLocation = useMemo(() => {
    if (!selectedCity?.recommended_places) return [];
    return selectedCity.recommended_places
      .map((place: any) => {
        const placeDetails = place?.Place_Details;
        return placeDetails?.Place_Name || placeDetails?.Title || "";
      })
      .filter(Boolean);
  }, [selectedCity]);

  const noteKeywords = useMemo(() => {
    if (!locationNote) return [];
    return locationNote
      .split(/\s+/)
      .filter((word: string) => word.length > 3)
      .slice(0, 5);
  }, [locationNote]);

  const dynamicKeywords = [
    `${profileName} explorers recommendations`,
    `${username} explorers recommendations`,
    "explorers local recommendations",
    "explorers curated recommendations",
    "explorers travel guide",
    "explorers hidden gems",
    "explorers favorite places",
    "explorers place lists",
    "explorers user insights",
    "explorers city guide",
    `${profileName} recommendations`,
    `${username} recommendations`,
    "local recommendations",
    "curated recommendations",
    "travel recommendations",
    "hidden gems",
    "local favorites",
    "travel guide",
    "local insights",
    "favorite spots",
    ...cityNames.map((city: string) => `${city} explorers recommendations`),
    ...cityNames.map((city: string) => `${city} explorers places`),
    ...(profileLocation ? [`${profileLocation} explorers recommendations`] : []),
    ...categories.map(
      (category: string) => `${category} explorers recommendations`
    ),
    ...allPlaceNamesInLocation,
    ...noteKeywords,
    ...(locationRecommendationLink
      ? [
        "explorers recommendation link",
        "explorers connect",
        "explorers social media",
        "follow",
      ]
      : []),
    ...(selectedCityName
      ? [
        `${selectedCityName} guide`,
        `visit ${selectedCityName} explorers`,
        `${selectedCityName} travel`,
      ]
      : []),
  ].filter(Boolean);

  // Profile image for social sharing
  const profileImage =
    accountData?.profile_picture?.url || accountData?.bg_picture?.url;

  // Create URL for current selection
  const currentUrl = selectedCityName
    ? `${getBaseUrl()}/${username}/places/${toUrlSlug(selectedCityName)}`
    : `${getBaseUrl()}/${username}/places`;

  // Generate GEO data for enhanced structured data
  const geoData = createLocationGEOData({
    locationName: selectedCityName || "All Recommendations",
    recommenderName: profileName,
    placesCount: placesCount,
    topCategories: Array.from(new Set(categories)).slice(0, 3),
    locationNote: selectedCityName
      ? `Explore ${placesCount} curated places in ${selectedCityName} recommended by ${profileName}`
      : `Browse all ${totalRecommendations} recommendations by ${profileName} across ${cityNames.length} locations`,
    coordinates: mapPreviewData.coordinates.length > 0 ? mapPreviewData.center : undefined,
  });

  const getCityNoteHelper = (city: any) => {
    if (city?.Note && typeof city.Note === "string") {
      return city.Note.replace(/<[^>]*>/g, "").substring(0, 150);
    }
    if (city?.description && typeof city.description === "string") {
      return city.description.replace(/<[^>]*>/g, "").substring(0, 150);
    }
    const noteSource = city?.List_Name_Details;
    if (typeof noteSource === "object" && noteSource && noteSource.note) {
      return noteSource.note.replace(/<[^>]*>/g, "").substring(0, 150);
    }
    return "";
  };

  const pinnedCities = useMemo(() => {
    return (PublishedCities || [])
      .filter((city: any) => city.is_pinned === true)
      .sort((a: any, b: any) => {
        const orderA = a.pin_order !== null && a.pin_order !== undefined ? a.pin_order : Infinity;
        const orderB = b.pin_order !== null && b.pin_order !== undefined ? b.pin_order : Infinity;
        return orderA - orderB;
      });
  }, [PublishedCities]);

  const heroSlides = useMemo(() => {
    const slides = [];

    // Always start with Map Slide as Slide 0
    slides.push({
      id: "map-slide",
      title: "Interactive Location Map",
      image: "",
      rating: "Satellite",
      reviews: `${totalRecommendations} spot${totalRecommendations === 1 ? "" : "s"}`,
      category: "Interactive Map",
      address: "Satellite View Map",
      country: "All Regions",
      desc: "Explore all recommended locations on the interactive satellite map view. Click any pin to open spot details or expand map.",
      isMap: true,
    });

    // Followed by pinned location lists
    pinnedCities.forEach((city: any) => {
      const count = city.recommended_places?.length || 0;
      slides.push({
        id: city.documentId || city.List_Name,
        title: city.List_Name || "",
        image: city.List_Name_Details?.thumbnail || IMAGE_CONFIG.defaultImages.background,
        rating: undefined,
        reviews: `${count} recommendation${count === 1 ? "" : "s"}`,
        category: "Location List",
        address: city.List_Name || "",
        country: "Curated List",
        desc: getCityNoteHelper(city) || "Check out my curated recommendation list.",
        isMap: false,
        city,
      });
    });

    return slides;
  }, [pinnedCities, totalRecommendations]);

  const [activeHeroIndex, setActiveHeroIndex] = useState<number>(0);

  // Auto-rotating Carousel timer
  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const timer = setInterval(() => {
      setActiveHeroIndex((prev) => (prev + 1) % heroSlides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  // Adjust activeHeroIndex in case of slide changes
  useEffect(() => {
    if (activeHeroIndex >= heroSlides.length) {
      setActiveHeroIndex(0);
    }
  }, [heroSlides.length, activeHeroIndex]);

  return (
    <>
      {!loading && accountData && (
        <SEO
          key={`${selectedCity?.documentId || "default"}-home`}
          title={pageTitle}
          description={metaDescription}
          keywords={dynamicKeywords}
          canonical={currentUrl}
          image={profileImage}
          url={currentUrl}
          type="website"
          author={profileName}
          siteName="explorers"
          enableGEO={true}
          geoData={geoData}
        />
      )}

      <div className="relative bg-black min-h-screen pb-14 pt-14 flex flex-col overflow-x-hidden">
        {/* Fixed Header */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#2a2a2a]/90 backdrop-blur-sm border-b border-gray-700 h-14">
          <div className="max-w-4xl mx-auto flex items-center justify-between h-full px-6">
            <span
              className="text-white font-bold text-2xl cursor-pointer"
              onClick={() => navigate("/")}
            >
              explorers.earth
            </span>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const shareUrl = selectedCity?.List_Name
                    ? `${window.location.origin}/${username}/places/${toUrlSlug(selectedCity.List_Name)}`
                    : `${window.location.origin}/${username}/places`;
                  if (navigator.share) {
                    navigator.share({
                      title: `${accountData?.Account_Name || username}'s Places`,
                      text: "Check out these recommendations!",
                      url: shareUrl,
                    }).catch(() => { });
                  } else {
                    try {
                      await navigator.clipboard.writeText(shareUrl);
                      toast.success("Link copied!");
                    } catch (error) {
                      console.error("Failed to copy text:", error);
                    }
                  }
                  analytics.trackClick('share-button', { context: 'places-header' });
                }}
                className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-all duration-300 flex items-center justify-center"
                aria-label="Share"
              >
                <Share2 className="h-4 w-4" style={{ color: 'white' }} />
              </button>

            </div>
          </div>
        </div>

        {loading ? (
          (window as any).__publicProfileLoaded ? (
            <div className="bg-black min-h-screen">
              {/* ── Hero skeleton — Desktop ── */}
              <div className="hidden md:block w-full mb-12 mt-4 px-4">
                <div className="max-w-4xl mx-auto">
                  <HeroSkeleton accentColor="yellow" showThumbnails />
                </div>
              </div>

              {/* ── Hero skeleton — Mobile ── */}
              <div className="md:hidden w-full mb-4 mt-4 px-4">
                <HeroSkeleton accentColor="yellow" mobile />
              </div>

              {/* ── City list skeleton ── */}
              <div className="px-4 max-w-4xl mx-auto w-full">
                <div className="flex flex-col gap-8">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex flex-col gap-3">
                      {/* Row header */}
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          <div className="w-4 h-4 rounded-full bg-white/10 skeleton-shimmer relative overflow-hidden" />
                          <div className="h-4 w-24 rounded bg-white/10 skeleton-shimmer relative overflow-hidden" />
                        </div>
                        <div className="h-3 w-14 rounded bg-white/8 skeleton-shimmer relative overflow-hidden" />
                      </div>
                      {/* Horizontal card strip */}
                      <div className="flex gap-4 overflow-hidden">
                        {[0, 1, 2, 3].map((j) => (
                          <div
                            key={j}
                            className="flex-shrink-0 w-[120px] h-[90px] rounded-xl bg-white/5 skeleton-shimmer relative overflow-hidden"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null
        ) : accountData ? (
          <>            {/* ========================================== */}
            {/*             HERO CAROUSEL SECTION          */}
            {/* ========================================== */}
            {heroSlides.length > 0 && !placeSlug && (
              <>
                {/* Carousel Hero Section - Desktop Layout */}
                <div className="hidden md:block w-full mb-12 mt-4 px-4">
                  <div className="relative w-full h-[60vh] min-h-[500px] max-h-[700px] rounded-2xl overflow-hidden bg-black shadow-2xl group/hero max-w-4xl mx-auto">
                    {/* Background Presentation */}
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={heroSlides[activeHeroIndex].id}
                        initial={{ opacity: 0, scale: 1.05 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.6 }}
                        className="absolute inset-0 cursor-pointer"
                        onClick={() => {
                          const slide = heroSlides[activeHeroIndex];
                          if (slide.isMap) {
                            handleMapNavigation();
                          } else {
                            const slug = toUrlSlug(slide.title);
                            navigate(`/${username}/places/${slug}`);
                          }
                        }}
                      >
                        {heroSlides[activeHeroIndex].isMap ? (
                          <div className="absolute inset-0 z-0 pointer-events-auto">
                            {!mapLoading && mapPreviewData.places.length > 0 ? (
                              <Map
                                defaultCenter={mapPreviewData.center}
                                defaultZoom={mapPreviewData.zoom}
                                mapId="mapPreviewDesktop"
                                style={{ height: "100%", width: "100%" }}
                                scrollwheel={true}
                                gestureHandling="greedy"
                                disableDefaultUI={true}
                                mapTypeId="satellite"
                              >
                                <MapPreviewController targetCoords={mapPreviewData.center} targetZoom={mapPreviewData.zoom} />
                                {mapPreviewData.places.map((place: any, idx: number) => (
                                  <AdvancedMarker
                                    key={`marker-${idx}-${place.Geometry.lat}-${place.Geometry.lng}`}
                                    position={place.Geometry}
                                    onClick={(e) => {
                                      e.domEvent?.stopPropagation();
                                      setIsExpanded({
                                        visible: true,
                                        documentId: place.documentId,
                                        type: "place",
                                      });
                                    }}
                                  >
                                    <Pin
                                      background="red"
                                      borderColor="red"
                                      glyphColor="white"
                                    />
                                  </AdvancedMarker>
                                ))}
                              </Map>
                            ) : mapLoading ? (
                              <div className="w-full h-full bg-dashboard-sidebar flex items-center justify-center">
                                <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                              </div>
                            ) : (
                              <div className="w-full h-full bg-dashboard-sidebar flex items-center justify-center">
                                <span className="text-white text-sm">No locations available</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <img
                            src={heroSlides[activeHeroIndex].image}
                            alt={heroSlides[activeHeroIndex].title}
                            className="w-full h-full object-cover opacity-90"
                          />
                        )}
                        {/* Gradients to fade bottom and left */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-[7] pointer-events-none" />
                        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent z-[7] pointer-events-none" />
                      </motion.div>
                    </AnimatePresence>

                    {/* Featured Heading */}
                    <div className="absolute top-8 left-8 md:top-12 md:left-12 z-[15] pointer-events-none flex flex-col gap-1">
                      <h2 className="text-xl md:text-2xl font-bold text-white flex items-center drop-shadow-lg">
                        <span className="w-1.5 h-6 bg-yellow-400 mr-2.5 rounded-full inline-block"></span>
                        Featured
                      </h2>
                    </div>

                    {/* Main Content Area */}
                    <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12 z-[10] pointer-events-none">
                      <div className="flex justify-between items-end w-full">
                        {/* Left Text Detail Section */}
                        <div className="w-full lg:w-1/2 flex flex-col gap-4">
                          <motion.h1
                            key={`title-${heroSlides[activeHeroIndex].id}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight font-poppins"
                          >
                            {heroSlides[activeHeroIndex].title}
                          </motion.h1>

                          <motion.div
                            key={`meta-${heroSlides[activeHeroIndex].id}`}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                            className="flex items-center gap-3 text-sm md:text-base text-white/80 font-semibold"
                          >
                            <span>{heroSlides[activeHeroIndex].country}</span>
                            <span className="text-white/40">•</span>
                            <span>{heroSlides[activeHeroIndex].category}</span>
                            <span className="text-white/40">•</span>
                            <span>{heroSlides[activeHeroIndex].reviews}</span>
                          </motion.div>

                          <motion.p
                            key={`desc-${heroSlides[activeHeroIndex].id}`}
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                            className="text-white/70 text-sm md:text-base leading-relaxed line-clamp-3 max-w-xl"
                          >
                            {heroSlides[activeHeroIndex].desc}
                          </motion.p>

                          <motion.div
                            key={`btns-${heroSlides[activeHeroIndex].id}`}
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
                            className="flex items-center gap-4 mt-2 pointer-events-auto"
                          >
                            <button
                              onClick={() => {
                                const slide = heroSlides[activeHeroIndex];
                                if (slide.isMap) {
                                  handleMapNavigation();
                                } else {
                                  const slug = toUrlSlug(slide.title);
                                  navigate(`/${username}/places/${slug}`);
                                }
                              }}
                              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg shadow-xl shadow-blue-500/20 transition-all hover:scale-105 cursor-pointer border-none"
                            >
                              {heroSlides[activeHeroIndex].isMap ? <span>🗺️ Open Full Map</span> : <span>See Details</span>}
                            </button>
                          </motion.div>
                        </div>

                        {/* Right Bottom Featured Thumbnail Row */}
                        {heroSlides.length > 1 && (
                          <div className="hidden lg:flex flex-col items-end max-w-[50%] z-20 pointer-events-auto">
                            <div className="flex gap-3 py-4 px-2">
                              {heroSlides.map((slide, index) => {
                                const isSelected = index === activeHeroIndex;
                                return (
                                  <button
                                    key={`thumb-${slide.id}`}
                                    onClick={() => setActiveHeroIndex(index)}
                                    className={`relative flex-shrink-0 w-32 aspect-video rounded-md overflow-hidden transition-all duration-300 cursor-pointer ${isSelected ? 'ring-2 ring-white scale-110 z-10 shadow-xl' : 'opacity-60 hover:opacity-100 hover:scale-105 filter brightness-75 hover:brightness-100'}`}
                                  >
                                    {slide.isMap ? (
                                      <div className="w-full h-full flex items-center justify-center bg-gray-900 border border-dashed border-white/20">
                                        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                        </svg>
                                      </div>
                                    ) : (
                                      <img
                                        src={slide.image}
                                        alt={slide.title}
                                        className="w-full h-full object-cover"
                                      />
                                    )}
                                    <div className="absolute inset-0 bg-black/20" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Carousel Hero Section - Mobile Layout */}
                <div className="md:hidden w-full mb-4 mt-4 touch-pan-y px-0">
                  <div className="relative w-full h-[65vh] min-h-[480px] max-h-[650px] overflow-x-hidden flex items-center justify-start py-8">
                    <div className="absolute inset-y-4 left-4 right-14">
                      {heroSlides.map((slide, i) => {
                        const diff = (i - activeHeroIndex + heroSlides.length) % heroSlides.length;

                        let position = "hiddenRight";
                        if (diff === 0) position = "active";
                        else if (diff === 1) position = "next";
                        else if (diff === 2) position = "nextNext";
                        else if (diff === heroSlides.length - 1) position = "hiddenLeft";

                        const variants = {
                          active: { x: 0, scale: 1, zIndex: 10, opacity: 1 },
                          next: { x: "12%", scale: 0.9, zIndex: 5, opacity: 1 },
                          nextNext: { x: "24%", scale: 0.8, zIndex: 4, opacity: 1 },
                          hiddenRight: { x: "40%", scale: 0.7, zIndex: 1, opacity: 0 },
                          hiddenLeft: { x: "-110%", scale: 1, zIndex: 11, opacity: 0 }
                        };

                        const handleDragEnd = (_e: any, { offset, velocity }: PanInfo) => {
                          if (offset.x < -50 || velocity.x < -300) {
                            setActiveHeroIndex((prev) => (prev + 1) % heroSlides.length);
                          } else if (offset.x > 50 || velocity.x > 300) {
                            setActiveHeroIndex((prev) => (prev - 1 + heroSlides.length) % heroSlides.length);
                          }
                        };

                        return (
                          <motion.div
                            key={slide.id}
                            variants={variants}
                            initial={false}
                            animate={position}
                            transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
                            drag={diff === 0 ? "x" : false}
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.8}
                            onDragEnd={handleDragEnd}
                            className={`absolute inset-0 h-full rounded-2xl overflow-hidden shadow-2xl bg-[#1a2332] border border-white/10 ${diff === 0 ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
                            onClick={() => {
                              if (diff === 0) {
                                if (slide.isMap) {
                                  handleMapNavigation();
                                } else {
                                  const slug = toUrlSlug(slide.title);
                                  navigate(`/${username}/places/${slug}`);
                                }
                              }
                            }}
                          >
                            {slide.isMap ? (
                              <div className="absolute inset-0 z-0 pointer-events-auto">
                                {!mapLoading && mapPreviewData.places.length > 0 ? (
                                  <Map
                                    defaultCenter={mapPreviewData.center}
                                    defaultZoom={mapPreviewData.zoom}
                                    mapId="mapPreviewMobile"
                                    style={{ height: "100%", width: "100%" }}
                                    scrollwheel={true}
                                    gestureHandling="greedy"
                                    disableDefaultUI={true}
                                    mapTypeId="satellite"
                                  >
                                    <MapPreviewController targetCoords={mapPreviewData.center} targetZoom={mapPreviewData.zoom} />
                                    {mapPreviewData.places.map((place: any, idx: number) => (
                                      <AdvancedMarker
                                        key={`marker-${idx}-${place.Geometry.lat}-${place.Geometry.lng}`}
                                        position={place.Geometry}
                                        onClick={(e) => {
                                          e.domEvent?.stopPropagation();
                                          setIsExpanded({
                                            visible: true,
                                            documentId: place.documentId,
                                            type: "place",
                                          });
                                        }}
                                      >
                                        <Pin
                                          background="red"
                                          borderColor="red"
                                          glyphColor="white"
                                        />
                                      </AdvancedMarker>
                                    ))}
                                  </Map>
                                ) : mapLoading ? (
                                  <div className="w-full h-full bg-dashboard-sidebar flex items-center justify-center">
                                    <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                  </div>
                                ) : (
                                  <div className="w-full h-full bg-dashboard-sidebar flex items-center justify-center">
                                    <span className="text-white text-xs">No locations available</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <img
                                src={slide.image}
                                alt={slide.title}
                                className="w-full h-full object-cover select-none pointer-events-none filter contrast-125"
                              />
                            )}

                            {/* Gradient dark overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10 pointer-events-none" />

                            {/* Featured Tag Banner */}
                            <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-auto z-20">
                              <div className="flex items-center pointer-events-none drop-shadow-md">
                                <span className="w-1 h-5 bg-yellow-400 mr-2 rounded-full inline-block"></span>
                                <h2 className="text-lg font-bold text-white tracking-tight">Featured</h2>
                              </div>
                            </div>

                            {/* Title & Metadata */}
                            <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-col gap-1.5 pointer-events-none z-20">
                              <h2 className="text-3xl font-poppins font-black text-white leading-tight drop-shadow-xl select-none">
                                {slide.title}
                              </h2>

                              <div className="flex flex-wrap items-center gap-2 text-xs text-white/80 font-semibold tracking-wide mt-1">
                                <span>{slide.country}</span>
                                <span className="text-white/40">•</span>
                                <span>{slide.category}</span>
                                <span className="text-white/40">•</span>
                                <span>{slide.reviews}</span>
                              </div>

                              <div className="flex items-center gap-3 mt-4 pointer-events-auto">
                                <button
                                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-full flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl border-none cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (slide.isMap) {
                                      handleMapNavigation();
                                    } else {
                                      const slug = toUrlSlug(slide.title);
                                      navigate(`/${username}/places/${slug}`);
                                    }
                                  }}
                                >
                                  {slide.isMap ? <span>🗺️ Open Map</span> : <span>See Details</span>}
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Check if user has any visible recommendation lists */}
            {PublishedCities && PublishedCities.length > 0 ? (
              <>
                <ShareModal
                  shareButtons={shareButtons}
                  isOpen={showShareModal}
                  onClose={() => setShowShareModal(false)}
                  url={
                    selectedCity?.List_Name
                      ? `${url}/${username}/places/${toUrlSlug(
                        selectedCity.List_Name
                      )}`
                      : `${url}/${username}/places`
                  }
                  utmParams={utmParams}
                  backgroundImage={
                    selectedCity?.List_Name_Details?.thumbnail ||
                    accountData?.bg_picture?.url ||
                    IMAGE_CONFIG.defaultImages.background
                  }
                />

                {/* Step Views */}
                {!placeSlug ? (
                  /* ========================================== */
                  /*        STEP 1: PLACES DASHBOARD            */
                  /* ========================================== */
                  <div className="px-4 max-w-4xl mx-auto w-full pb-16">
                    <div className="flex flex-col gap-8">
                      {PublishedCities.map((city: any, idx: number) => {
                        const citySlug = toUrlSlug(city.List_Name || "");
                        const placesList = city.recommended_places || [];
                        const count = placesList.length;

                        if (count === 0) return null;

                        return (
                          <div key={city.documentId || idx} className="flex flex-col gap-3">
                            <div className="flex justify-between items-end">
                              <div className="flex flex-col gap-0.5 max-w-[75%]">
                                <h2
                                  onClick={() => navigate(`/${username}/places/${citySlug}`)}
                                  className="text-base font-extrabold text-white cursor-pointer hover:text-blue-500 transition-colors duration-200 flex items-center gap-1.5"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    className="w-4 h-4 shrink-0 text-yellow-400"
                                  >
                                    <path
                                      fillRule="evenodd"
                                      clipRule="evenodd"
                                      d="M12 2C8.14 2 5 5.14 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                                    />
                                  </svg>
                                  <span>{city.List_Name}</span>
                                </h2>
                              </div>
                              <button
                                onClick={() => navigate(`/${username}/places/${citySlug}`)}
                                className="text-xs font-bold text-blue-500 hover:text-blue-400 transition-colors flex items-center gap-0.5 border-none bg-transparent cursor-pointer"
                              >
                                See All ➔
                              </button>
                            </div>

                            {/* Horizontal Cards Scrollable list */}
                            <div
                              className="flex gap-4 overflow-x-auto pt-2 pb-4 px-1 -mt-2 scrollbar-hide"
                              style={{ scrollbarWidth: "none" }}
                            >
                              {placesList.map((place: any) => {
                                const isPersonType = place?.Recommendation_Type === "person";
                                return (
                                  <PublicPlaceCard
                                    key={place.documentId}
                                    onAction={() =>
                                      setIsExpanded({
                                        visible: true,
                                        documentId: place.documentId,
                                        type: isPersonType ? "person" : "place",
                                      })
                                    }
                                    image={
                                      isPersonType
                                        ? getPersonImageUrl(place)
                                        : (place?.media_details?.thumbnail?.url ||
                                          place?.Media?.[0]?.url ||
                                          place?.Place_Details?.Photos?.[0] ||
                                          IMAGE_CONFIG.defaultImages.place)
                                    }
                                    title={isPersonType ? (place.Contact_Name || "") : (place.Place_Details?.Title || "")}
                                    rating={!isPersonType ? place.Place_Details?.Rating : undefined}
                                    reviews={!isPersonType ? place.Place_Details?.Rating_Count : undefined}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* ========================================== */
                  /*        STEP 2: SINGLE LIST GRID VIEW       */
                  /* ========================================== */
                  <div className="max-w-4xl mx-auto w-full px-4 pb-16">
                    <div className="flex flex-col gap-4">
                      {/* Sticky Top Header Info with Back arrow button directly above */}
                      <div className="flex flex-col border-b border-white/10 pb-4 mb-2">
                        <button
                          onClick={() => navigate(`/${username}/places`)}
                          className="text-xs font-bold text-white/50 hover:text-white flex items-center gap-1.5 pt-4 mb-2 w-fit bg-transparent border-none p-0 cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          {username}'s Places
                        </button>
                        <h2 className="text-2xl font-black text-white leading-tight">
                          {selectedCityName}
                        </h2>
                        <p className="text-xs text-white/50 leading-relaxed mt-1">
                          {locationNote || "Explore my curated recommendations."}
                        </p>
                      </div>

                      {/* Tab Switcher */}
                      {(filteredPlaces?.length > 0 || linkedPeople.length > 0 || linkedProducts.length > 0) && (
                        <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl w-fit mb-4">
                          {([
                            { key: "places", label: "Places", count: filteredPlaces?.length || 0 },
                            { key: "people", label: "People", count: linkedPeople.length },
                            { key: "products", label: "Products", count: linkedProducts.length },
                          ] as const).map(({ key, label, count }) => (
                            <button
                              key={key}
                              onClick={() => setActiveTab(key)}
                              className={`relative px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
                                activeTab === key
                                  ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                                  : "text-gray-400 hover:text-white"
                              }`}
                            >
                              {label}
                              {count > 0 && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                  activeTab === key ? "bg-white/20" : "bg-white/10"
                                }`}>{count}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Places Tab Content */}
                      {activeTab === "places" && (
                        <>
                          {/* Category Tag Selection */}
                          <div className="overflow-x-auto scrollbar-hide py-1">
                            {categories && categories.length >= 1 && (
                              <div className="flex gap-2">
                                <Button
                                  btnText={"All"}
                                  type="button"
                                  variant={selectedCategory === "" ? "tagSelected" : "tag"}
                                  onClickHandler={() => setSelectedCategory("")}
                                  size="xsmall"
                                />
                                {categories?.map((tag: string, index: number) => (
                                  <Button
                                    key={index}
                                    btnText={tag}
                                    type="button"
                                    variant={selectedCategory === tag ? "tagSelected" : "tag"}
                                    onClickHandler={() => setSelectedCategory(tag)}
                                    size="xsmall"
                                  />
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Places Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mt-4">
                            {placesQueryLoading && !filteredPlaces?.length ? (
                              <RecommendationCardSkeleton count={6} />
                            ) : filteredPlaces?.length ? (
                              <>
                                {filteredPlaces?.map((place: CardDataItem) => {
                                  const isPersonType = place?.Recommendation_Type === "person";

                                  return (
                                    <PublicPlaceCard
                                      key={place.documentId}
                                      onAction={() =>
                                        setIsExpanded({
                                          visible: true,
                                          documentId: place.documentId,
                                          type: "place",
                                        })
                                      }
                                      className="w-full h-[155px] md:h-[180px]"
                                      image={
                                        isPersonType
                                          ? getPersonImageUrl(place)
                                          : (place?.media_details?.thumbnail?.url ||
                                            place?.Media?.[0]?.url ||
                                            place?.Place_Details?.Photos?.[0] ||
                                            IMAGE_CONFIG.defaultImages.place)
                                      }
                                      title={isPersonType ? (place.Contact_Name || "") : (place.Place_Details?.Title || "")}
                                      rating={!isPersonType ? place.Place_Details?.Rating : undefined}
                                      reviews={!isPersonType ? place.Place_Details?.Rating_Count : undefined}
                                    />
                                  );
                                })}
                                {/* Observer target for infinite scroll */}
                                <div ref={desktopObserverTarget} className="h-10 w-full col-span-2" />
                              </>
                            ) : (
                              <h1 className="flex text-white items-center justify-center font-poppins font-semibold col-span-2 py-8">
                                No Recommendation Available.
                              </h1>
                            )}
                          </div>
                        </>
                      )}

                      {/* People Tab Content */}
                      {activeTab === "people" && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mt-4">
                          {linkedPeople.length === 0 ? (
                            <h1 className="flex text-white items-center justify-center font-poppins font-semibold col-span-3 py-8">
                              No People linked to this location.
                            </h1>
                          ) : (
                            linkedPeople.map((person: any, index: number) => {
                              const avatarSrc = person.media_details?.thumbnail?.url || person.media_details?.imageDetails?.[0]?.url || (person.avatar_path ? buildImageUrl(person.avatar_path) : null) || null;
                              return (
                                <div
                                  key={person.documentId || `linked-person-${index}`}
                                  className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col gap-3 hover:border-blue-500/40 transition-all cursor-pointer"
                                  onClick={() => setSelectedPerson(person)}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-violet-950/40 ring-2 ring-white/10">
                                      {avatarSrc ? (
                                        <img src={avatarSrc} alt={person.name} className="w-full h-full object-cover" loading="lazy" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-violet-900/20">
                                          <Users size={16} className="text-violet-400/40" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-sm text-white truncate">{person.name}</p>
                                      {person.headline && <p className="text-xs text-gray-400 truncate">{person.headline}</p>}
                                    </div>
                                  </div>
                                  {person.skills_tags && person.skills_tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {person.skills_tags.slice(0, 3).map((tag: string) => (
                                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">{tag}</span>
                                      ))}
                                    </div>
                                  )}
                                  <p className="text-[10px] text-gray-500">List: {person._listName}</p>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}

                      {/* Products Tab Content */}
                      {activeTab === "products" && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mt-4">
                          {linkedProducts.length === 0 ? (
                            <h1 className="flex text-white items-center justify-center font-poppins font-semibold col-span-3 py-8">
                              No Products linked to this location.
                            </h1>
                          ) : (
                            linkedProducts.map((product: any, index: number) => (
                              <div
                                key={product.documentId || `linked-product-${index}`}
                                className="bg-white/5 border border-white/5 rounded-xl overflow-hidden hover:border-blue-500/40 transition-all cursor-pointer flex flex-col justify-between"
                                onClick={() => setSelectedProduct(product)}
                              >
                                <div className="h-32 bg-black/40 flex items-center justify-center overflow-hidden">
                                  {product.logo_url ? (
                                    <img src={product.logo_url} alt={product.title} className="h-full w-full object-cover" loading="lazy" />
                                  ) : (
                                    <ShoppingBag size={32} className="text-orange-400/30" />
                                  )}
                                </div>
                                <div className="p-3">
                                  <p className="font-semibold text-sm text-white truncate">{product.title}</p>
                                  {product.brand && <p className="text-xs text-gray-400 truncate">{product.brand}</p>}
                                  {product.price != null && (
                                    <p className="text-xs text-blue-400 font-semibold mt-1">{product.currency || ""} {product.price}</p>
                                  )}
                                  <p className="text-[10px] text-gray-500 mt-1">List: {product._listName}</p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Floating Map Toggle button - Glassy Blue FAB */}
                {PublishedCities && PublishedCities.length > 0 && (
                  <div className="fixed bottom-[4.2rem] md:bottom-16 left-1/2 -translate-x-1/2 z-40 bg-black/35 rounded-full p-1 backdrop-blur-md border border-white/10 shadow-lg shadow-blue-500/20 transition-all duration-300">
                    <Button
                      startIcon={
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" className="mr-1">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                      }
                      btnText="Map View"
                      variant="primary"
                      size="xsmall"
                      onClickHandler={handleMapNavigation}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold tracking-wide rounded-full px-5 py-2 hover:scale-105 transition-all duration-200"
                    />
                  </div>
                )}

                {showQR && (
                  <QRModal
                    isOpen={showQR}
                    onClose={() => {
                      setShowQR(false);
                      setIsQRVisible(false);
                    }}
                    qrValue={qrValue}
                    onCopyLink={handleCopyLink}
                    title="Profile QR Code"
                    qrSize="medium"
                  />
                )}

                {isExpanded.visible && (
                  <div className="fixed inset-0 bg-black md:bg-opacity-40 md:backdrop-blur-md z-[150]"></div>
                )}
                <div
                  className={`fixed md:max-w-4xl md:mx-auto inset-x-0 bottom-0 top-0 z-[150] transition-transform duration-300 ease-in-out overflow-x-hidden ${isExpanded.visible ? "translate-y-0" : "translate-y-full"
                    }`}
                >
                  {isExpanded.visible && (
                    <PlaceOverview
                      placeId={isExpanded.documentId}
                      onClose={() =>
                        setIsExpanded({ visible: false, documentId: null, type: null })
                      }
                      isPublicProfile={true}
                    />
                  )}
                </div>

                {/* Product Detail Modal */}
                <ProductDetailModal
                  open={!!selectedProduct}
                  product={selectedProduct}
                  onClose={() => setSelectedProduct(null)}
                />

                {/* Person Detail Modal */}
                <PersonDetailModal
                  open={!!selectedPerson}
                  person={selectedPerson}
                  onClose={() => setSelectedPerson(null)}
                />
              </>
            ) : (
              /* Empty State - Show consistent profile with 0 places and 0 contributions */
              <>
                <ShareModal
                  shareButtons={shareButtons}
                  isOpen={showShareModal}
                  onClose={() => setShowShareModal(false)}
                  url={`${url}/${username}/places`}
                  backgroundImage={
                    accountData?.bg_picture?.url ||
                    IMAGE_CONFIG.defaultImages.background
                  }
                />

                {/* Empty State Content */}
                <div className="flex-grow flex flex-col items-center justify-center px-4 py-16">
                  <div className="text-center max-w-md">
                    <h3 className="text-xl font-poppins font-semibold text-white mb-4">
                      No Places Yet
                    </h3>
                    <p className="text-gray-400 text-sm mb-8">
                      {accountData?.Account_Name} hasn't shared any
                      recommendations yet. Check back later for amazing places
                      to discover!
                    </p>

                    <div className="flex justify-center items-center">
                      <Location
                        size={64}
                        fill="#9FDAFF"
                        className="w-16 h-16"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          /* Profile not found */
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-white text-center">
              <h2 className="text-lg font-poppins font-semibold mb-2">
                Profile not found
              </h2>
              <p className="text-gray-400 text-sm">
                This user profile is not available.
              </p>
            </div>
          </div>
        )}

        {/* CircularPlacesModal */}
        {showAllPlaces && (
          <CircularPlacesModal
            isOpen={showAllPlaces}
            onClose={() => setShowAllPlaces(false)}
            places={PublishedCities || []}
            handleCitySelect={handleCitySelect}
          />
        )}
      </div>
    </>
  );
});

export default PublicHome;
