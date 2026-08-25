import { useQuery } from "@apollo/client";
import { memo, useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTrackAnalytics } from "../../../../services/analyticsService";
import {
  accountsDetailsByPlace,
  getUserMobileNumberQuery,
  getUserMobileStatusQuery,
} from "../../api/query";
import RecommendationCardSkeleton from "../../../../components/ui/RecommendationCardSkeleton";
import HeroSkeleton from "../../../../components/ui/HeroSkeleton";
import Button from "../../../../components/ui/Button";
import InstagramIcon from "../../../../assets/icons/InstagramIcon";
import BoldLinkIcon from "../../../../assets/icons/BoldLinkIcon";
import Carousel from "../../../../components/ui/Carousel";
import WhiteMap from "../../../../assets/icons/WhiteMap";
import Card from "../../../../components/ui/Card";
import PlaceOverview from "./PlaceOverview";
import PersonOverview from "./PersonOverview";
import MobileIcon from "../../../../assets/icons/MobileIcon";
import WhatsappIcon from "../../../../assets/icons/WhatsappIcon";
import { buildWhatsAppHref } from "../../../../utils/url";
import { IMAGE_CONFIG } from "../../../../config";
import { selectPlaceCardImage } from "../../utils/placeMedia";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import { createLocationGEOData } from "../../../../utils/geoHelpers";

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
  user_rating?: number | null;
  google_rating?: number | null;
  recommendation_category: {
    Category_Name: string;
  };
  documentId: string;
};

interface City {
  List_Name?: string;
  recommended_places?: CardDataItem[];
  imageUrl?: string;
  documentId?: string;
  List_Name_Details?: {
    thumbnail?: string;
  };
}

// Helper function to get person image with avatar fallback
const getPersonImageUrl = (data: CardDataItem): string => {
  const imageUrl = data?.media_details?.thumbnail?.url || data?.media_details?.imageDetails?.[0]?.url || data?.Media?.[0]?.url;
  if (imageUrl) return imageUrl;

  // Return data URL for inline SVG avatar
  const svgString = `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="400" fill="#1a1a1a"/><circle cx="200" cy="160" r="70" fill="#2a2a2a"/><circle cx="200" cy="160" r="50" fill="#3a3a3a"/><ellipse cx="200" cy="320" rx="100" ry="80" fill="#3a3a3a"/><circle cx="200" cy="200" r="120" fill="none" stroke="#2a2a2a" stroke-width="2" opacity="0.3"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svgString)}`;
};

