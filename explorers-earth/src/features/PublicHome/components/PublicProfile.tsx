import { getThemeTokenStyles } from "../../Profile/constants/themePresets";
import {
  getPreferredRecommendationCategory,
  isRecommendationCategoryVisible,
  normalizeThemeSettings,
  resolveInitialPublicProfileTab,
  type PublicProfileTab,
} from "../../Profile/constants/recommendationsPresentation";
import { RECOMMENDATION_CATEGORY_IDS } from "../../Profile/types/themeTypes";
import PublicProfileFooter from "./PublicProfileFooter";
import { useQuery } from "@apollo/client";
import { memo, useEffect, useState, useMemo, type KeyboardEvent } from "react";
import { Link, useParams, useNavigate, useOutletContext } from "react-router-dom";
import { getPublicProfileDataQuery, getUserMobileNumberQuery } from "../api/query";
import { useTrackAnalytics, createAnalyticsOptions } from "../../../services/analyticsService";
import WhatsappIcon from "../../../assets/icons/WhatsappIcon";
import MobileIcon from "../../../assets/icons/MobileIcon";
import InstagramIcon from "../../../assets/icons/InstagramIcon";
import BoldLinkIcon from "../../../assets/icons/BoldLinkIcon";
import YoutubeIcon from "../../../assets/icons/YoutubeIcon";
import TwitterIcon from "../../../assets/icons/TwitterIcon";
import Spotify from "../../../assets/icons/Spotify";
import Gmail from "../../../assets/icons/Gmail";
import FacebookIcon from "../../../assets/icons/FacebookIcon";
import YoutubeMusic from "../../../assets/icons/YoutubeMusic";
import LinkedinIcon from "../../../assets/icons/LinkedinIcon";
import AppleMusic from "../../../assets/icons/AppleMusic";
import TiktokIcon from "../../../assets/icons/TiktokIcon";
import SnapchatIcon from "../../../assets/icons/SnapchatIcon";
import MusicNote from "../../../assets/icons/MusicNote";
import { IMAGE_CONFIG } from "../../../config";
import FeedLayout from "../../../components/ui/FeedLayout";
import FeedIcon from "../../../assets/icons/FeedIcon";
import Location from "../../../assets/icons/Location";
import MediaViewer from "../../../components/ui/MediaViewer";
import {
  useMediaViewer,
  convertToMediaItems,
} from "../../../hooks/useMediaViewer";
import { buildWhatsAppHref } from "../../../utils/url";
import SEO from "../../../components/SEO";
import { createCanonicalUrl } from "../../../utils/getCurrentDomain";
import { createProfileGEOData } from "../../../utils/geoHelpers";
import { toast } from "sonner";
import ProfileRecommendationsTab from "./ProfileRecommendationsTab";
import {
  normalizePublicEmailHref,
  normalizePublicWebHref,
  sanitizePublicRichText,
} from "../utils/publicProfileContent";

// Memoized FeedLayout to prevent unnecessary re-renders
const MemoizedFeedLayout = memo(FeedLayout);

const parseBusinessLocationData = (value: unknown): Record<string, any> | null => {
  if (!value) return null;

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, any>)
      : null;
  } catch {
    return null;
  }
};

const ProfileSkeleton = memo(() => {
  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Cover Photo Shimmer */}
      <div className="relative h-[380px] md:h-[420px] bg-white/5 skeleton-shimmer w-full rounded-b-[2rem] md:rounded-none overflow-hidden" />
      
      {/* Profile Pic, Name, Bio Skeletons */}
      <div className="relative z-10 -mt-20 text-center px-4">
        {/* Avatar Circle */}
        <div className="w-[7.5rem] h-[7.5rem] mx-auto rounded-full border-4 border-gray-800 bg-white/10 skeleton-shimmer overflow-hidden shadow-xl" />
        
        {/* Name */}
        <div className="mt-4 h-6 w-48 bg-white/10 skeleton-shimmer rounded mx-auto" />
        
        {/* Location */}
        <div className="mt-2 h-4 w-32 bg-white/5 skeleton-shimmer rounded mx-auto" />
        
        {/* Social Icons */}
        <div className="flex justify-center gap-4 mt-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="w-8 h-8 rounded-full bg-white/5 skeleton-shimmer" />
          ))}
        </div>
        
        {/* Bio */}
        <div className="max-w-md mx-auto mt-8 px-6 space-y-2">
          <div className="h-3 w-full bg-white/5 skeleton-shimmer rounded" />
          <div className="h-3 w-5/6 bg-white/5 skeleton-shimmer rounded mx-auto" />
          <div className="h-3 w-2/3 bg-white/5 skeleton-shimmer rounded mx-auto" />
        </div>
      </div>
    </div>
  );
});

ProfileSkeleton.displayName = "ProfileSkeleton";

