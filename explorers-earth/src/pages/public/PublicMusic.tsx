import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { Song, PlaylistResponse } from "../../types/music";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import PlaylistCard, { PlaylistCardContent } from "../../components/ui/PlaylistCard";
import PlaylistTable from "../../components/playlist-table";
import SearchSongs from "../../components/search-songs";
import { Music2, Volume2, History, Share2, Copy, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "../../hooks/useToast";
import { apiRequest } from "../../lib/queryClient";
import Tabs, { TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useTheme } from "../../components/theme-provider";
import { extractGuestUrlFromLocalTunesLink } from "../../utils/localTunesUtils";
import { useQuery as useApolloQuery, gql } from "@apollo/client";
import { useQuery as useReactQuery } from "@tanstack/react-query";
import { getPublicAccountBasicQuery } from "../../features/PublicHome/api/query";
import { getSongLimits, getUserSubscriptionPlans, getSubscriptionPlanById } from "../../services/subscriptionService";
import SEO from "../../components/SEO";
import { createCanonicalUrl } from "../../utils/getCurrentDomain";
import { useTrackAnalytics, createAnalyticsOptions } from "../../services/analyticsService";
import { motion, PanInfo } from "framer-motion";
import "./PublicMusic.css";

const POLLING_INTERVAL = 1000;

const GET_USER_BY_USERNAME_QUERY = gql`
  query UsersPermissionsUser($filters: UsersPermissionsUserFiltersInput) {
    usersPermissionsUsers(filters: $filters) {
      documentId
      username
    }
  }
`;

const MusicSkeleton = () => {
  return (
    <div className="min-h-screen bg-black text-white pt-20 px-4 md:px-6 pb-20">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 1. Search Bar Skeleton */}
        <div className="rounded-[14px] p-4 space-y-2.5 skeleton-card">
          <div className="h-4 w-36 bg-white/10 rounded skeleton-shimmer" />
          <div className="h-10 w-full bg-white/5 rounded-lg skeleton-shimmer" />
          <div className="h-3 w-40 bg-white/5 rounded skeleton-shimmer" />
        </div>
        
        {/* 2. Title Label */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-white/10 skeleton-shimmer" />
          <div className="h-3.5 w-24 bg-white/10 rounded skeleton-shimmer" />
        </div>

        {/* 3. Hero Card Skeleton (Responsive) */}
        {/* Mobile View Hero Skeleton */}
        <div className="md:hidden w-full h-[300px] rounded-[18px] relative overflow-hidden skeleton-card">
          <div className="absolute inset-0 skeleton-shimmer" />
          <div className="absolute bottom-4 left-4 right-4 space-y-2">
            <div className="h-4 w-20 bg-white/15 rounded skeleton-shimmer" />
            <div className="h-6 w-3/4 bg-white/20 rounded skeleton-shimmer" />
            <div className="h-3.5 w-1/2 bg-white/10 rounded skeleton-shimmer" />
          </div>
        </div>

        {/* Desktop View Hero Skeleton */}
        <div className="hidden md:block w-full h-[440px] rounded-[18px] relative overflow-hidden skeleton-card">
          <div className="absolute inset-0 skeleton-shimmer" />
          <div className="absolute bottom-8 left-8 space-y-2.5">
            <div className="h-5 w-24 bg-white/15 rounded skeleton-shimmer" />
            <div className="h-8 w-[320px] bg-white/20 rounded-lg skeleton-shimmer" />
            <div className="h-4 w-40 bg-white/10 rounded skeleton-shimmer" />
          </div>
        </div>

        {/* 4. Accordion List Skeletons */}
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-[14px] h-[54px] px-4 flex items-center justify-between skeleton-card">
              <div className="flex items-center gap-3 w-1/2">
                <div className="w-8 h-8 rounded-lg bg-white/5 skeleton-shimmer" />
                <div className="h-4 w-28 bg-white/10 rounded skeleton-shimmer" />
                <div className="h-3.5 w-16 bg-white/5 rounded-full skeleton-shimmer" />
              </div>
              <div className="w-4 h-4 rounded-full bg-white/5 skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};


export default function PublicMusic() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { updateTheme } = useTheme();
  const [themeUpdated, setThemeUpdated] = useState(false);
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const [accordionsOpen, setAccordionsOpen] = useState({
    queue: true,
    history: false,
    playlists: false,
    device: false
  });
  const desktopQueueScrollRef = useRef<HTMLDivElement>(null);

  const handleScrollQueue = (direction: 'left' | 'right') => {
    if (desktopQueueScrollRef.current) {
      const scrollAmount = 144 + 14; // card width (w-36 = 144px) + gap (gap-3.5 = 14px)
      desktopQueueScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };


  // First, fetch account data to get Local Tunes link
  const {
    data: accountData,
    loading: accountLoading,
    error: accountError,
  } = useApolloQuery(getPublicAccountBasicQuery, {
    variables: {
      filters: {
        username: { eq: username }
      }
    },
    skip: !username,
  });
  const localTunesPublicLink = accountData?.accounts?.[0]?.localtunes_public;
  const guestUrl = useMemo(
    () =>
      typeof localTunesPublicLink === "string"
        ? extractGuestUrlFromLocalTunesLink(localTunesPublicLink)
        : null,
    [localTunesPublicLink],
  );
  const accountNoticeRef = useRef<string | null>(null);
  useEffect(() => {
    if (accountLoading) return;
    const notice = accountError
      ? "account-error"
      : localTunesPublicLink && !guestUrl
        ? "invalid-playlist"
        : !localTunesPublicLink
          ? "missing-playlist"
          : null;
    if (!notice || accountNoticeRef.current === notice) return;
    accountNoticeRef.current = notice;
    if (notice === "account-error") {
      toast("Error loading user data", { variant: "destructive" });
    } else if (notice === "invalid-playlist") {
      toast("Invalid Local Tunes playlist link for this user", {
        variant: "destructive",
      });
    } else {
      toast("No Local Tunes playlist found for this user", {
        variant: "destructive",
      });
    }
  }, [accountError, accountLoading, guestUrl, localTunesPublicLink, toast]);

  // Fetch user by username to get user documentId
  const { data: userData } = useApolloQuery(GET_USER_BY_USERNAME_QUERY, {
    variables: {
      filters: {
        username: {
          eq: username
        }
      }
    },
    skip: !username,
    fetchPolicy: 'cache-and-network',
    errorPolicy: 'all'
  });

  const userDocumentId = userData?.usersPermissionsUsers?.[0]?.documentId;
  // Resolve account documentId for analytics (account != user)
  const accountDocumentId = accountData?.accounts?.[0]?.documentId;

  // Fetch user subscription plans to get plan_id from backend API
  const { data: subscriptionData } = useReactQuery({
    queryKey: ['userSubscriptionPlans', userDocumentId],
    queryFn: () => getUserSubscriptionPlans(userDocumentId!),
    enabled: !!userDocumentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Get latest subscription plan (by start_date)
  const activeSubscription = subscriptionData && subscriptionData.length > 0
    ? [...subscriptionData].sort((a: any, b: any) => {
      const dateA = new Date(a.start_date).getTime();
      const dateB = new Date(b.start_date).getTime();
      return dateB - dateA;
    })[0]
    : null;

  // Fetch subscription plan details to get songs_quota from backend API
  const { data: planDetailsData } = useReactQuery({
    queryKey: ['subscriptionPlan', activeSubscription?.plan_id],
    queryFn: () => getSubscriptionPlanById(activeSubscription!.plan_id),
    enabled: !!activeSubscription?.plan_id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Fetch song limits with refetch capability from backend API
  const { data: songLimitsData, refetch: refetchSongLimits } = useReactQuery({
    queryKey: ['songLimits', username],
    queryFn: () => getSongLimits(username!),
    enabled: !!username,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Calculate if limit is reached - recalculate whenever data changes
  const songRequestsCount = songLimitsData?.[0]?.song_requests || 0;
  const songsQuota = planDetailsData?.songs_quota || 0;
  const isLimitReached = Number(songsQuota) > 0 && Number(songRequestsCount) >= Number(songsQuota);

  // Initialize analytics — auto-tracks the page view once accountId resolves
  const analytics = useTrackAnalytics(
    createAnalyticsOptions.music(accountDocumentId || '', username)
  );

  // Check if there's an active non-expired subscription plan
  const checkActiveSubscription = () => {
    if (!activeSubscription?.end_date) return false;
    const today = new Date();
    const endDate = new Date(activeSubscription.end_date);
    return endDate >= today; // Plan is active if end_date is today or in the future
  };

  const hasActiveNonExpiredPlan = checkActiveSubscription();
  const shouldDisableSearch = !hasActiveNonExpiredPlan || isLimitReached;

  // Query for playlist data (only when we have guestUrl)
  const { data: playlist, isLoading, error } = useQuery<PlaylistResponse>({
    queryKey: [`/api/playlist/${guestUrl}`],
    queryFn: () => apiRequest("GET", `/api/playlist/${guestUrl}`),
    refetchInterval: POLLING_INTERVAL,
    staleTime: 0,
    retry: true,
    retryDelay: 1000,
    enabled: !!guestUrl, // Only run when we have guestUrl
  });

  // Log playlist data when it changes
  useEffect(() => {
    if (playlist) {
      console.log('Guest page received playlist data:', {
        allowPlaylistSharing: playlist?.user?.allowPlaylistSharing,
        playlistsReceived: playlist?.playlists?.length ?? 0,
        visiblePlaylists: playlist?.playlists?.filter((p: any) => p.isVisibleToGuests).length ?? 0
      });
    }
  }, [playlist]);

  // Initial theme setup from playlist data
  useEffect(() => {
    if (playlist?.user?.theme?.primary && updateTheme && !themeUpdated) {
      console.log('Setting initial theme from playlist data:', playlist?.user?.theme?.primary);
      updateTheme(playlist?.user?.theme?.primary);
      setThemeUpdated(true);
    }
  }, [playlist?.user?.theme?.primary, updateTheme, themeUpdated]);

  // Reset active card to the "Now Playing" card (index 0) when the currently playing song changes
  useEffect(() => {
    setActiveHeroIndex(0);
  }, [playlist?.currentlyPlaying?.youtubeId]);

  // Adjust activeHeroIndex in case it goes out of bounds when the queue or currently playing song changes
  useEffect(() => {
    const totalCardsCount = (playlist?.currentlyPlaying ? 1 : 0) + Math.min((playlist?.songs || []).length, 4);
    if (activeHeroIndex >= totalCardsCount && totalCardsCount > 0) {
      setActiveHeroIndex(0);
    }
  }, [playlist?.currentlyPlaying, playlist?.songs, activeHeroIndex]);


  // Handle WebSocket messages
  const handleMessage = (message: { type: string; payload: any }) => {
    console.log('Received WebSocket message:', message);

    if (message.type === 'THEME_UPDATE' && message.payload?.theme?.primary) {
      console.log('Updating theme from WebSocket:', message.payload.theme.primary);

      // Force immediate theme update
      if (updateTheme) {
        updateTheme(message.payload.theme.primary);
      }

      // Update playlist cache with new theme
      queryClient.setQueryData([`/api/playlist/${guestUrl}`], (oldData: PlaylistResponse | undefined) => {
        if (!oldData) return oldData;

        // Create new object to trigger state update
        const newData = {
          ...oldData,
          user: {
            ...oldData.user,
            theme: {
              ...oldData.user?.theme,
              ...message.payload.theme
            }
          }
        };

        return newData;
      });
    }

    // Handle song requests toggle
    if (message.type === 'SONG_REQUESTS_TOGGLE') {
      console.log('Updating song requests setting from WebSocket:', message.payload);
      // Update the local state immediately 
      queryClient.setQueryData([`/api/playlist/${guestUrl}`], (oldData: PlaylistResponse | undefined) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          user: {
            ...oldData.user,
            allowSongRequests: message.payload
          }
        };
      });
    }

    // Handle guest play on device toggle
    if (message.type === 'GUEST_PLAY_TOGGLE') {
      console.log('Updating guest play setting from WebSocket:', message.payload);
      // Update the local state immediately
      queryClient.setQueryData([`/api/playlist/${guestUrl}`], (oldData: PlaylistResponse | undefined) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          allowGuestPlayOnDevice: message.payload
        };
      });
    }

    // Handle playlist sharing toggle
    if (message.type === 'PLAYLIST_SHARING_TOGGLE') {
      console.log('Updating playlist sharing setting from WebSocket:', message.payload);
      // Update the local state immediately
      queryClient.setQueryData([`/api/playlist/${guestUrl}`], (oldData: PlaylistResponse | undefined) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          user: {
            ...oldData.user,
            allowPlaylistSharing: message.payload
          }
        };
      });
    }

    // Handle recently played visibility toggle
    if (message.type === 'RECENTLY_PLAYED_TOGGLE') {
      console.log('Updating recently played visibility setting from WebSocket:', message.payload);
      // Update the local state immediately
      queryClient.setQueryData([`/api/playlist/${guestUrl}`], (oldData: PlaylistResponse | undefined) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          user: {
            ...oldData.user,
            allowRecentlyPlayedVisibility: message.payload.enabled
          },
          allowRecentlyPlayedVisibility: message.payload.enabled
        };
      });
    }

    // For general playlist updates, refresh the data
    if (message.type === 'PLAYLIST_UPDATE') {
      console.log('Refreshing playlist data from WebSocket');
      queryClient.invalidateQueries({ queryKey: [`/api/playlist/${guestUrl}`] });
    }
  };

  // Initialize WebSocket
  useWebSocket(guestUrl || '', handleMessage, {
    enabled: true,
    showConnectionToasts: false
  });

  // Add new mutation for adding songs to queue
  const addSongToQueueMutation = useMutation({
    mutationFn: async (song: Song) => {
      const params = new URLSearchParams();
      if (guestUrl) {
        params.append('guestUrl', guestUrl);
      }
      return apiRequest("POST", `/api/playlist/songs?${params}`, {
        youtubeId: song.youtubeId,
        title: song.title,
        artist: song.artist,
        thumbnailUrl: song.thumbnailUrl,
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: [`/api/playlist/${guestUrl}`] });
      toast("Song added to playlist");
      // Refetch song limits after adding song
      await refetchSongLimits();
    },
    onError: (error) => {
      console.error('Error adding song to queue:', error);
      toast("Failed to add song to playlist", { variant: "destructive" });
    },
  });

  // Add handler for adding song to queue
  const handleAddToQueue = async (song: Song) => {
    // Check limit before adding
    if (isLimitReached) {
      toast("Song request limit has been reached. Cannot add more songs.", { variant: "destructive" });
      return;
    }

    try {
      await addSongToQueueMutation.mutateAsync(song);
      // Track successful song request — key engagement metric
      analytics.trackClick('song-request', {
        title: song.title,
        artist: song.artist,
        youtubeId: song.youtubeId,
      });
      // Refetch song limits after adding song
      await refetchSongLimits();
    } catch (error) {
      console.error('Error in handleAddToQueue:', error);
    }
  };


  const handleShare = async () => {
    console.log('Share button clicked, username:', username);
    if (!username) {
      console.error('No username available');
      toast("Could not share the music page - missing username", { variant: "destructive" });
      return;
    }

    const shareUrl = `${window.location.origin}/${username}/music`;
    console.log('Attempting to share URL:', shareUrl);

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${playlist?.user?.venueName || username}'s Music Page`,
          text: "Check out this music page and request songs!",
          url: shareUrl,
        });
        console.log('Share successful');
      } catch (error) {
        console.error('Share failed:', error);
        if ((error as Error).name !== 'AbortError') {
          toast("Could not share the music page", { variant: "destructive" });
        }
      }
    } else {
      console.log('Share API not available, falling back to copy');
      handleCopyLink();
    }
    analytics.trackClick('share-button', { context: 'music-header' });
  };

  const handleCopyLink = async () => {
    console.log('Copy button clicked, username:', username);
    if (!username) {
      console.error('No username available');
      toast("Could not copy the music page link - missing username", { variant: "destructive" });
      return;
    }

    const shareUrl = `${window.location.origin}/${username}/music`;
    console.log('Attempting to copy URL:', shareUrl);

    try {
      await navigator.clipboard.writeText(shareUrl);
      console.log('Copy successful');
      toast("Music page link copied to clipboard");
      analytics.trackClick('copy-link', { context: 'music-header' });
    } catch (error) {
      console.error('Copy failed:', error);
      toast("Could not copy the music page link", { variant: "destructive" });
    }
  };


  const queueSongs = playlist?.songs || [];

  // Show loader during the full chain:
  // 1. Account data is still fetching
  // A missing or invalid Local Tunes link is a resolved empty/error state, not
  // an indefinite loader. Only wait for a playlist request when a URL exists.
  const isPageLoading = accountLoading || (Boolean(guestUrl) && isLoading);

  useEffect(() => {
    if (!isPageLoading) {
      (window as any).__publicProfileLoaded = true;
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [isPageLoading, outletContext]);

  if (isPageLoading) {
    if ((window as any).__publicProfileLoaded) {
      return <MusicSkeleton />;
    }
    return null;
  }

  if (error || !playlist || !guestUrl) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <PlaylistCard className="w-full max-w-md mx-4 border-none bg-black text-white">
          <PlaylistCardContent className="pt-6">
            <h1 className="text-2xl font-bold text-red-400 mb-2">
              Playlist Not Found
            </h1>
            <p className="text-gray-300">
              {!guestUrl
                ? "This user doesn't have a Local Tunes playlist configured."
                : "The playlist you're looking for doesn't exist or has been removed."
              }
            </p>
          </PlaylistCardContent>
        </PlaylistCard>
      </div>
    );
  }

  // SEO data - use account name to match other public pages
  const accountName = accountData?.accounts?.[0]?.Account_Name || playlist?.user?.venueName || username || "User";
  const visiblePlaylistsCount = playlist?.playlists?.filter((p: any) => p.isVisibleToGuests).length || 0;
  const totalSongs = playlist?.playlists?.reduce((sum: number, p: any) => sum + (p.songs?.length || 0), 0) || 0;

  // Build the list of hero cards (Now Playing + next 4 queue items)
  const heroCards = [];
  if (playlist?.currentlyPlaying) {
    heroCards.push({
      type: 'now-playing',
      title: playlist.currentlyPlaying.title,
      artist: playlist.currentlyPlaying.artist,
      thumbnailUrl: playlist.currentlyPlaying.thumbnailUrl,
      badge: 'Now Playing',
    });
  }

  const nextQueueItems = queueSongs.slice(0, 4);
  nextQueueItems.forEach((song, idx) => {
    heroCards.push({
      type: 'queue',
      title: song.title,
      artist: song.artist,
      thumbnailUrl: song.thumbnailUrl,
      badge: idx === 0 ? 'Up Next' : `#${idx + 1} in Queue`,
    });
  });

  const totalCards = heroCards.length;
  const activeCard = heroCards[activeHeroIndex] || heroCards[0];


  const desktopQueueSlots = [];
  if (playlist?.currentlyPlaying) {
    desktopQueueSlots.push({
      label: 'Now Playing',
      song: playlist.currentlyPlaying,
      targetIndex: 0
    });
  }
  nextQueueItems.forEach((song, idx) => {
    desktopQueueSlots.push({
      label: idx === 0 ? 'Up Next' : `#${idx + 1}`,
      song: song,
      targetIndex: playlist?.currentlyPlaying ? idx + 1 : idx
    });
  });

  return (
    <>
      <SEO
        title={`${accountName} | Local Music & Playlists | explorers`}
        description={`Discover ${accountName}'s local music collection and playlists on explorers. ${visiblePlaylistsCount > 0 ? `Explore ${visiblePlaylistsCount} playlist${visiblePlaylistsCount > 1 ? 's' : ''} with ${totalSongs} song${totalSongs > 1 ? 's' : ''} featuring city-based music, cultural sounds, and local tunes. ` : 'Experience curated music playlists featuring local sounds and cultural music discovery.'} Connect with regional music, explore city soundtracks, and discover authentic local music experiences.`}
        keywords={[
          `${accountName} music`,
          `${accountName} playlists`,
          "local music",
          "city-based music",
          "cultural music",
          "local sounds",
          "music playlists",
          "regional music",
          "city soundtracks",
          "cultural soundtracks",
          "local music discovery",
          "music exploration",
          "explorers music",
          "public music playlists",
          "local tunes",
          "cultural music discovery",
          "music sharing",
          "playlist discovery"
        ]}
        canonical={createCanonicalUrl(`/${username}/music`)}
        type="website"
        noIndex={false}
        siteName="explorers"
        author={accountName}
      />
      <div className="h-full bg-black min-h-screen overflow-auto preview-scroll pb-20">
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
                onClick={handleShare}
                className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-all duration-300 flex items-center justify-center"
                title="Share"
                aria-label="Share"
              >
                <Share2 className="h-4 w-4" style={{ color: 'white' }} />
              </button>
              <button
                onClick={handleCopyLink}
                className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-all duration-300 flex items-center justify-center"
                title="Copy Link"
                aria-label="Copy Link"
              >
                <Copy className="h-4 w-4" style={{ color: 'white' }} />
              </button>
            </div>
          </div>
        </div>        {/* Main Content */}
        <div className="pt-14 w-full flex flex-col">
          {/* Search Songs Section - Only show if song requests are allowed */}
          {playlist?.user?.allowSongRequests && (
            <div className="max-w-4xl mx-auto px-4 md:px-6 w-full mt-6 mb-4">
              <SearchSongs
                guestUrl={guestUrl}
                disabled={shouldDisableSearch}
                onSongsAddedCallback={async () => {
                  await refetchSongLimits();
                }}
              />
            </div>
          )}

          {/* Now Playing Section */}
          {playlist?.currentlyPlaying ? (
            <>
              {/* MOBILE VIEW (stacked swiper) */}
              <div className="md:hidden w-full mb-4 mt-4 touch-pan-y px-0">
                <div className="relative w-full h-[65vh] min-h-[480px] max-h-[650px] overflow-x-hidden flex items-center justify-start py-8">
                  <div className="absolute inset-y-4 left-4 right-14">
                    {heroCards.map((card, i) => {
                      const diff = (i - activeHeroIndex + totalCards) % totalCards;

                      let position = "hiddenRight";
                      if (diff === 0) position = "active";
                      else if (diff === 1) position = "next";
                      else if (diff === 2) position = "nextNext";
                      else if (diff === totalCards - 1) position = "hiddenLeft";

                      const variants = {
                        active: { x: 0, scale: 1, zIndex: 10, opacity: 1 },
                        next: { x: "12%", scale: 0.9, zIndex: 5, opacity: 1 },
                        nextNext: { x: "24%", scale: 0.8, zIndex: 4, opacity: 1 },
                        hiddenRight: { x: "40%", scale: 0.7, zIndex: 1, opacity: 0 },
                        hiddenLeft: { x: "-110%", scale: 1, zIndex: 11, opacity: 0 }
                      };

                      const handleDragEnd = (_e: any, { offset, velocity }: PanInfo) => {
                        if (offset.x < -50 || velocity.x < -300) {
                          setActiveHeroIndex((prev) => (prev + 1) % totalCards);
                        } else if (offset.x > 50 || velocity.x > 300) {
                          setActiveHeroIndex((prev) => (prev - 1 + totalCards) % totalCards);
                        }
                      };

                      const hasThumbnail = !!card.thumbnailUrl;

                      return (
                        <motion.div
                          key={i}
                          variants={variants}
                          initial={false}
                          animate={position}
                          transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
                          drag={diff === 0 ? "x" : false}
                          dragConstraints={{ left: 0, right: 0 }}
                          dragElastic={0.8}
                          onDragEnd={handleDragEnd}
                          className={`absolute inset-0 h-full rounded-2xl overflow-hidden flex flex-col justify-between transition-all duration-300 ${
                            diff === 0 ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'
                          } ${
                            diff === 0 && card.type === 'now-playing' ? 'now-playing-card-active' : 'border border-white/10 shadow-2xl'
                          }`}
                          style={
                            diff === 0 && card.type === 'now-playing'
                              ? {}
                              : { background: 'linear-gradient(135deg, #181c2b 0%, #0d0e15 50%, #050608 100%)' }
                          }
                        >
                          {card.type === 'now-playing' && hasThumbnail && (
                            <div
                              className="card-dim-blur-bg"
                              style={{ backgroundImage: `url(${card.thumbnailUrl})` }}
                            />
                          )}
                          {/* Top left status/action badge */}
                          <div className="relative z-20 flex justify-between items-start p-5 w-full">
                            <div className={`px-2.5 py-0.5 rounded-full flex items-center justify-center text-[10px] font-bold tracking-wide uppercase font-poppins border ${
                              card.type === 'now-playing'
                                ? 'bg-[var(--primary)] border-[var(--primary)] text-white shadow-lg shadow-[var(--primary)]/20'
                                : 'bg-[#0f1624]/65 border-white/20 text-white/80 backdrop-blur-[3px]'
                            }`}>
                              {card.type === 'now-playing' ? (
                                <svg className="mr-1.5 h-2.5 w-2.5 inline animate-pulse text-white" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                                </svg>
                              ) : null}
                              {card.badge}
                            </div>
                          </div>

                          {/* Album Art (Centered Square or Spinning Vinyl) */}
                          <div className="relative z-20 flex-1 flex items-center justify-center px-6 my-2">
                            {card.type === 'now-playing' ? (
                              <div className="vinyl-record-container">
                                <div className="vinyl-disc">
                                  <div className="vinyl-label">
                                    {hasThumbnail ? (
                                      <img
                                        src={card.thumbnailUrl}
                                        alt={card.title}
                                        className="w-full h-full object-cover select-none pointer-events-none"
                                      />
                                    ) : (
                                      <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                                        <Music2 className="h-6 w-6 text-gray-700" />
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="vinyl-spindle"></div>
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                  <div className="h-14 w-14 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 shadow-lg flex items-center justify-center">
                                    <div className="eq-bars hero-large-eq">
                                      <div className="eq-bar"></div>
                                      <div className="eq-bar"></div>
                                      <div className="eq-bar"></div>
                                      <div className="eq-bar"></div>
                                      <div className="eq-bar"></div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="relative w-[70%] max-w-[240px] aspect-square rounded-2xl overflow-hidden shadow-[0_15px_35px_rgba(0,0,0,0.5)] border border-white/10 bg-gray-900 flex items-center justify-center transition-all duration-500 hover:scale-[1.04]">
                                {hasThumbnail ? (
                                  <img
                                    src={card.thumbnailUrl}
                                    alt={card.title}
                                    className="w-full h-full object-cover select-none pointer-events-none"
                                  />
                                ) : (
                                  <Music2 className="h-12 w-12 text-gray-700" />
                                )}
                              </div>
                            )}
                          </div>

                          {/* Song Info (Title & Artist) */}
                          <div className="relative z-20 px-6 text-center mt-2 pb-8 w-full overflow-hidden">
                            <div className="marquee-container mx-auto max-w-full">
                              <h2 className="text-xl font-poppins font-black text-white leading-tight drop-shadow-md select-none marquee-content">
                                {card.title}
                              </h2>
                            </div>
                            <p className="text-xs text-gray-400 font-medium tracking-wide mt-1 truncate">
                              by {card.artist}
                            </p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
                {totalCards > 1 && (
                  <div className="mobile-swipe-dots" style={{ marginTop: '0.1rem' }}>
                    {heroCards.map((_, i) => (
                      <div
                        key={i}
                        className={`swipe-dot ${i === activeHeroIndex ? 'active' : ''}`}
                        onClick={() => setActiveHeroIndex(i)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* DESKTOP VIEW (banner + strip) */}
              <div className="hidden md:block w-full mb-12 mt-4 px-4">
                <div
                  className={`relative w-full h-[75vh] min-h-[620px] max-h-[820px] rounded-2xl overflow-hidden group/hero max-w-4xl mx-auto transition-all duration-300 select-none flex flex-col justify-between p-8 ${
                    activeCard?.type === 'now-playing' ? 'now-playing-card-active' : 'border border-white/[0.08] hover:border-white/25 shadow-2xl'
                  }`}
                  style={
                    activeCard?.type === 'now-playing'
                      ? {}
                      : { background: 'linear-gradient(135deg, #181c2b 0%, #0d0e15 50%, #050608 100%)' }
                  }
                  onClick={() => setActiveHeroIndex(0)}
                >
                  {activeCard?.type === 'now-playing' && activeCard.thumbnailUrl && (
                    <div
                      className="card-dim-blur-bg"
                      style={{ backgroundImage: `url(${activeCard.thumbnailUrl})` }}
                    />
                  )}
                  {/* Top left badge */}
                  <div className="relative z-20 flex justify-between items-center w-full">
                    <div className={`px-3 py-1 rounded-full flex items-center justify-center text-[11px] font-semibold tracking-wide uppercase font-poppins border ${
                      activeCard?.type === 'now-playing'
                        ? 'bg-[var(--primary)] border-[var(--primary)] text-white shadow-lg shadow-[var(--primary)]/20'
                        : 'bg-[#0f1624]/65 border-white/20 text-white/80 backdrop-blur-[3px]'
                    }`}>
                      {activeCard?.type === 'now-playing' ? (
                        <svg className="mr-1.5 h-3 w-3 inline animate-pulse text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                        </svg>
                      ) : null}
                      {activeCard?.badge}
                    </div>
                  </div>

                  {/* Album Art (Centered Square or Spinning Vinyl) */}
                  <div className="relative z-20 flex-1 flex flex-col items-center justify-center w-full my-4">
                    {activeCard?.type === 'now-playing' ? (
                      <div className="vinyl-record-container">
                        <div className="vinyl-disc">
                          <div className="vinyl-label">
                            {activeCard?.thumbnailUrl ? (
                              <img
                                src={activeCard.thumbnailUrl}
                                alt={activeCard.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                                <Music2 className="h-8 w-8 text-gray-700" />
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="vinyl-spindle"></div>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="h-16 w-16 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 shadow-lg flex items-center justify-center">
                            <div className="eq-bars hero-large-eq">
                              <div className="eq-bar"></div>
                              <div className="eq-bar"></div>
                              <div className="eq-bar"></div>
                              <div className="eq-bar"></div>
                              <div className="eq-bar"></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={`relative w-64 h-64 lg:w-72 lg:h-72 rounded-2xl overflow-hidden shadow-[0_15px_35px_rgba(0,0,0,0.5)] border border-white/10 bg-gray-900 flex items-center justify-center transition-all duration-500 hover:scale-[1.04]`}>
                        {activeCard?.thumbnailUrl ? (
                          <img
                            src={activeCard.thumbnailUrl}
                            alt={activeCard.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Music2 className="h-16 w-16 text-gray-700" />
                        )}
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="text-center mt-4 max-w-[80%] w-full overflow-hidden flex flex-col items-center">
                      <div className="marquee-container w-full">
                        <h4 className="text-2xl font-bold text-white tracking-wide font-poppins marquee-content">
                          {activeCard?.title}
                        </h4>
                      </div>
                      <p className="text-sm text-gray-400 font-poppins mt-1 truncate">
                        by {activeCard?.artist}
                      </p>
                    </div>
                  </div>

                  {/* Bottom row containing desktop queue cards */}
                  <div className="relative z-20 flex justify-end items-end w-full mt-4">
                    <div className="flex items-center gap-2">
                      {desktopQueueSlots.length > 2 && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleScrollQueue('left');
                          }}
                          className="p-1.5 hover:bg-white/10 text-white/60 hover:text-white rounded-full transition-colors cursor-pointer flex-shrink-0"
                          aria-label="Scroll left"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                      )}
                      
                      <div 
                        ref={desktopQueueScrollRef}
                        className="desktop-queue-strip flex gap-3 overflow-x-auto scrollbar-none scroll-smooth select-none py-1 px-2"
                        style={{ width: '316px' }}
                      >
                        {desktopQueueSlots.map((slot, idx) => {
                          const song = slot.song;
                          const hasSong = !!song;
                          const bgImage = song?.thumbnailUrl || '';
                          const isSelected = activeHeroIndex === slot.targetIndex;
                          return (
                            <div
                              className="queue-thumb-wrapper relative w-36 h-[81px] flex-shrink-0 animate-fade-in"
                              key={idx}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (hasSong) {
                                  setActiveHeroIndex(slot.targetIndex);
                                }
                              }}
                            >
                              <span className="queue-thumb-label absolute font-semibold text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded top-1.5 left-1.5 z-10">
                                {slot.label}
                              </span>
                              <button
                                className={`relative w-full h-full rounded-md overflow-hidden transition-all duration-300 border cursor-pointer ${
                                  hasSong
                                    ? (isSelected
                                      ? 'border-white ring-2 ring-white scale-105 shadow-2xl z-10'
                                      : 'border-white/10 opacity-70 hover:opacity-100 hover:scale-105')
                                    : 'border-white/5 opacity-30 cursor-default'
                                }`}
                              >
                                {hasSong ? (
                                  <>
                                    <img
                                      src={bgImage}
                                      alt={song.title}
                                      className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/20" />
                                    {slot.targetIndex === 0 && (
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px] transition-all">
                                        <div className="eq-bars thumbnail-eq">
                                          <div className="eq-bar"></div>
                                          <div className="eq-bar"></div>
                                          <div className="eq-bar"></div>
                                          <div className="eq-bar"></div>
                                          <div className="eq-bar"></div>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="w-full h-full bg-gray-900 flex items-center justify-center">
                                    <Music2 className="h-5 w-5 text-gray-600" />
                                  </div>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {desktopQueueSlots.length > 2 && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleScrollQueue('right');
                          }}
                          className="p-1.5 hover:bg-white/10 text-white/60 hover:text-white rounded-full transition-colors cursor-pointer flex-shrink-0"
                          aria-label="Scroll right"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* No Song Playing State */
            <div className="max-w-4xl mx-auto px-4 md:px-6 mb-8 mt-4 w-full">
              <div className="bg-[#0a0a0a] border border-white/[0.08] rounded-2xl h-[240px] flex items-center justify-center w-full">
                <div className="empty-state text-center">
                  <div className="empty-state__icon flex justify-center mb-2">
                    <Music2 className="h-6 w-6 text-gray-500" />
                  </div>
                  <div className="empty-state__title text-white text-sm font-semibold mb-1">No song playing</div>
                  <div className="empty-state__desc text-gray-500 text-xs">Music will appear here when the host starts playing</div>
                </div>
              </div>
            </div>
          )}

          {/* Accordion Group */}
          <div className="max-w-4xl mx-auto px-4 md:px-6 pb-28 w-full">
            <div className="accordion-group">
              {/* A. Queue Accordion */}
              <div className="accordion">
                <button
                  className="accordion-trigger"
                  onClick={() => setAccordionsOpen(prev => ({ ...prev, queue: !prev.queue }))}
                >
                  <div className="acc-left">
                    <div className="acc-icon">
                      <Music2 className="h-4 w-4" />
                    </div>
                    Queue
                    <span className="acc-count">{(playlist?.songs || []).length} songs</span>
                  </div>
                  <svg className={`acc-chevron ${accordionsOpen.queue ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {accordionsOpen.queue && (
                  <div className="accordion-content">
                    <PlaylistTable
                      songs={playlist?.songs || []}
                      showControls={false}
                      currentPlayingSong={playlist?.currentlyPlaying}
                      guestUrl={guestUrl}
                    />
                  </div>
                )}
              </div>

              {/* B. Recently Played Accordion */}
              {playlist?.user?.allowRecentlyPlayedVisibility !== false && (
                <div className="accordion">
                  <button
                    className="accordion-trigger"
                    onClick={() => setAccordionsOpen(prev => ({ ...prev, history: !prev.history }))}
                  >
                    <div className="acc-left">
                      <div className="acc-icon">
                        <History className="h-4 w-4" />
                      </div>
                      Recently Played
                      <span className="acc-count">{(playlist?.playedSongs || []).length} songs</span>
                    </div>
                    <svg className={`acc-chevron ${accordionsOpen.history ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {accordionsOpen.history && (
                    <div className="accordion-content">
                      {(playlist?.playedSongs?.length ?? 0) > 0 ? (
                        <PlaylistTable
                          songs={playlist?.playedSongs ?? []}
                          showControls={false}
                          showAddToQueue={true}
                          isHistory={true}
                          currentPlayingSong={playlist?.currentlyPlaying}
                          guestUrl={guestUrl}
                          onAddToQueue={handleAddToQueue}
                        />
                      ) : (
                        <p className="text-sm text-gray-300">No songs have been played yet</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* C. Playlists Accordion */}
              {playlist?.user?.allowPlaylistSharing && playlist?.playlists && playlist?.playlists.length > 0 && (
                <div className="accordion">
                  <button
                    className="accordion-trigger"
                    onClick={() => setAccordionsOpen(prev => ({ ...prev, playlists: !prev.playlists }))}
                  >
                    <div className="acc-left">
                      <div className="acc-icon">
                        <Music2 className="h-4 w-4" />
                      </div>
                      Playlists
                      <span className="acc-count">{playlist.playlists.filter(p => p.isVisibleToGuests).length} playlists</span>
                    </div>
                    <svg className={`acc-chevron ${accordionsOpen.playlists ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {accordionsOpen.playlists && (
                    <div className="accordion-content">
                      {playlist?.playlists?.some(p => p.isVisibleToGuests) ? (
                        <Tabs defaultValue={playlist?.playlists?.find(p => p.isVisibleToGuests)?.id.toString()}>
                          <TabsList className="mb-4">
                            {playlist?.playlists
                              ?.filter((p: any) => p.isVisibleToGuests)
                              ?.map((p: any) => (
                                <TabsTrigger key={p.id} value={p.id.toString()}>
                                  {p.name}
                                </TabsTrigger>
                              ))}
                          </TabsList>

                          {playlist?.playlists
                            .filter((p: any) => p.isVisibleToGuests)
                            .map((p: any) => (
                              <TabsContent key={p.id} value={p.id.toString()}>
                                <div className="space-y-4">
                                  {p.description && (
                                    <p className="text-sm text-gray-300">{p.description}</p>
                                  )}
                                  <div className="flex justify-between items-center">
                                    <div className="text-sm text-gray-300">
                                      {p.songs.length} songs
                                    </div>
                                  </div>
                                  {p.songs.length > 0 ? (
                                    <PlaylistTable
                                      songs={p.songs}
                                      showControls={true}
                                      currentPlayingSong={playlist?.currentlyPlaying}
                                      onAddToQueue={handleAddToQueue}
                                      showAddToQueue={true}
                                      guestUrl={guestUrl}
                                      showReorderControls={false}
                                      isPlaylist={true}
                                    />
                                  ) : (
                                    <p className="text-center py-8 text-gray-300">
                                      This playlist is empty
                                    </p>
                                  )}
                                </div>
                              </TabsContent>
                            ))}
                        </Tabs>
                      ) : (
                        <p className="text-center py-8 text-gray-300">
                          No playlists are currently shared
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* D. Play on Device Accordion */}
              {playlist?.allowGuestPlayOnDevice && (
                <div className="accordion">
                  <button
                    className="accordion-trigger"
                    onClick={() => setAccordionsOpen(prev => ({ ...prev, device: !prev.device }))}
                  >
                    <div className="acc-left">
                      <div className="acc-icon">
                        <Volume2 className="h-4 w-4" />
                      </div>
                      Play on Your Device
                    </div>
                    <svg className={`acc-chevron ${accordionsOpen.device ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {accordionsOpen.device && (
                    <div className="accordion-content">
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '0.75rem' }}>
                        The host has allowed playback on guest devices. You can listen to the current song right here.
                      </p>
                      <div className="relative w-full aspect-video mb-4">
                        {playlist?.currentlyPlaying?.youtubeId ? (
                          <iframe
                            src={`https://www.youtube.com/embed/${playlist.currentlyPlaying.youtubeId}?autoplay=1&controls=1&modestbranding=1&rel=0`}
                            width="100%"
                            height="100%"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            title={playlist.currentlyPlaying.title}
                          />
                        ) : (
                          <div className="yt-placeholder">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
                            </svg>
                            No Song Playing, Stay Tuned
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