const PlaceDetails = memo(() => {
  // username from params
  const { username, place } = useParams();
  // navigate hook
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState<{
    visible: boolean;
    documentId: string | null;
  }>({
    visible: false,
    documentId: null,
  });

  // accounts data query
  const { data, loading } = useQuery(accountsDetailsByPlace, {
    variables: {
      filters: {
        username: {
          eq: username,
        },
      },
      listFilters: {
        List_Name: {
          eq: place,
        },
      },
    },
  });

  // accessing the account data
  const accountData = data?.accounts[0];

  const { data: visiblity } = useQuery(getUserMobileStatusQuery, {
    variables: {
      documentId: accountData?.documentId,
    },
  });

  const { data: mobileNumber } = useQuery(getUserMobileNumberQuery, {
    variables: {
      documentId: accountData?.documentId,
    },
    skip: !visiblity?.account?.mobile_number_visibility,
  });

  // filtering on the basis of visiblity
  const PublishedCities = accountData?.recommendation_lists.filter(
    (list: {
      List_Name: string;
      Visibility: boolean;
      recommended_places: string[];
    }) => list.Visibility === true
  );

  // local state for handling the current active city
  const [selectedCity, setSelectedCity] = useState<City | undefined>(undefined);
  // handling the default city
  useEffect(() => {
    if (accountData?.recommendation_lists?.length) {
      setSelectedCity(accountData.recommendation_lists[0]);
    }
  }, [accountData]);

  const handleCitySelect = (city: City) => {
    setSelectedCity(city);
  };

  // Analytics tracking
  const analytics = useTrackAnalytics({
    accountId: accountData?.documentId || "",
    locationId: selectedCity?.documentId || undefined,
    recommendationId: undefined,
    pageName: "public-profile",
    pageUsername: username,
    autoTrackView: false, // Don't auto-track page view, only track engagement views
  });

  // Track recommendation engagement views when card is opened
  useEffect(() => {
    if (isExpanded.visible && isExpanded.documentId && accountData?.documentId && selectedCity?.documentId) {
      // Find the clicked item to get its details
      const clickedItem = selectedCity?.recommended_places?.find(
        (place: CardDataItem) => place.documentId === isExpanded.documentId
      );

      if (clickedItem) {
        const isPersonType = clickedItem?.Recommendation_Type === "person";
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
  }, [isExpanded.visible, isExpanded.documentId, accountData?.documentId, selectedCity?.documentId, selectedCity?.recommended_places, analytics]);



  // Enhanced dynamic SEO that updates when specific place is clicked/expanded
  const profileName = accountData?.Account_Name || username || "User";
  const locationName = selectedCity?.List_Name || place || "Location";
  const placesCount = selectedCity?.recommended_places?.length || 0;

  const currentExpandedPlace = isExpanded.documentId
    ? selectedCity?.recommended_places?.find((place: CardDataItem) => place.documentId === isExpanded.documentId)
    : null;

  // ENHANCEMENT: Extract comprehensive place data for SEO
  const placeTitle = currentExpandedPlace?.Place_Details?.Place_Name || currentExpandedPlace?.Place_Details?.Title || "";
  const placeAddress = currentExpandedPlace?.Place_Details?.Place_Address || "";
  const placeCategory = currentExpandedPlace?.recommendation_category?.Category_Name || "";

  const placeSocialLinks = useMemo(() => {
    if (!currentExpandedPlace) return [];
    const links = [];

    if ((currentExpandedPlace as any).Places_Social_Link) links.push('social media');
    if ((currentExpandedPlace as any).Places_Website) links.push('website');
    if ((currentExpandedPlace as any).Contact_Number) links.push('phone');
    if ((currentExpandedPlace as any).Instagram_Link) links.push('instagram');
    if ((currentExpandedPlace as any).Facebook_Link) links.push('facebook');
    if ((currentExpandedPlace as any).Twitter_Link) links.push('twitter');

    return links;
  }, [currentExpandedPlace]);

  const placeRecommendationLink = (currentExpandedPlace as any)?.Users_Social_URL ||
    (currentExpandedPlace as any)?.recommendation_social_link ||
    "";

  const whyRecommendContent = (currentExpandedPlace as any)?.user_recommendation_note ||
    (currentExpandedPlace as any)?.why_recommend ||
    (currentExpandedPlace as any)?.recommendation_note ||
    "";

  // Enhanced SEO for place-specific expanded view (PLACES MAP PAGE SEO)
  const placeSeoConfig = currentExpandedPlace ? {
    title: `${profileName} | ${placeTitle} in ${locationName}`,
    description: `${placeTitle} at ${placeAddress}. ${placeCategory} recommended by ${profileName}. Find exact location on map.${whyRecommendContent ? ` ${whyRecommendContent.substring(0, 80)}...` : ''}`,
    keywords: [
      placeTitle,
      placeCategory,
      placeAddress.split(',')[0] || placeAddress, // Address area
      'map location',
      profileName,
      `${placeTitle} ${placeCategory}`,
      `${placeTitle} location`,
      `${profileName} recommendation`,
      'exact location',
      'place details',
      'local recommendation',
      'map view',
      'place info',
      ...placeSocialLinks,
      'recommended spot',
      'local spot'
    ].filter(Boolean),
    canonical: place ? createCanonicalUrl(`/${username}/places/${place}`) : createCanonicalUrl(`/${username}/places`),
    type: "place" as const
  } : null;

  const whyRecommendPreview = whyRecommendContent ?
    whyRecommendContent.replace(/<[^>]*>/g, '').substring(0, 150) : "";

  // Enhanced place details for comprehensive SEO
  const allPlacesDetails = selectedCity?.recommended_places?.map((place: CardDataItem) => {
    return {
      name: place?.Place_Details?.Place_Name || place?.Place_Details?.Title || "",
      category: place?.recommendation_category?.Category_Name || "",
      rating: place?.Place_Details?.Rating || null,
      address: place?.Place_Details?.Place_Address || ""
    };
  }).filter(place => place.name) || [];

  // Featured places for description (first 4 for better coverage)
  const featuredPlacesDetails = allPlacesDetails.slice(0, 4);

  const featuredPlacesText = featuredPlacesDetails.length > 0
    ? featuredPlacesDetails
      .map(place => {
        let description = place.name;
        if (place.category) description += ` (${place.category})`;
        if (place.rating) description += ` ⭐${place.rating}`;
        return description;
      })
      .join(', ')
    : '';

  // Enhanced comprehensive place categories summary
  const categorySummary = Array.from(new Set(allPlacesDetails.map(p => p.category).filter(Boolean)))
    .slice(0, 3).join(', ');

  // Get place categories for analysis
  const currentPlaceCategories = selectedCity?.recommended_places?.map((place: CardDataItem) =>
    place?.recommendation_category?.Category_Name
  ).filter(Boolean) || [];

  // Enhanced place count by category for richer descriptions
  const categoryBreakdown = currentPlaceCategories.reduce((acc: any, category: string) => {
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  const categoryText = Object.entries(categoryBreakdown)
    .slice(0, 2)
    .map(([cat, count]) => `${count as number} ${cat.toLowerCase()}${(count as number) > 1 ? 's' : ''}`)
    .join(', ');

  const recommendationNote = accountData?.recommendation_lists?.find((list: any) => list.List_Name === place)?.Note || "";
  const notePreview = recommendationNote ? recommendationNote.substring(0, 100).replace(/<[^>]*>/g, '') : "";

  // ENHANCED meta description with comprehensive place data
  const metaDescription = currentExpandedPlace
    ? `${placeTitle} in ${locationName} recommended by ${profileName}. ${placeCategory ? placeCategory + '. ' : ''}${placeAddress ? `Located at ${placeAddress.split(',')[0]}. ` : ''}${whyRecommendPreview ? (whyRecommendPreview.length > 100 ? whyRecommendPreview.substring(0, 100) + '...' : whyRecommendPreview) + ' ' : ''}${placeSocialLinks.length > 0 ? `Connect via ${placeSocialLinks.join(', ')}. ` : ''}${placeRecommendationLink ? `More info: ${placeRecommendationLink}` : 'Discover why this spot is recommended.'}`
    : notePreview && featuredPlacesText && categoryText
      ? `Explore ${locationName} with ${profileName}'s ${placesCount} local recommendations including ${categoryText}. Featured spots: ${featuredPlacesText}${placesCount > 4 ? ' and more' : ''}. ${notePreview.length >= 80 ? notePreview.substring(0, 80) + '...' : notePreview}`
      : featuredPlacesText && categoryText
        ? `Discover ${placesCount} curated places in ${locationName} by ${profileName}. Includes ${categoryText}${categorySummary ? ` across ${categorySummary}` : ''}. Featured: ${featuredPlacesText}${placesCount > 4 ? ' and more hidden gems' : ''}.`
        : featuredPlacesText
          ? `Discover ${placesCount} amazing places recommended by ${profileName} in ${locationName}. Featured places: ${featuredPlacesText}${placesCount > 4 ? ' and more' : ''}. Explore the best local spots and hidden gems.`
          : notePreview && placesCount > 0
            ? `Explore ${locationName} through ${profileName}'s ${placesCount} recommendations${categorySummary ? ` including ${categorySummary}` : ''}. ${notePreview.length >= 120 ? notePreview.substring(0, 120) + '...' : notePreview}`
            : placesCount > 0
              ? `Discover ${placesCount} curated recommendations for ${locationName} by ${profileName}${categorySummary ? ` featuring ${categorySummary}` : ''}. Explore the best local spots, hidden gems, and must-visit places.`
              : `Explore ${locationName} through ${profileName}'s local guide. Discover authentic recommendations and hidden gems from a local perspective.`;
  // Use the already defined currentPlaceCategories
  const placeCategories = currentPlaceCategories;

  // Dynamic page title based on location and content
  const pageTitle = placesCount > 0
    ? `${profileName} | ${locationName} Recommendations | explorers`
    : `${profileName} | ${locationName} Local Guide | explorers`;

  const allPlaceNames = selectedCity?.recommended_places?.map((place: CardDataItem) => {
    return place?.Place_Details?.Place_Name || place?.Place_Details?.Title || "";
  }).filter(Boolean) || [];

  // ENHANCED keywords with all place data
  const dynamicKeywords = [
    'local guide',
    `${locationName}`,
    'recommendations',
    'travel tips',
    `${profileName} recommendations`,
    `${locationName} travel guide`,
    'local insights',
    'hidden gems',
    'best places',
    ...(currentExpandedPlace ? [
      placeTitle,
      `${placeTitle} ${locationName}`,
      placeCategory,
      `${placeCategory} ${locationName}`,
      `best ${placeCategory}`,
      ...(placeAddress ? placeAddress.split(',').slice(0, 2).map(part => part.trim()).filter(Boolean) : []),
      ...placeSocialLinks,
      ...(whyRecommendContent ? whyRecommendContent.split(/\s+/).filter((word: string) => word.length > 3).slice(0, 5) : []),
      'recommendation link',
      'social media',
      'contact info',
      'connect',
      'visit',
      'experience'
    ].filter(Boolean) : []),
    ...Array.from(new Set(placeCategories)).map(category => `${category} ${locationName}`),
    ...Array.from(new Set(placeCategories)).map(category => `best ${category}`),
    ...allPlaceNames,
    ...allPlaceNames.map(placeName => `${placeName} ${locationName}`),
    `${locationName} places`,
    `things to do ${locationName}`,
    `${profileName} ${locationName}`,
    'local recommendations',
    'travel guide',
    'local expert',
    'authentic experience'
  ].filter(Boolean);

  // Profile image for social sharing
  const profileImage = accountData?.profile_picture?.url || accountData?.bg_picture?.url;

  // Create canonical URL for location pages
  const currentUrl = createCanonicalUrl(`/${username}/places/${place}`);

  // Generate GEO data for enhanced structured data
  const geoData = createLocationGEOData({
    locationName: locationName,
    recommenderName: profileName,
    placesCount: placesCount,
    topCategories: Array.from(new Set(placeCategories)).slice(0, 3),
    locationNote: notePreview || `Curated recommendations for ${locationName}`
  });



  return (
    <>
      <SEO
        key={`${selectedCity?.documentId || 'default'}-${isExpanded.documentId || 'none'}`}
        title={currentExpandedPlace && placeSeoConfig ? placeSeoConfig.title : pageTitle}
        description={currentExpandedPlace && placeSeoConfig ? placeSeoConfig.description : metaDescription}
        keywords={currentExpandedPlace && placeSeoConfig ? placeSeoConfig.keywords : dynamicKeywords}
        canonical={currentExpandedPlace && placeSeoConfig ? placeSeoConfig.canonical : currentUrl}
        image={profileImage}
        url={currentExpandedPlace && placeSeoConfig ? placeSeoConfig.canonical : currentUrl}
        type={currentExpandedPlace && placeSeoConfig ? "article" : "website"}
        author={profileName}
        siteName="explorers"
        enableGEO={true}
        geoData={geoData}
      />

      <div className="relative pb-28 md:pb-4 bg-black min-h-screen">
        {loading ? (
          <>
            {/* ── Hero skeleton — Desktop ── */}
            <div className="hidden md:block w-full mb-6 mt-4 px-4">
              <div className="max-w-5xl mx-auto">
                <HeroSkeleton accentColor="blue" showThumbnails={false} />
              </div>
            </div>
            {/* ── Hero skeleton — Mobile ── */}
            <div className="md:hidden w-full mb-4 mt-4">
              <HeroSkeleton accentColor="blue" mobile showThumbnails={false} />
            </div>
            {/* ── Card grid skeleton ── */}
            <div className="md:max-w-5xl md:mx-auto">
              <div className="p-4 mt-6 grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                <RecommendationCardSkeleton count={6} />
              </div>
            </div>
          </>
        ) : (
          accountData?.recommendation_lists && (
            <>
              <div
                className="relative rounded-b-xl"
                style={{
                  backgroundImage: `url(${accountData.bg_picture?.url ||
                    IMAGE_CONFIG.defaultImages.background
                    })`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <div className="absolute inset-0 bg-black bg-opacity-50 z-10 rounded-b-xl"></div>
                <span className="p-4 md:hidden flex font-poppins items-center justify-center text-white font-semibold z-30">
                  explorers
                </span>

                <h1
                  className="p-4 hidden md:flex md:justify-center cursor-pointer z-20"
                  onClick={() => navigate("/")}
                >
                  <span className="text-white font-bold text-2xl">
                    explorers.earth
                  </span>
                </h1>

                <div className="relative z-20 flex flex-col items-center pb-6">
                  <img
                    src={accountData.profile_picture?.url || IMAGE_CONFIG.defaultImages.profile}
                    alt={accountData.Account_Name}
                    className="w-24 h-24 rounded-full border border-white shadow-lg"
                  />
                  <h2 className="text-white  font-poppins font-semibold mt-2">
                    {accountData.Account_Name}
                  </h2>
                  <p className="text-white/80 text-sm font-poppins">
                    {accountData.Account_Type}
                  </p>

                  <div className="flex gap-10 mt-3 pb-4">
                    {accountData.social_media.instagram && (
                      <a
                        href={`https://${accountData.social_media.instagram}`}
                        target="_blank"
                      >
                        <InstagramIcon color="white" />
                      </a>
                    )}
                    {accountData.social_media.whatsapp && (
                      <a
                        href={buildWhatsAppHref(
                          accountData.social_media.whatsapp
                        )}
                        target="_blank"
                      >
                        <WhatsappIcon fill="white" />
                      </a>
                    )}
                    {visiblity?.account?.mobile_number_visibility && (
                      <a
                        href={`sms:+${mobileNumber?.account?.mobile_number}`}
                        target="_blank"
                      >
                        <MobileIcon fill="white" />
                      </a>
                    )}
                    {accountData.social_media.explorers && (
                      <a
                        href={`https://${accountData.social_media.explorers}`}
                        target="_blank"
                      >
                        <BoldLinkIcon color="white" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="my-6">
                <Carousel
                  type="public"
                  items={PublishedCities}
                  onClickHandler={handleCitySelect}
                />
              </div>
            </>
          )
        )}
        <div className="fixed bottom-[3.8rem] md:bottom-16 left-1/2 -translate-x-1/2 z-40 bg-black/20 rounded-lg p-0.5 backdrop-blur-sm">
          <Button
            startIcon={<WhiteMap />}
            btnText="Map View"
            variant="primary"
            size="xsmall"
            onClickHandler={() =>
              navigate(`/${username}/places/${place}/placesmap`)
            }
            className="bg-[hsl(var(--blue-cta))] hover:bg-[hsl(var(--blue-final))] shadow-lg shadow-blue-500/20"
          />
        </div>
        <div className="md:max-w-5xl md:mx-auto">
          <div className="p-4 mt-6 grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
            {PublishedCities?.length > 0 &&
              selectedCity?.recommended_places?.length ? (
              selectedCity.recommended_places.map((place: CardDataItem) => {
                const isPersonType = place?.Recommendation_Type === "person";

                return (
                  <Card
                    cardType="default"
                    key={place.documentId}
                    recommendationType={isPersonType ? "person" : "place"}
                    image={
                      isPersonType
                        ? getPersonImageUrl(place)
                        : selectPlaceCardImage(
                          place,
                          selectedCity?.List_Name_Details?.thumbnail,
                          IMAGE_CONFIG.defaultImages.place,
                        )
                    }
                    onClickhandler={() =>
                      setIsExpanded({
                        visible: true,
                        documentId: place.documentId,
                      })
                    }
                    title={isPersonType ? place.Contact_Name : place.Place_Details?.Title}
                    rating={
                      !isPersonType
                        ? (place.user_rating ?? (place.google_rating ? place.google_rating * 2 : (place.Place_Details?.Rating ? place.Place_Details.Rating * 2 : undefined)))
                        : undefined
                    }
                    reviews={!isPersonType ? place.Place_Details?.Rating_Count : undefined}
                  />
                );
              })
            ) : loading ? (
              <RecommendationCardSkeleton count={6} />
            ) : (
              <h1 className="flex text-white items-center justify-center font-poppins font-semibold">
                No Recommendation Available.
              </h1>
            )}
          </div>
        </div>
        {isExpanded.visible && (
          <div className="fixed inset-0 bg-black md:bg-opacity-40 md:backdrop-blur-md z-[150]"></div>
        )}
        <div
          className={`fixed md:max-w-4xl md:mx-auto inset-x-0 bottom-0 top-0 z-[150] transition-transform duration-300 ease-in-out overflow-x-hidden ${isExpanded.visible ? "translate-y-0" : "translate-y-full"
            }`}
        >
          {isExpanded.visible && (() => {
            // Find the clicked item to determine its type
            const clickedItem = selectedCity?.recommended_places?.find(
              (item) => item.documentId === isExpanded.documentId
            );
            const isPersonType = clickedItem?.Recommendation_Type === "person";

            return isPersonType ? (
              <PersonOverview
                personId={isExpanded.documentId}
                onClose={() => setIsExpanded({ visible: false, documentId: null })}
                isPublicProfile={true}
              />
            ) : (
              <PlaceOverview
                placeId={isExpanded.documentId}
                onClose={() => setIsExpanded({ visible: false, documentId: null })}
                isPublicProfile={true}
              />
            );
          })()}
        </div>
      </div>
    </>
  );
});

export default PlaceDetails;