const PublicProfile = memo(() => {
  const { username } = useParams();
  const navigate = useNavigate();
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();

  // MediaViewer state
  const { isOpen, currentIndex, openViewer, closeViewer } = useMediaViewer();

  // Clean share URL without QR code UTM parameters for direct sharing
  const getCleanShareUrl = () => {
    return `${window.location.origin}/${username}`;
  };

  const { data, loading } = useQuery(getPublicProfileDataQuery, {
    variables: {
      filters: {
        username: {
          eq: username,
        },
      },
    },
  });

  const accountData = data?.accounts[0];
  const themeSettings = useMemo(
    () => normalizeThemeSettings(accountData?.social_media?.theme_settings),
    [accountData?.social_media?.theme_settings],
  );
  const themeStyles = getThemeTokenStyles(themeSettings);

  // Set public profile loaded when query completes successfully
  useEffect(() => {
    if (!loading) {
      (window as any).__publicProfileLoaded = true;
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [loading, outletContext]);

  // Fetch mobile number ONLY when visibility is explicitly enabled
  // This prevents the mobile number from ever being in the response unless visibility is set
  const { data: mobileData } = useQuery(getUserMobileNumberQuery, {
    variables: {
      documentId: accountData?.documentId,
    },
    skip: !accountData?.documentId || !accountData?.mobile_number_visibility,
  });

  const mobileNumber = mobileData?.account?.mobile_number;

  // Analytics tracking - initialize after accountData is available
  const analytics = useTrackAnalytics(
    createAnalyticsOptions.profile(accountData?.documentId || "", username)
  );

  // Parse business location data
  const businessLocationData = useMemo(
    () => parseBusinessLocationData(accountData?.Public_Profile_Address),
    [accountData?.Public_Profile_Address],
  );
  const sanitizedProfileBio = useMemo(
    () => sanitizePublicRichText(accountData?.Bio),
    [accountData?.Bio],
  );
  const rawBusinessDescription =
    businessLocationData?.about || businessLocationData?.businessDescription;
  const sanitizedBusinessDescription = useMemo(
    () => sanitizePublicRichText(rawBusinessDescription),
    [rawBusinessDescription],
  );
  const businessWebsiteHref = useMemo(
    () =>
      normalizePublicWebHref(
        businessLocationData?.website || businessLocationData?.businessWebsite,
      ),
    [businessLocationData?.businessWebsite, businessLocationData?.website],
  );
  const emailSocial =
    accountData?.social_media?.email ?? accountData?.social_media?.gmail;
  const emailHref = normalizePublicEmailHref(emailSocial?.link);
  const publicSocialHrefs = useMemo(
    () => ({
      instagram: normalizePublicWebHref(accountData?.social_media?.instagram?.link),
      whatsapp: normalizePublicWebHref(
        buildWhatsAppHref(accountData?.social_media?.whatsapp?.link),
      ),
      website: normalizePublicWebHref(accountData?.social_media?.website?.link),
      youtube: normalizePublicWebHref(accountData?.social_media?.youtube?.link),
      X: normalizePublicWebHref(accountData?.social_media?.X?.link),
      spotify: normalizePublicWebHref(accountData?.social_media?.spotify?.link),
      facebook: normalizePublicWebHref(accountData?.social_media?.facebook?.link),
      youtubeMusic: normalizePublicWebHref(
        accountData?.social_media?.youtubeMusic?.link,
      ),
      linkedin: normalizePublicWebHref(accountData?.social_media?.linkedin?.link),
      appleMusic: normalizePublicWebHref(
        accountData?.social_media?.appleMusic?.link,
      ),
      tiktok: normalizePublicWebHref(accountData?.social_media?.tiktok?.link),
      snapchat: normalizePublicWebHref(accountData?.social_media?.snapchat?.link),
      localTunes: normalizePublicWebHref(accountData?.social_media?.localTunes?.link),
    }),
    [accountData?.social_media],
  );
  const usesImageHeaderTreatment =
    themeSettings.wallpaperMode === "banner-top" ||
    themeSettings.wallpaperMode === "full-wallpaper-image";
  const headerPrimaryColor = usesImageHeaderTreatment
    ? "#FFFFFF"
    : "var(--text-primary)";
  const headerSecondaryColor = usesImageHeaderTreatment
    ? "#FFFFFF"
    : themeSettings.wallpaperMode === "ambient-gradient"
      ? "var(--text-primary)"
    : "var(--text-secondary)";
  const socialLinkClassName =
    "profile-presentation-focus inline-flex min-h-11 min-w-11 items-center justify-center rounded-full transition-opacity hover:opacity-75";

  // Feed images AND videos now supported with proper aspect ratio detection
  const feedItems = accountData?.Feed_Data || [];
  const memoizedFeedImages = useMemo(() => {
    return (feedItems || []).map((media: any) => ({
      id: media.id || media.documentId || `media-${Math.random()}`,
      url: media.url,
      alt: media.fileName || (media.type === "video" ? "Video" : "Feed image"),
      type: media.type || "image", // Include video support
      fileName: media.fileName,
      // Enhanced: Use stored aspect ratio information for consistent rendering
      aspectRatio: media.aspectRatio || "4:5", // Default to common social media ratio
      width: media.width || 800,
      height: media.height || (media.aspectRatio === "1:1" ? 800 : 1000),
    }));
  }, [feedItems]);

  const profileName = accountData?.Account_Name || username || "User";
  const profileImageUrl =
    accountData?.profile_picture?.url || IMAGE_CONFIG.defaultImages.profile;

  // Keep the profile photo and feed in one accessible viewer. Feed indexes are
  // offset by one because the avatar is the first slide.
  const mediaViewerItems = useMemo(() => {
    return [
      {
        id: "profile-avatar",
        url: profileImageUrl,
        alt: `${profileName}'s profile photo`,
        type: "image" as const,
      },
      ...convertToMediaItems(feedItems),
    ];
  }, [feedItems, profileImageUrl, profileName]);

  // Handle media item click to open MediaViewer
  const handleMediaClick = (index: number) => {
    openViewer(index + 1);
    analytics.trackClick('feed-item', {
      action: 'open-media-viewer',
      index,
      totalItems: feedItems.length
    });
  };

  // Mobile number visibility: only show if visibility is enabled AND we have a number from the separate query
  const showMobileIcon = !!(accountData?.mobile_number_visibility && mobileNumber);

  // Redirect if public_profile tab is disabled
  useEffect(() => {
    if (!loading && accountData) {
      const isProfileDisabled = false; // Public profile is always enabled by default
      if (isProfileDisabled) {
        // Redirect to the first available enabled tab
        const showRecommendations = accountData.public_recommendations === "Yes" || (!accountData.public_recommendations || accountData.public_recommendations === undefined);
        const showGuides = accountData.public_guides === "Yes";
        const showMovies = accountData.public_movie === "Yes";
        const showBooks = accountData.public_books === "Yes";
        const showGames = accountData.public_games === "Yes";
        const showMusic = accountData.public_music === "Yes";
        const showApps = accountData.public_apps === "Yes";
        const showProducts = accountData.public_products === "Yes";
        const showPeople = accountData.public_people === "Yes";

        if (showRecommendations) {
          navigate(`/${username}/places`, { replace: true });
        } else if (showGuides) {
          navigate(`/${username}/guides`, { replace: true });
        } else if (showMovies) {
          navigate(`/${username}/movies`, { replace: true });
        } else if (showBooks) {
          navigate(`/${username}/books`, { replace: true });
        } else if (showGames) {
          navigate(`/${username}/games`, { replace: true });
        } else if (showApps) {
          navigate(`/${username}/apps`, { replace: true });
        } else if (showProducts) {
          navigate(`/${username}/products`, { replace: true });
        } else if (showPeople) {
          navigate(`/${username}/people`, { replace: true });
        } else if (showMusic) {
          navigate(`/${username}/music`, { replace: true });
        }
        // If nothing is enabled, stay on profile (will show "not available" or similar)
      }
    }
  }, [loading, accountData, username, navigate]);



  // Determine availability of categories
  const hasRecommendations = RECOMMENDATION_CATEGORY_IDS.some((categoryId) =>
    isRecommendationCategoryVisible(accountData || {}, categoryId),
  );

  // Determine availability of business details & gallery (safe before data loaded)
  const hasBusinessDetails = !!(
    businessLocationData &&
    (businessLocationData.title ||
      businessLocationData.businessTitle ||
      businessLocationData.address ||
      businessLocationData.businessAddress ||
      sanitizedBusinessDescription ||
      businessLocationData.contact ||
      businessLocationData.businessContact ||
      businessWebsiteHref)
  );
  const hasGallery = memoizedFeedImages.length > 0;
  const availableTabs = useMemo<PublicProfileTab[]>(
    () => [
      ...(hasRecommendations ? (["recommendations"] as const) : []),
      "gallery",
      ...(hasBusinessDetails ? (["business"] as const) : []),
    ],
    [hasBusinessDetails, hasRecommendations],
  );
  const automaticActiveTab = resolveInitialPublicProfileTab({
    landingTab: themeSettings.landingTab,
    hasVisibleRecommendationCategories: hasRecommendations,
    hasGallery: true,
    hasBusiness: hasBusinessDetails,
  });
  const [manualTabOverride, setManualTabOverride] = useState<{
    username: string;
    tab: PublicProfileTab;
  } | null>(null);
  const manualTabForProfile =
    manualTabOverride && manualTabOverride.username === username
      ? manualTabOverride.tab
      : undefined;
  const activeTab =
    manualTabForProfile && availableTabs.includes(manualTabForProfile)
      ? manualTabForProfile
      : automaticActiveTab;
  const [focusedTabOverride, setFocusedTabOverride] = useState<{
    username: string;
    tab: PublicProfileTab;
  } | null>(null);
  const focusedTabForProfile =
    focusedTabOverride && focusedTabOverride.username === username
      ? focusedTabOverride.tab
      : undefined;
  const focusedTab =
    focusedTabForProfile && availableTabs.includes(focusedTabForProfile)
      ? focusedTabForProfile
      : activeTab;
  const preferredRecommendationCategory = getPreferredRecommendationCategory(
    themeSettings.landingTab,
  );

  const selectTab = (tab: PublicProfileTab) => {
    const profileUsername = username || "";
    setManualTabOverride({ username: profileUsername, tab });
    setFocusedTabOverride({ username: profileUsername, tab });
  };

  const focusTab = (tab: PublicProfileTab) => {
    setFocusedTabOverride({ username: username || "", tab });
    document.getElementById(`public-profile-${tab}-tab`)?.focus();
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    tab: PublicProfileTab,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectTab(tab);
      return;
    }

    const currentIndex = availableTabs.indexOf(tab);
    let targetIndex: number | undefined;
    if (event.key === "ArrowRight") {
      targetIndex = (currentIndex + 1) % availableTabs.length;
    } else if (event.key === "ArrowLeft") {
      targetIndex = (currentIndex - 1 + availableTabs.length) % availableTabs.length;
    } else if (event.key === "Home") {
      targetIndex = 0;
    } else if (event.key === "End") {
      targetIndex = availableTabs.length - 1;
    }

    if (targetIndex !== undefined) {
      event.preventDefault();
      focusTab(availableTabs[targetIndex]);
    }
  };

  if (loading) {
    if ((window as any).__publicProfileLoaded) {
      return <ProfileSkeleton />;
    }
    return null;
  }

  // Add safety check for accountData
  if (!accountData) {
    return (
      <div className="flex bg-black items-center justify-center min-h-screen">
        <div className="text-white text-center">
          <h2 className="text-lg font-poppins font-semibold mb-2">
            Profile not found
          </h2>
          <p className="text-gray-400 text-sm">
            This user profile is not available.
          </p>
        </div>
      </div>
    );
  }

  const handleImageClick = () => {
    openViewer(0);
    analytics.trackClick('profile-image', { action: 'open-photo-viewer' });
  };

  // Enhanced dynamic SEO data preparation with all profile data
  const profileLocation = accountData?.Primary_Address?.address || "";
  const profileBio = accountData?.Bio || "";
  const profileUsername = username || "";

  // Extract all available social media links for SEO
  const socialLinks = [];
  const socialPlatforms = [
    {
      name: "Instagram",
      link: publicSocialHrefs.instagram,
      visibility: accountData?.social_media?.instagram?.visibility,
    },
    {
      name: "WhatsApp",
      link: publicSocialHrefs.whatsapp,
      visibility: accountData?.social_media?.whatsapp?.visibility,
    },
    {
      name: "Website",
      link: publicSocialHrefs.website,
      visibility: accountData?.social_media?.website?.visibility,
    },
    {
      name: "YouTube",
      link: publicSocialHrefs.youtube,
      visibility: accountData?.social_media?.youtube?.visibility,
    },
    {
      name: "Twitter",
      link: publicSocialHrefs.X,
      visibility: accountData?.social_media?.X?.visibility,
    },
    {
      name: "Spotify",
      link: publicSocialHrefs.spotify,
      visibility: accountData?.social_media?.spotify?.visibility,
    },
    {
      name: "Gmail",
      link: emailHref,
      visibility: emailSocial?.visibility,
    },
    {
      name: "Facebook",
      link: publicSocialHrefs.facebook,
      visibility: accountData?.social_media?.facebook?.visibility,
    },
    {
      name: "YouTube Music",
      link: publicSocialHrefs.youtubeMusic,
      visibility: accountData?.social_media?.youtubeMusic?.visibility,
    },
    {
      name: "LinkedIn",
      link: publicSocialHrefs.linkedin,
      visibility: accountData?.social_media?.linkedin?.visibility,
    },
    {
      name: "Apple Music",
      link: publicSocialHrefs.appleMusic,
      visibility: accountData?.social_media?.appleMusic?.visibility,
    },
    {
      name: "TikTok",
      link: publicSocialHrefs.tiktok,
      visibility: accountData?.social_media?.tiktok?.visibility,
    },
    {
      name: "Snapchat",
      link: publicSocialHrefs.snapchat,
      visibility: accountData?.social_media?.snapchat?.visibility,
    },
  ];

  // Filter and collect visible social links
  socialPlatforms.forEach((platform) => {
    if (platform.link && platform.visibility) {
      socialLinks.push(platform.name);
    }
  });

  // Add mobile number if visible
  if (accountData?.mobile_number_visibility && mobileNumber) {
    socialLinks.push("Mobile");
  }

  // Create enhanced meta description with bio, location, and social presence
  const socialLinksText =
    socialLinks.length > 0
      ? ` Connect via ${socialLinks.slice(0, 3).join(", ")}${socialLinks.length > 3
        ? ` and ${socialLinks.length - 3} more platforms`
        : ""
      }.`
      : "";

  const metaDescription = profileBio
    ? `${profileName} (@${profileUsername}) - ${profileBio
      .replace(/<[^>]*>/g, "")
      .substring(0, 100)}${profileBio.length > 100 ? "..." : ""}${profileLocation ? ` Based in ${profileLocation}.` : ""
    }${socialLinksText}`
    : profileLocation
      ? `${profileName} (@${profileUsername}) - Discover local recommendations and favorite places from ${profileLocation}. Local guide sharing authentic insights and curated suggestions.${socialLinksText}`
      : `${profileName} (@${profileUsername}) - Explore recommendations, interests and profile details. Discover favorite places and local insights.${socialLinksText}`;

  // Dynamic title - keeping original format as requested
  const pageTitle = `${profileName} | explorers Profile`;

  // Enhanced keywords with social platforms, bio content, and profile data
  const bioKeywords = profileBio
    ? profileBio
      .replace(/<[^>]*>/g, "")
      .split(/\s+/)
      .filter((word: string) => word.length > 3)
      .slice(0, 5)
    : [];
  const socialKeywords = socialLinks.map(
    (platform) => `${profileName} ${platform.toLowerCase()}`
  );

  const enhancedKeywords = [
    `${profileName} explorers profile`,
    `${profileUsername} explorers`,
    "explorers public profile",
    "explorers user recommendations",
    "explorers social links",
    "explorers local insights",
    "QR code user profile",
    "explorers personal page",
    "public profile explorers",
    "explorers social media",
    "explorers authentic recommendations",
    "explorers discover users",
    "explorers connect profile",
    `${profileName} explorers`,
    `${profileUsername} profile`,
    `${profileName} recommendations`,
    `${profileUsername} explorers`,
    "local recommendations",
    "QR profile",
    "user recommendations",
    "local insights",
    "place recommendations",
    "travel recommendations",
    "local guide",
    `${profileLocation || "local"} recommendations`,
    `${profileLocation || "local"} guide`,
    ...socialKeywords,
    ...bioKeywords,
    ...socialLinks.map((platform) => platform.toLowerCase()),
    `${profileName} social`,
    `${profileUsername} social media`,
    "public profile",
    "profile page",
  ].filter(Boolean);

  // Profile image for social sharing
  const profileImage =
    accountData?.profile_picture?.url || accountData?.bg_picture?.url;

  // Generate GEO data for enhanced structured data
  const geoData = createProfileGEOData({
    accountName: profileName,
    username: profileUsername,
    bio: profileBio,
    location: profileLocation,
    socialPlatforms: socialLinks.slice(0, 5), // Limit to top 5 social links
  });

  return (
    <>
      {!loading && accountData && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={enhancedKeywords}
          canonical={createCanonicalUrl(`/${username}`)}
          image={profileImage}
          url={createCanonicalUrl(`/${username}`)}
          type="profile"
          author={profileName}
          siteName="explorers"
          enableGEO={true}
          geoData={geoData}
        />
      )}

      <div
        className="h-full min-h-screen overflow-auto preview-scroll pb-20"
        data-testid="public-profile-theme-root"
        data-theme-preset={themeSettings.preset}
        data-theme-accent={themeSettings.accentColor}
        data-wallpaper-mode={themeSettings.wallpaperMode}
        style={{
          ...themeStyles,
          backgroundColor: "var(--bg-page)",
          color: "var(--text-primary)",
        }}
      >
        {/* Fixed Header */}
        <div className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b h-14 transition-colors duration-300" style={{ backgroundColor: "var(--nav-bg)", borderColor: "var(--border-card)" }}>
          <div className="max-w-4xl mx-auto flex items-center justify-between h-full px-6">
            <Link
              to="/"
              aria-label="Explorers.Earth home"
              className="profile-presentation-focus inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl transition-opacity hover:opacity-80"
            >
              <img src="/eoe-icon.svg" alt="" className="h-8 w-auto" />
            </Link>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const shareUrl = getCleanShareUrl();
                  if (navigator.share) {
                    navigator.share({
                      title: `${accountData?.Account_Name || username}'s Profile`,
                      text: "Check out this profile!",
                      url: shareUrl,
                    }).catch(() => { });
                  } else {
                    // Copy clean URL without QR code UTM params
                    try {
                      await navigator.clipboard.writeText(shareUrl);
                      toast.success("Link copied!");
                    } catch (error) {
                      console.error("Failed to copy text:", error);
                    }
                  }
                  analytics.trackClick('share-button', { context: 'profile-header' });
                }}
                className="profile-presentation-focus min-h-11 min-w-11 p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-all duration-300 flex items-center justify-center"
                aria-label="Share"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>

            </div>
          </div>
        </div>

        {/* Profile Content */}

        {/* Full-Screen Wallpaper Background Mode */}
        {themeSettings?.wallpaperMode === 'full-wallpaper-image' && (
          <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
            <img
              src={accountData?.bg_picture?.url || IMAGE_CONFIG.defaultImages.background}
              alt="Full Wallpaper"
              className="w-full h-full object-cover opacity-25 blur-[3px] scale-105"
            />
            <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
          </div>
        )}

        {/* Ambient Gradient Background Mode */}
        {themeSettings?.wallpaperMode === 'ambient-gradient' && (
          <div
            className="fixed inset-0 z-0 overflow-hidden pointer-events-none opacity-15 transition-all duration-500"
            style={{
              background: `radial-gradient(circle at 50% 20%, var(--accent-color) 0%, transparent 60%), radial-gradient(circle at 80% 80%, var(--accent-color) 0%, transparent 50%)`
            }}
          />
        )}

        {/* Profile Header Section */}
        <div className="relative overflow-hidden pb-0">
          {/* Cover Photo Banner (Shown in Classic Banner Mode) */}
          {themeSettings?.wallpaperMode === 'banner-top' && (
            <div className="absolute inset-x-0 top-0 h-[380px] md:h-[420px] overflow-hidden z-0 rounded-b-[2rem] md:rounded-none">
              <img
                src={
                  accountData?.bg_picture?.url ||
                  IMAGE_CONFIG.defaultImages.background
                }
                alt="Cover"
                className="w-full h-full object-cover object-[center_32%] scale-105"
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/55 to-black/90 z-0" />
              <div
                className="absolute inset-x-0 bottom-0 h-[70%] backdrop-blur-md bg-black/10 z-0"
                style={{
                  WebkitMaskImage: 'linear-gradient(to top, black 30%, transparent 100%)',
                  maskImage: 'linear-gradient(to top, black 30%, transparent 100%)'
                }}
              />
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black via-black/40 to-transparent z-0" />
            </div>
          )}

          {/* Profile Header Content (Profile Pic, Name, Social Icons) */}
          <div className="relative z-10 pt-16 md:pt-32 pb-0 md:pb-4 text-center px-4">
            {/* Profile Picture */}
            <div className="relative mb-2 px-4">
              <button
                type="button"
                aria-label={`View ${profileName}'s profile photo`}
                className="profile-presentation-focus block w-[7.5rem] h-[7.5rem] mx-auto rounded-full overflow-hidden cursor-pointer shadow-xl ring-1 ring-black/15 transition-transform hover:scale-[1.02]"
                style={{ backgroundColor: "var(--bg-card)" }}
                onClick={handleImageClick}
              >
                <img
                  src={profileImageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </button>
            </div>

            <div
              className="mx-auto mt-1 max-w-xl"
              data-testid="public-profile-header-metadata"
            >
              {/* Name & Location */}
              <div className="text-center px-6">
                <h1 className="text-base font-poppins font-bold tracking-tight transition-colors drop-shadow-md" style={{ color: headerPrimaryColor }}>
                  {accountData?.Account_Name}
                </h1>
                <div className="flex items-center justify-center gap-1.5 text-xs font-poppins mt-0.5 drop-shadow-sm transition-colors" style={{ color: headerSecondaryColor }}>
                  <Location className="w-3 h-3" fill="currentColor" />
                  <span>{accountData?.Primary_Address?.address}</span>
                </div>
              </div>

              {/* Social Links */}
              <div
                className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 empty:hidden px-6 mt-4 mb-2"
                style={{ color: headerPrimaryColor }}
              >
            {publicSocialHrefs.instagram &&
              accountData?.social_media?.instagram?.visibility && (
                <a
                  href={publicSocialHrefs.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className={socialLinkClassName}
                  onClick={() => analytics.trackClick('social-link', { platform: 'instagram' })}
                >
                  <InstagramIcon color="currentColor" />
                </a>
              )}
            {publicSocialHrefs.whatsapp &&
              accountData?.social_media?.whatsapp?.visibility && (
                <a
                  href={publicSocialHrefs.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                  className={socialLinkClassName}
                  onClick={() => analytics.trackClick('social-link', { platform: 'whatsapp' })}
                >
                  <WhatsappIcon fill="currentColor" />
                </a>
              )}
            {showMobileIcon && (
              <a
                href={`sms:+${mobileNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Send SMS"
                className={socialLinkClassName}
                onClick={() => analytics.trackClick('social-link', { platform: 'mobile' })}
              >
                <MobileIcon fill="currentColor" />
              </a>
            )}
            {publicSocialHrefs.website &&
              accountData?.social_media?.website?.visibility && (
                <a
                  href={publicSocialHrefs.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Website"
                  className={socialLinkClassName}
                  onClick={() => analytics.trackClick('social-link', { platform: 'website' })}
                >
                  <BoldLinkIcon color="currentColor" />
                </a>
              )}
            {publicSocialHrefs.youtube &&
              accountData?.social_media?.youtube?.visibility && (
                <a
                  href={publicSocialHrefs.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="YouTube"
                  className={socialLinkClassName}
                  onClick={() => analytics.trackClick('social-link', { platform: 'youtube' })}
                >
                  <YoutubeIcon color="currentColor" />
                </a>
              )}
            {publicSocialHrefs.X &&
              accountData?.social_media?.X?.visibility && (
                <a
                  href={publicSocialHrefs.X}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="X"
                  className={socialLinkClassName}
                  onClick={() => analytics.trackClick('social-link', { platform: 'twitter' })}
                >
                  <TwitterIcon color="currentColor" />
                </a>
              )}
            {publicSocialHrefs.spotify &&
              accountData?.social_media?.spotify?.visibility && (
                <a
                  href={publicSocialHrefs.spotify}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Spotify"
                  className={socialLinkClassName}
                  onClick={() => analytics.trackClick('social-link', { platform: 'spotify' })}
                >
                  <Spotify color="currentColor" />
                </a>
              )}
            {emailHref && emailSocial?.visibility && (
                <a
                  href={emailHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Email"
                  className={socialLinkClassName}
                  onClick={() => analytics.trackClick('social-link', { platform: 'gmail' })}
                >
                  <Gmail color="currentColor" />
                </a>
              )}
            {publicSocialHrefs.facebook &&
              accountData?.social_media?.facebook?.visibility && (
                <a
                  href={publicSocialHrefs.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className={socialLinkClassName}
                  onClick={() => analytics.trackClick('social-link', { platform: 'facebook' })}
                >
                  <FacebookIcon color="currentColor" />
                </a>
              )}
            {publicSocialHrefs.youtubeMusic &&
              accountData?.social_media?.youtubeMusic?.visibility && (
                <a
                  href={publicSocialHrefs.youtubeMusic}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="YouTube Music"
                  className={socialLinkClassName}
                  onClick={() => analytics.trackClick('social-link', { platform: 'youtube-music' })}
                >
                  <YoutubeMusic color="currentColor" />
                </a>
              )}
            {publicSocialHrefs.linkedin &&
              accountData?.social_media?.linkedin?.visibility && (
                <a
                  href={publicSocialHrefs.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LinkedIn"
                  className={socialLinkClassName}
                  onClick={() => analytics.trackClick('social-link', { platform: 'linkedin' })}
                >
                  <LinkedinIcon color="currentColor" />
                </a>
              )}
            {publicSocialHrefs.appleMusic &&
              accountData?.social_media?.appleMusic?.visibility && (
                <a
                  href={publicSocialHrefs.appleMusic}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Apple Music"
                  className={socialLinkClassName}
                  onClick={() => analytics.trackClick('social-link', { platform: 'apple-music' })}
                >
                  <AppleMusic color="currentColor" />
                </a>
              )}
            {publicSocialHrefs.tiktok &&
              accountData?.social_media?.tiktok?.visibility && (
                <a
                  href={publicSocialHrefs.tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="TikTok"
                  className={socialLinkClassName}
                  onClick={() => analytics.trackClick('social-link', { platform: 'tiktok' })}
                >
                  <TiktokIcon color="currentColor" />
                </a>
              )}
            {publicSocialHrefs.snapchat &&
              accountData?.social_media?.snapchat?.visibility && (
                <a
                  href={publicSocialHrefs.snapchat}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Snapchat"
                  className={socialLinkClassName}
                  onClick={() => analytics.trackClick('social-link', { platform: 'snapchat' })}
                >
                  <SnapchatIcon color="currentColor" />
                </a>
              )}
            {publicSocialHrefs.localTunes &&
              accountData?.social_media?.localTunes?.visibility && (
                <a
                  href={publicSocialHrefs.localTunes}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Local Tunes"
                  className={socialLinkClassName}
                  onClick={() => analytics.trackClick('social-link', { platform: 'local-tunes' })}
                >
                  <MusicNote fill="currentColor" />
                </a>
              )}
              {/* End of Social Links */}
            </div>
            {/* End of Profile Header Content */}
          </div>
          {/* End of Profile Header Section */}
        </div>
        <div className="md:max-w-5xl px-6 md:px-6 md:mx-auto relative z-10">
          <div className="mt-0 max-w-3xl md:flex flex-col item-center justify-center mx-auto">
            <div className="py-3">
              <div
                className="font-poppins text-xs leading-relaxed line-clamp-3 break-words overflow-hidden text-ellipsis opacity-90" style={{ color: "var(--text-primary)" }}
                dangerouslySetInnerHTML={{ __html: sanitizedProfileBio }}
              />
              </div>
            </div>
          </div>

          {/* Tabs: Recommendations (heart) | Gallery (feed) | Address (location) */}
          <div className="mt-1 max-w-5xl mx-auto">
            <div className="mt-3">
              {/* Tab List */}
              <div
                role="tablist"
                aria-label="Profile sections"
                className="flex w-full justify-center gap-8 border-b px-2 md:px-0 overflow-x-auto scrollbar-hide"
                style={{ borderColor: "var(--border-card)" }}
              >
                {/* Recommendations tab — conditionally rendered */}
                {hasRecommendations && (
                  <button
                    id="public-profile-recommendations-tab"
                    role="tab"
                    type="button"
                    aria-label="Recommendations"
                    aria-controls="public-profile-recommendations-panel"
                    tabIndex={focusedTab === "recommendations" ? 0 : -1}
                    className="profile-presentation-focus min-h-12 min-w-12 py-2.5 text-xs font-poppins font-medium tracking-wide transition-all border-b-2"
                    style={{
                      borderColor: activeTab === "recommendations" ? "var(--accent-color)" : "transparent",
                      color: activeTab === "recommendations" ? "var(--text-primary)" : "var(--text-secondary)"
                    }}
                    aria-selected={activeTab === "recommendations"}
                    onClick={() => selectTab("recommendations")}
                    onKeyDown={(event) => handleTabKeyDown(event, "recommendations")}
                  >
                    <span className="flex items-center justify-center gap-1">
                      <svg viewBox="0 0 24 24" fill={activeTab === "recommendations" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={activeTab === "recommendations" ? 0 : 1.8} className="size-5 transition-all" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                      </svg>
                      <span className="sr-only">Recommendations</span>
                    </span>
                  </button>
                )}

                {/* Gallery tab */}
                <button
                  id="public-profile-gallery-tab"
                  role="tab"
                  type="button"
                  aria-label="Gallery"
                  aria-controls="public-profile-gallery-panel"
                  tabIndex={focusedTab === "gallery" ? 0 : -1}
                  className="profile-presentation-focus min-h-12 min-w-12 py-2.5 text-xs font-poppins font-medium tracking-wide transition-all border-b-2"
                  style={{
                    borderColor: activeTab === "gallery" ? "var(--accent-color)" : "transparent",
                    color: activeTab === "gallery" ? "var(--text-primary)" : "var(--text-secondary)"
                  }}
                  aria-selected={activeTab === "gallery"}
                  onClick={() => selectTab("gallery")}
                  onKeyDown={(event) => handleTabKeyDown(event, "gallery")}
                >
                  <span className="flex items-center justify-center gap-1">
                    <FeedIcon className="size-5" />
                    <span className="sr-only">Gallery</span>
                  </span>
                </button>

                {/* Address tab — only if business details exist */}
                {hasBusinessDetails && (
                  <button
                    id="public-profile-business-tab"
                    role="tab"
                    type="button"
                    aria-label="Business Details"
                    aria-controls="public-profile-business-panel"
                    tabIndex={focusedTab === "business" ? 0 : -1}
                    className="profile-presentation-focus min-h-12 min-w-12 py-2.5 text-xs font-poppins font-medium tracking-wide transition-all border-b-2"
                    style={{
                      borderColor: activeTab === "business" ? "var(--accent-color)" : "transparent",
                      color: activeTab === "business" ? "var(--text-primary)" : "var(--text-secondary)"
                    }}
                    aria-selected={activeTab === "business"}
                    onClick={() => selectTab("business")}
                    onKeyDown={(event) => handleTabKeyDown(event, "business")}
                  >
                    <span className="flex items-center justify-center gap-1">
                      <Location className="size-5" />
                      <span className="sr-only">Business Details</span>
                    </span>
                  </button>
                )}
              </div>

              {/* Tab Panels */}
              <div className="relative mt-2">

                {/* ── Recommendations Tab ── */}
                {activeTab === "recommendations" && hasRecommendations && (
                  <div
                    id="public-profile-recommendations-panel"
                    role="tabpanel"
                    aria-labelledby="public-profile-recommendations-tab"
                  >
                    <ProfileRecommendationsTab
                      accountData={accountData}
                      username={username || ""}
                      presentation={themeSettings.recommendations}
                      preferredCategory={preferredRecommendationCategory}
                    />
                  </div>
                )}

                {/* ── Gallery Tab ── */}
                {activeTab === "gallery" && (
                  <div
                    id="public-profile-gallery-panel"
                    role="tabpanel"
                    aria-labelledby="public-profile-gallery-tab"
                  >
                    <div className="w-full">
                      <div className="max-w-4xl mx-auto px-1 md:px-4">
                        <div className="rounded-none md:rounded-lg p-1 md:p-4 transition-colors" style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-card)" }}>
                          {hasGallery ? (
                            <MemoizedFeedLayout
                              images={memoizedFeedImages}
                              className="w-full always-show-overlays"
                              autoDetectDimensions={false}
                              rowHeight={200}
                              margin={1}
                              onImageClick={handleMediaClick}
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center py-12 px-4">
                              <div
                                className="w-16 h-16 mb-4 rounded-full border flex items-center justify-center"
                                style={{
                                  backgroundColor: "var(--bg-page)",
                                  borderColor: "var(--border-card)",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                <FeedIcon className="size-8" />
                              </div>
                              <h3 className="text-lg font-poppins font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                                No Photos Yet
                              </h3>
                              <p className="text-sm text-center max-w-sm" style={{ color: "var(--text-secondary)" }}>
                                This user hasn't shared any photos in their feed yet. Check back later for updates!
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Business / Address Tab ── */}
                {activeTab === "business" &&
                  hasBusinessDetails &&
                  businessLocationData && (
                    <div
                      id="public-profile-business-panel"
                      role="tabpanel"
                      aria-labelledby="public-profile-business-tab"
                    >
                      <div className="max-w-3xl flex flex-col item-center justify-center mx-auto">
                        <div className="rounded-none md:rounded-lg p-4" style={{ backgroundColor: "var(--bg-card)" }}>
                          {(businessLocationData.title ||
                            businessLocationData.businessTitle ||
                            businessLocationData.address ||
                            businessLocationData.businessAddress) && (
                              <div className="mb-6">
                                {(businessLocationData.title ||
                                  businessLocationData.businessTitle) && (
                                    <h2 className="text-lg font-poppins font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                                      {businessLocationData.title ||
                                        businessLocationData.businessTitle}
                                    </h2>
                                  )}
                                {(businessLocationData.address ||
                                  businessLocationData.businessAddress) && (
                                    <p className="font-poppins text-sm" style={{ color: "var(--text-secondary)" }}>
                                      {businessLocationData.address ||
                                        businessLocationData.businessAddress}
                                    </p>
                                  )}
                              </div>
                            )}
                          {sanitizedBusinessDescription && (
                              <div className="mb-6">
                                <h3 className="text-sm font-poppins font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                                  About
                                </h3>
                                <div
                                  className="font-poppins text-xs leading-relaxed"
                                  style={{ color: "var(--text-secondary)" }}
                                  dangerouslySetInnerHTML={{
                                    __html: sanitizedBusinessDescription,
                                  }}
                                />
                              </div>
                            )}
                          {(businessLocationData.contact ||
                            businessLocationData.businessContact ||
                            businessWebsiteHref) && (
                              <div className="mb-6 space-y-2">
                                {(businessLocationData.contact ||
                                  businessLocationData.businessContact) && (
                                    <div className="flex items-center gap-2">
                                      <MobileIcon fill="currentColor" />
                                      <a
                                        href={`tel:${businessLocationData.contact ||
                                          businessLocationData.businessContact
                                          }`}
                                        className="profile-presentation-focus font-poppins text-sm transition-colors"
                                        style={{ color: "var(--text-secondary)" }}
                                      >
                                        {businessLocationData.contact ||
                                          businessLocationData.businessContact}
                                      </a>
                                    </div>
                                  )}
                                {businessWebsiteHref && (
                                    <div className="flex items-center gap-2">
                                      <BoldLinkIcon color="currentColor" />
                                      <a
                                        href={businessWebsiteHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="profile-presentation-focus font-poppins text-sm transition-colors"
                                        style={{ color: "var(--text-secondary)" }}
                                      >
                                        Visit Website
                                      </a>
                                    </div>
                                  )}
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            </div>
          </div>


          {/* Footer Branding Badge */}
          <PublicProfileFooter brandingStyle={themeSettings?.footerBranding || "enabled"} username={username} />
        </div>
        {/* MediaViewer for the profile photo, feed images, and videos */}
        <MediaViewer
          mediaItems={mediaViewerItems}
          initialIndex={currentIndex}
          isOpen={isOpen}
          onClose={closeViewer}
        />
      </div>
    </>
  );
});

export default PublicProfile;
