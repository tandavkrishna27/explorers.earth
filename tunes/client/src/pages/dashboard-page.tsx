import * as React from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Song } from "@shared/schema";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWebSocket } from "@/hooks/use-websocket";
import { useAnalytics, AnalyticsEventCategory, AnalyticsEventAction } from "@/hooks/use-analytics";
import { BottomNavigation } from "@/components/bottom-navigation";
import { MiniPlayerControl } from "@/components/mini-player-control";
import { useUserSubscriptionPlanInfo } from "@/lib/strapi-queries";
import { cn } from "@/lib/utils"; import { guestCapabilityHandoff } from "@/lib/musicCredential"; import { requestUnlistedShareCapability } from "@/lib/musicPublicationClient";
// UI Components
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  QrCode,
  Share2,
  Copy,
  Download,
  ExternalLink,
  History,
  Music2,
  Music,
  Plus,
  Loader2,
  MoreVertical,
  Pencil,
  Trash,
  PlayCircle,
  Shuffle,
  Search,
  Settings,
  Tablet,
  ListMusic,
  Play,
  AlertCircle
} from "lucide-react";
import { MusicLoader } from "@/components/ui/music-loader";
import QRCode from "react-qr-code";
import PlaylistTable from "@/components/playlist-table";
import SearchSongs from "@/components/search-songs";
import YoutubePlayer from "@/components/youtube-player";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Playlist } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Update the playlist type to reflect new structure
type PlaylistSong = Song & {
  addedAt: Date;
};

// Subscription Plan Card Component
function SubscriptionPlanCard({ username }: { username: string }) {
  const { plan, songRequests, songsQuota, isLoading, isActivePlan } = useUserSubscriptionPlanInfo(username);

  if (isLoading) {
    return (
      <Card className="border rounded-lg shadow-sm mb-4">
        <CardContent className="px-6 py-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading subscription info...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show alert if no active plan instead of subscription details
  if (!isActivePlan) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No Active Subscription Plan - Song requests are disabled because there's no active subscription plan. Please subscribe to a plan to enable song requests.
        </AlertDescription>
      </Alert>
    );
  }

  if (!plan) {
    return null; // Don't show anything if no plan found
  }

  const percentage = songsQuota > 0 ? (songRequests / songsQuota) * 100 : 0;
  const percentageDisplay = percentage.toFixed(2);
  const isNearLimit = percentage >= 80 && percentage < 100;
  const isAtLimit = percentage >= 100;

  return (
    <Card className="border rounded-lg shadow-sm mb-4">
      <CardHeader className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Subscription Plan</h3>
            <p className="text-sm text-muted-foreground">{plan.plan_name}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Song Requests</p>
            <p className={`text-2xl font-bold ${isAtLimit ? 'text-destructive' : isNearLimit ? 'text-orange-500' : 'text-primary'}`}>
              {songRequests} / {songsQuota}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Usage</span>
            <span className={isAtLimit ? 'text-destructive font-medium' : isNearLimit ? 'text-orange-500 font-medium' : ''}>
              {percentageDisplay}%
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${isAtLimit
                ? 'bg-destructive'
                : isNearLimit
                  ? 'bg-orange-500'
                  : 'bg-primary'
                }`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          {isAtLimit && (
            <p className="text-xs text-destructive mt-1">
              You've reached your song request limit for this plan.
            </p>
          )}
          {isNearLimit && (
            <p className="text-xs text-orange-500 mt-1">
              You're approaching your song request limit.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const OWNER_PLAYBACK_URL = "/api/music/dashboard";
export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentPlayingSong, setCurrentPlayingSong] = useState<Song | undefined>();
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [isEditPlaylistOpen, setIsEditPlaylistOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [editPlaylistId, setEditPlaylistId] = useState<number | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [playlistToReplace, setPlaylistToReplace] = useState<{ id: number; songs: Song[]; type: 'play' | 'shuffle' } | null>(null);
  const [shareCapability, setShareCapability] = useState<string>();
  // Local state for guest controls to ensure UI updates immediately
  const [allowSongRequests, setAllowSongRequests] = useState(user?.allowSongRequests ?? false);
  const [allowGuestPlayOnDevice, setAllowGuestPlayOnDevice] = useState(user?.allowGuestPlayOnDevice ?? false);
  const [allowPlaylistSharing, setAllowPlaylistSharing] = useState(user?.allowPlaylistSharing ?? false);
  const [allowRecentlyPlayedVisibility, setAllowRecentlyPlayedVisibility] = useState(user?.allowRecentlyPlayedVisibility ?? true);

  // WebSocket for real-time updates to clients
  const handleMessage = (message: any) => {
    console.log('Dashboard received WebSocket message:', message);
  };

  const { sendMessage } = useWebSocket(user?.guestUrl || '', handleMessage, {
    enabled: !!user?.guestUrl,
    showConnectionToasts: false
  });

  // Update local state when user data changes
  useEffect(() => {
    if (user) {
      setAllowSongRequests(user.allowSongRequests ?? false);
      setAllowGuestPlayOnDevice(user.allowGuestPlayOnDevice ?? false);
      setAllowPlaylistSharing(user.allowPlaylistSharing ?? false);
      setAllowRecentlyPlayedVisibility(user.allowRecentlyPlayedVisibility ?? true);
    }
  }, [user]);

  // Check subscription plan expiry
  const { isActivePlan, isLoading: isLoadingSubscription } = useUserSubscriptionPlanInfo(
    user?.username || undefined
  );

  const isPlanExpired = !isLoadingSubscription && !isActivePlan;
  const [isReplacingQueue, setIsReplacingQueue] = useState(false);
  // Check if we're on mobile
  const isMobile = useIsMobile();
  // State to control which accordion is expanded
  // On desktop, everything should be expanded by default, on mobile nothing expanded initially
  const [accordionValue, setAccordionValue] = useState<string | undefined>(isMobile ? undefined : "all");
  const [isPlayerVisible, setIsPlayerVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  // Ref to track if we've already shown an error toast for playlist loading
  const playlistErrorToastShown = React.useRef(false);

  // Move playlists query inside component
  const { data: playlists } = useQuery<(Playlist & { songs: PlaylistSong[] })[]>({
    queryKey: ["/api/playlists", user?.id],
    enabled: !!user?.username,
  });

  const {
    data: playlist,
    isLoading,
    isError,
    error,
    refetch: refetchPlaylist
  } = useQuery<{
    songs: Song[];
    currentlyPlaying?: Song;
    playedSongs: Song[];
  }>({
    queryKey: [OWNER_PLAYBACK_URL],
    enabled: !!user?.guestUrl && user.guestUrl !== null && user.guestUrl !== undefined && user.guestUrl !== '',
    refetchInterval: 5000, // Poll for updates
    retry: 3, // Retry up to 3 times on error
    retryDelay: (attempt) => Math.min(1000 * Math.pow(2, attempt), 10000), // Exponential backoff
    staleTime: 0,           // always stale so invalidations/refetches apply immediately
    refetchOnWindowFocus: false, // Avoid refetching when window regains focus
    onError: (err) => {
      console.error("Failed to load playlist data:", err);
      // Don't show toast for every failed poll - only show it once
      if (!playlistErrorToastShown.current) {
        toast({
          title: "Failed to load playlist",
          description: "There was an error loading your playlist data. We'll keep trying.",
          variant: "destructive"
        });
        playlistErrorToastShown.current = true;
      }
    }
  });

  const deleteMultipleSongsMutation = useMutation({
    mutationFn: async (songIds: number[]) => {
      if (!Array.isArray(songIds) || songIds.length === 0) {
        throw new Error("No songs selected for deletion");
      }

      console.log("DashboardPage: Starting sequential deletion of songs:", songIds);

      for (const songId of songIds) {
        console.log(`DashboardPage: Deleting song ${songId}...`);
        await apiRequest("DELETE", `/api/playlist/songs/${songId}`);
      }

      console.log("DashboardPage: Successfully deleted all selected songs");
    },
    onSuccess: () => {
      if (user?.guestUrl) {
        queryClient.invalidateQueries({ queryKey: [OWNER_PLAYBACK_URL] });
      }
      toast({
        title: "Songs removed",
        description: "Selected songs have been removed from history",
      });
    },
    onError: (error) => {
      console.error("Error in deleteMultipleSongsMutation:", error);
      toast({
        title: "Failed to remove songs",
        description: error instanceof Error ? error.message : "Could not remove selected songs from history",
        variant: "destructive",
      });
    },
  });

  const handleDeleteMultiple = async (songIds: number[]) => {
    if (!songIds.length) return;

    console.log("DashboardPage: handleDeleteMultiple called with songIds:", songIds);
    try {
      await deleteMultipleSongsMutation.mutateAsync(songIds);
    } catch (error) {
      console.error("Error in handleDeleteMultiple:", error);
    }
  };

  // Update the mutation function for adding songs
  const addMultipleSongsMutation = useMutation({
    mutationFn: async (songs: Song[]) => {
      if (!user) throw new Error("User not authenticated");
      console.log("Attempting to add multiple songs to playlist:", songs);
      // Add songs sequentially to maintain order
      const addedSongs = [];
      for (let index = 0; index < songs.length; index++) {
        const song = songs[index];
        try {
          const addedSong = await apiRequest("POST", "/api/playlist/songs", {
            youtubeId: song.youtubeId,
            title: song.title,
            artist: song.artist,
            thumbnailUrl: song.thumbnailUrl,
            // Queue position is assigned by the owner-predicated repository.
          });
          console.log(`Successfully added song ${index + 1}:`, addedSong);
          addedSongs.push(addedSong);
        } catch (error) {
          console.error(`Failed to add song ${index + 1}:`, error);
          throw new Error(`Failed to add song "${song.title}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      return addedSongs;
    },
    onSuccess: () => {
      if (user?.guestUrl) {
        queryClient.invalidateQueries({ queryKey: [OWNER_PLAYBACK_URL] });
      }
      toast({
        title: "Songs added",
        description: "Selected songs have been added to the playlist",
      });
    },
    onError: (error) => {
      console.error("Error in addMultipleSongsMutation:", error);
      toast({
        title: "Failed to add songs",
        description: error instanceof Error ? error.message : "Could not add selected songs to playlist",
        variant: "destructive",
      });
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      console.log("Attempting to clear history");
      await apiRequest("DELETE", "/api/playlist/history");
    },
    onSuccess: () => {
      if (user?.guestUrl) {
        queryClient.invalidateQueries({ queryKey: [OWNER_PLAYBACK_URL] });
      }
      toast({
        title: "History cleared",
        description: "All songs have been removed from history",
      });
    },
    onError: (error) => {
      console.error("Error in clearHistoryMutation:", error);
      toast({
        title: "Failed to clear history",
        description: "Could not clear history",
        variant: "destructive",
      });
    },
  });

  const updateCurrentlyPlayingMutation = useMutation({
    mutationFn: async (songId: number | null) => {
      // Add delay when stopping current song
      if (songId === null) {
        setCurrentPlayingSong(undefined);
        await new Promise(resolve => setTimeout(resolve, 500)); // Small delay
      }
      if (!user) throw new Error("User not authenticated");
      const url = "/api/playlist/currently-playing";


      await apiRequest("POST", url, { songId });
    },
    onSuccess: (_, songId) => {
      // Only invalidate queries when setting a new song
      if (songId !== null && user?.guestUrl) {
        queryClient.invalidateQueries({ queryKey: [OWNER_PLAYBACK_URL] });
      }
    },
    onError: (error) => {
      toast({
        title: "Failed to update current song",
        description: "Could not update currently playing song",
        variant: "destructive",
      });
    },
  });

  const removeSongMutation = useMutation({
    mutationFn: async (songId: number) => {
      if (!user?.guestUrl || !user?.username) return;
      await apiRequest("DELETE", `/api/playlist/songs/${songId}`);
    },
    onSuccess: () => {
      if (user?.guestUrl) {
        queryClient.invalidateQueries({ queryKey: [OWNER_PLAYBACK_URL] });
      }
    },
    onError: (error) => {
      toast({
        title: "Failed to remove song",
        description: "Could not remove song from playlist",
        variant: "destructive",
      });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (allowSongRequests: boolean) => {
      void allowSongRequests;
      await Promise.reject(new Error("Music guest settings are managed in Explorer."));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      if (user?.guestUrl) {
        queryClient.invalidateQueries({ queryKey: [OWNER_PLAYBACK_URL] });
      }
      toast({
        title: "Settings updated",
        description: "Song request settings have been updated",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update settings",
        description: "Could not update song request settings",
        variant: "destructive",
      });
    },
  });

  const deleteSongMutation = useMutation({
    mutationFn: async (songId: number) => {
      if (!user?.guestUrl || !user?.username) return;
      await apiRequest("DELETE", `/api/playlist/songs/${songId}`);
    },
    onSuccess: () => {
      if (user?.guestUrl) {
        queryClient.invalidateQueries({ queryKey: [OWNER_PLAYBACK_URL] });
      }
      toast({
        title: "Song removed",
        description: "The song has been removed from history",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to remove song",
        description: "Could not remove song from history",
        variant: "destructive",
      });
    },
  });

  const deleteSongFromQueueMutation = useMutation({
    mutationFn: async (songId: number) => {
      if (!user?.guestUrl || !user?.username) return;
      await apiRequest("DELETE", `/api/playlist/songs/${songId}`);
    },
    onSuccess: () => {
      if (user?.guestUrl) {
        queryClient.invalidateQueries({ queryKey: [OWNER_PLAYBACK_URL] });
      }
      toast({
        title: "Song removed",
        description: "The song has been removed from the playlist",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to remove song",
        description: "Could not remove song from playlist",
        variant: "destructive",
      });
    },
  });

  const updateSongPositionMutation = useMutation({
    mutationFn: async ({ songId, position }: { songId: number; position: number }) => {
      if (!user) return;

      console.log("Making position update request:", { songId, position });
      try {
        await apiRequest("PATCH", `/api/playlist/songs/${songId}/position`, { position });
      } catch (error) {
        console.error("Position update request failed:", error);
        throw error;
      }
    },
    onSuccess: () => {
      if (user?.guestUrl) {
        queryClient.refetchQueries({ queryKey: [OWNER_PLAYBACK_URL] });
      }
    },
    onError: (error) => {
      console.error("Error in updateSongPositionMutation:", error);
      toast({
        title: "Failed to update song position",
        description: error instanceof Error ? error.message : "Could not reorder the playlist",
        variant: "destructive",
      });
    },
  });

  const handleUpdatePosition = async (songId: number, newPosition: number) => {
    try {
      console.log("handleUpdatePosition called with:", { songId, newPosition });
      if (typeof songId !== "number" || typeof newPosition !== "number") {
        throw new Error("Invalid song ID or position");
      }
      await updateSongPositionMutation.mutateAsync({ songId, position: newPosition });
    } catch (error) {
      console.error("Error in handleUpdatePosition:", error);
    }
  };

  const { trackEvent } = useAnalytics();

  const handlePlaySong = async (song: Song) => {
    if (!user?.guestUrl || !playlist?.songs) return;

    try {
      await updateCurrentlyPlayingMutation.mutateAsync(song.id);
      setCurrentPlayingSong(song);

      // Track song play event for analytics
      trackEvent({
        category: AnalyticsEventCategory.SONG,
        action: AnalyticsEventAction.PLAY_SONG,
        label: song.title,
        artist: song.artist,
        youtubeId: song.youtubeId,
        userId: user.id,
        songId: song.id
      });

      await queryClient.invalidateQueries({ queryKey: [OWNER_PLAYBACK_URL] });
    } catch (error) {
      console.error("Error playing song:", error);
      toast({
        title: "Failed to play song",
        description: "Could not update playlist",
        variant: "destructive",
      });

      // Track error event
      trackEvent({
        category: AnalyticsEventCategory.ERROR,
        action: AnalyticsEventAction.API_ERROR,
        label: 'Failed to play song',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const handleSongFinished = async () => {
    if (!currentPlayingSong) return;

    // Capture the next song NOW before we clear the current one,
    // because clearing currentlyPlaying triggers a refetch that may reorder the list.
    const currentSongs = playlist?.songs ?? [];
    const currentIndex = currentSongs.findIndex((s) => s.id === currentPlayingSong.id);
    const nextSong = currentIndex >= 0 ? currentSongs[currentIndex + 1] : currentSongs[0];

    try {
      // Clear the currently playing song first
      await updateCurrentlyPlayingMutation.mutateAsync(null);
      setCurrentPlayingSong(undefined);

      // Play the next song if available
      if (nextSong) {
        await updateCurrentlyPlayingMutation.mutateAsync(nextSong.id);
        setCurrentPlayingSong(nextSong);
      }

      if (user?.guestUrl) {
        await queryClient.invalidateQueries({ queryKey: [OWNER_PLAYBACK_URL] });
      }
    } catch (error) {
      console.error("Error handling song finished:", error);
      toast({
        title: "Failed to handle song finished",
        description: "Could not process the next song",
        variant: "destructive",
      });
    }
  };

  const removeFromHistory = (songId: number) => {
    //This function is not used anymore since history is managed by the backend.
  };

  useEffect(() => {
    if (playlist?.songs && playlist.songs.length > 0 && !currentPlayingSong && user?.guestUrl) {
      const firstSong = playlist.songs[0];
      handlePlaySong(firstSong);
    }
  }, [playlist?.songs, user?.guestUrl]);

  const ensureShareCapability = async () => { if (shareCapability) return shareCapability; const ownerId = user?.id; if (!ownerId) throw new Error("Music sharing requires an authenticated owner."); const capability = await requestUnlistedShareCapability(ownerId); setShareCapability(capability); return capability; };
  const handleCopyLink = async () => {
    if (!user?.guestUrl) return;

    try {
      const capability = await ensureShareCapability();
      await navigator.clipboard.writeText(guestCapabilityHandoff(capability, user.guestUrl));
      toast({
        title: "Guest access copied",
        description: "The header-only playlist handoff has been copied to the clipboard.",
      });
      trackEvent({
        category: AnalyticsEventCategory.PLAYLIST,
        action: AnalyticsEventAction.SHARE_PLAYLIST,
        label: 'Copy Link',
        method: 'clipboard',
        userId: user.id,
        venueName: user.venueName
      });
    } catch (error) {
      console.error("Error copying link:", error);
      toast({
        title: "Failed to copy link",
        description: "Could not copy the link to clipboard",
        variant: "destructive",
      });

      // Track error event
      trackEvent({
        category: AnalyticsEventCategory.ERROR,
        action: AnalyticsEventAction.FEATURE_USE,
        label: 'Failed to copy playlist link',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const handleShare = async () => {
    if (!user?.guestUrl) return;


    if (navigator.share) {
      try {
        const capability = await ensureShareCapability();
        await navigator.share({
          title: `${user.venueName}'s Playlist`,
          text: guestCapabilityHandoff(capability, user.guestUrl),
          url: `${window.location.origin}/playlist/${user.guestUrl}`,
        });

        // Track share event for analytics
        trackEvent({
          category: AnalyticsEventCategory.PLAYLIST,
          action: AnalyticsEventAction.SHARE_PLAYLIST,
          label: 'Web Share API',
          method: 'native',
          userId: user.id,
          venueName: user.venueName
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          toast({
            title: "Share Failed",
            description: "Could not share the playlist",
            variant: "destructive",
          });

          // Track error event, but only if not user-cancelled (AbortError)
          trackEvent({
            category: AnalyticsEventCategory.ERROR,
            action: AnalyticsEventAction.FEATURE_USE,
            label: 'Failed to share playlist',
            error: error instanceof Error ? error.message : 'Unknown error',
            method: 'native'
          });
        }
      }
    } else {
      // Fall back to copy link approach
      handleCopyLink();
    }
  };

  const handleDownloadQR = () => {
    if (!user?.guestUrl) return;
    const guestUrl = `${window.location.origin}/playlist/${user.guestUrl}`;
    const svg = document.querySelector(".qr-code-container svg");
    if (!svg) return;

    try {
      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");

      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const link = document.createElement("a");
        link.download = `${user.venueName.toLowerCase().replace(/\s+/g, "-")}-playlist-qr.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();

        // Track QR code download event
        trackEvent({
          category: AnalyticsEventCategory.PLAYLIST,
          action: AnalyticsEventAction.SHARE_PLAYLIST,
          label: 'QR Code Download',
          method: 'qrcode',
          userId: user.id,
          venueName: user.venueName
        });
      };

      img.onerror = (error) => {
        console.error("Error loading QR code image:", error);
        toast({
          title: "Failed to download QR code",
          description: "Could not generate QR code image",
          variant: "destructive",
        });

        // Track error event
        trackEvent({
          category: AnalyticsEventCategory.ERROR,
          action: AnalyticsEventAction.FEATURE_USE,
          label: 'Failed to download QR code',
          error: error instanceof Error ? error.message : 'Image load error'
        });
      };

      img.src = "data:image/svg+xml;base64," + btoa(svgData);
    } catch (error) {
      console.error("Error generating QR code:", error);
      toast({
        title: "Failed to download QR code",
        description: "Could not generate QR code image",
        variant: "destructive",
      });

      // Track error event
      trackEvent({
        category: AnalyticsEventCategory.ERROR,
        action: AnalyticsEventAction.FEATURE_USE,
        label: 'Failed to download QR code',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const handleDeleteSong = async (songId: number) => {
    try {
      await deleteSongMutation.mutateAsync(songId);
    } catch (error) {
      console.error("Error in handleDeleteSong:", error);
    }
  };

  const handleClearHistory = async () => {
    try {
      await clearHistoryMutation.mutateAsync();
    } catch (error) {
      console.error("Error in handleClearHistory:", error);
    }
  };

  const handleDeleteFromQueue = async (songId: number) => {
    try {
      await deleteSongFromQueueMutation.mutateAsync(songId);
    } catch (error) {
      console.error("Error in handleDeleteFromQueue:", error);
    }
  };

  const handleAddMultiple = async (songs: Song[]) => {
    if (!songs.length) return;
    try {
      await addMultipleSongsMutation.mutateAsync(songs);
    } catch (error) {
      console.error("Error in handleAddMultiple:", error);
    }
  };

  const createPlaylistMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      if (!user) throw new Error("User not authenticated");
      const url = "/api/playlists";
      return apiRequest("POST", url, data);
    },
    onSuccess: (result) => {
      setIsCreatePlaylistOpen(false);
      setPlaylistName("");
      setPlaylistDescription("");
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });

      toast({
        title: "Playlist created",
        description: "Your new playlist has been created successfully",
      });

      // Track playlist creation event
      trackEvent({
        category: AnalyticsEventCategory.PLAYLIST,
        action: AnalyticsEventAction.CREATE_PLAYLIST,
        label: 'Create new playlist',
        playlistName: result.name,
        userId: user?.id
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to create playlist",
        description: error instanceof Error ? error.message : "Could not create playlist",
        variant: "destructive",
      });

      // Track error event
      trackEvent({
        category: AnalyticsEventCategory.ERROR,
        action: AnalyticsEventAction.API_ERROR,
        label: 'Failed to create playlist',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    },
  });

  const updatePlaylistMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name: string; description: string } }) => {
      if (!user) throw new Error("User not authenticated");
      const url = `/api/playlists/${id}`;
      return apiRequest("PATCH", url, data);
    },
    onSuccess: () => {
      setIsEditPlaylistOpen(false);
      setPlaylistName("");
      setPlaylistDescription("");
      setEditPlaylistId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/playlists"] });
      toast({
        title: "Playlist updated",
        description: "Your playlist has been updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update playlist",
        description: error instanceof Error ? error.message : "Could not update playlist",
        variant: "destructive",
      });
    },
  });

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistName.trim()) {
      toast({
        title: "Invalid playlist name",
        description: "Please enter a name for your playlist",
        variant: "destructive",
      });
      return;
    }
    await createPlaylistMutation.mutateAsync({
      name: playlistName.trim(),
      description: playlistDescription.trim(),
    });
  };

  const handleUpdatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistName.trim() || !editPlaylistId) {
      toast({
        title: "Invalid playlist name",
        description: "Please enter a name for your playlist",
        variant: "destructive",
      });
      return;
    }
    await updatePlaylistMutation.mutateAsync({
      id: editPlaylistId,
      data: {
        name: playlistName.trim(),
        description: playlistDescription.trim(),
      }
    });
  };

  const handleEditPlaylist = (playlist: Playlist) => {
    setEditPlaylistId(playlist.id);
    setPlaylistName(playlist.name);
    setPlaylistDescription(playlist.description || "");
    setIsEditPlaylistOpen(true);
  };

  const deletePlaylistMutation = useMutation({
    mutationFn: async (playlistId: number) => {
      if (!user) throw new Error("User not authenticated");
      await apiRequest("DELETE", `/api/playlists/${playlistId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", user?.id] });
      toast({
        title: "Playlist deleted",
        description: "Playlist has been deleted successfully",
      });
    },
    onError: (error) => {
      console.error("Error deleting playlist:", error);
      toast({
        title: "Failed to delete playlist",
        description: error instanceof Error ? error.message : "Could not delete playlist",
        variant: "destructive",
      });
    },
  });

  // Update mutation handlers to work with new PlaylistSong type
  const addSongsToPlaylistMutation = useMutation({
    mutationFn: async ({ playlistId, songs }: { playlistId: number; songs: Song[] }) => {
      const url = `/api/playlists/${playlistId}/songs`;
      return Promise.all(songs.map((song) => apiRequest("POST", url, {
        youtubeId: song.youtubeId, title: song.title, artist: song.artist, thumbnailUrl: song.thumbnailUrl,
      })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", user?.id] });
      toast({
        title: "Songs added",
        description: "Songs have been added to the playlist",
      });
    },
    onError: (error) => {
      console.error("Error adding songs to playlist:", error);
      toast({
        title: "Failed to add songs",
        description: error instanceof Error ? error.message : "Could not add songs to playlist",
        variant: "destructive",
      });
    },
  });

  const handleDeletePlaylist = async (playlistId: number) => {
    try {
      await deletePlaylistMutation.mutateAsync(playlistId);
    } catch (error) {
      console.error("Error in handleDeletePlaylist:", error);
    }
  };

  const handleAddSongsToPlaylist = async (playlistId: number, songs: Song[]) => {
    if (!songs.length) return;
    try {
      await addSongsToPlaylistMutation.mutateAsync({ playlistId, songs });
    } catch (error) {
      console.error("Error in handleAddSongsToPlaylist:", error);
    }
  };

  const deletePlaylistSongMutation = useMutation({
    mutationFn: async ({ playlistId, songId }: { playlistId: number; songId: number }) => {
      const url = `/api/playlists/${playlistId}/songs/${songId}`;
      await apiRequest("DELETE", url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", user?.id] });
      toast({
        title: "Song removed",
        description: "The song has been removed from the playlist",
      });
    },
    onError: (error) => {
      console.error("Error removing song from playlist:", error);
      toast({
        title: "Failed to remove song",
        description: error instanceof Error ? error.message : "Could not remove song from playlist",
        variant: "destructive",
      });
    },
  });

  const handleDeletePlaylistSong = async (playlistId: number, songId: number) => {
    try {
      await deletePlaylistSongMutation.mutateAsync({ playlistId, songId });
    } catch (error) {
      console.error("Error in handleDeletePlaylistSong:", error);
    }
  };

  const addSongToMainPlaylistMutation = useMutation({
    mutationFn: async (song: Song) => {
      if (!user) throw new Error("User not authenticated");
      // Add song to main playlist at position 0
      await apiRequest("POST", "/api/playlist/songs", {
        youtubeId: song.youtubeId,
        title: song.title,
        artist: song.artist,
        thumbnailUrl: song.thumbnailUrl,
        // Queue position is assigned by the owner-predicated repository.
      });
    },
    onSuccess: () => {
      if (user?.guestUrl) {
        queryClient.invalidateQueries({ queryKey: [OWNER_PLAYBACK_URL] });
      }
      toast({
        title: "Song added",
        description: "The song has been added to your current playlist",
      });
    },
    onError: (error) => {
      console.error("Error adding song to main playlist:", error);
      toast({
        title: "Failed to add song",
        description: error instanceof Error ? error.message : "Could not add song to main playlist",
        variant: "destructive",
      });
    },
  });

  // Update the add to queue mutation
  const addToQueueMutation = useMutation({
    mutationFn: async (song: Song) => {
      if (!user) throw new Error("User not authenticated");
      console.log("Adding song to queue:", song);
      try {
        const response = await apiRequest("POST", "/api/playlist/songs", {
          youtubeId: song.youtubeId,
          title: song.title,
          artist: song.artist,
          thumbnailUrl: song.thumbnailUrl,
          // Queue position is assigned by the owner-predicated repository.
        });
        console.log("Successfully added song to queue:", response);
        return response;
      } catch (error) {
        console.error("Failed to add song to queue:", error);
        throw error;
      }
    },
    onSuccess: (result, song) => {
      if (user?.guestUrl) {
        queryClient.invalidateQueries({ queryKey: [OWNER_PLAYBACK_URL] });
      }
      toast({
        title: "Song added",
        description: "The song has been added to your queue",
      });

      // Track song added to queue event
      trackEvent({
        category: AnalyticsEventCategory.SONG,
        action: AnalyticsEventAction.ADD_TO_QUEUE,
        label: song.title,
        artist: song.artist,
        youtubeId: song.youtubeId,
        userId: user?.id,
        songId: song.id,
        source: 'manual_add'
      });
    },
    onError: (error, song) => {
      console.error("Error adding song to queue:", error);
      toast({
        title: "Failed to add song",
        description: error instanceof Error ? error.message : "Could not add song to queue",
        variant: "destructive",
      });

      // Track error event
      trackEvent({
        category: AnalyticsEventCategory.ERROR,
        action: AnalyticsEventAction.API_ERROR,
        label: 'Failed to add song to queue',
        error: error instanceof Error ? error.message : 'Unknown error',
        songTitle: song.title,
        youtubeId: song.youtubeId
      });
    },
  });

  const handlePlaySavedPlaylistSong = async (song: Song) => {
    try {
      // First add the song to the main playlist
      await addSongToMainPlaylistMutation.mutateAsync(song);

      // Then play it
      if (user?.guestUrl) {
        const response = await apiRequest("GET", OWNER_PLAYBACK_URL);
        const data = await response.json();
        const addedSong = data.songs.find((s: Song) => s.youtubeId === song.youtubeId);
        if (addedSong) {
          handlePlaySong(addedSong);
        }
      }
    } catch (error) {
      console.error("Error playing song from saved playlist:", error);
      toast({
        title: "Failed to play song",
        description: "Could not play song from saved playlist",
        variant: "destructive",
      });
    }
  };

  // Add the reorder mutation after other mutations
  const updatePlaylistSongPositionMutation = useMutation({
    mutationFn: async ({ playlistId, songId, position }: { playlistId: number; songId: number; position: number }) => {
      console.log("Making playlist reorder request:", { playlistId, songId, position });
      try {
        const response = await apiRequest("PATCH", `/api/playlists/${playlistId}/reorder`, { songId, position });
        console.log("Reorder response:", response);
        return response;
      } catch (error) {
        console.error("Failed to reorder:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", user?.id] });
      toast({
        title: "Position updated",
        description: "Song order has been updated successfully",
      });
    },
    onError: (error) => {
      console.error("Error updating playlist song position:", error);
      toast({
        title: "Failed to update position",
        description: error instanceof Error ? error.message : "Could not reorder the playlist",
        variant: "destructive",
      });
    },
  });

  const handlePlaylistSongPositionUpdate = async (songId: number, newPosition: number, playlistId: number) => {
    try {
      console.log("Attempting to update playlist song position:", { songId, newPosition, playlistId });

      if (!playlistId || !songId || typeof newPosition !== "number") {
        throw new Error("Invalid parameters for reordering");
      }

      // Get the current playlist
      const currentPlaylist = playlists?.find((p) => p.id === playlistId);
      if (!currentPlaylist) {
        throw new Error("Playlist not found");
      }

      // Get current song's position
      const currentSong = currentPlaylist.songs.find((s) => s.id === songId);
      if (!currentSong) {
        throw new Error("Song not found in playlist");
      }

      // Ensure position is within valid range
      const maxPosition = currentPlaylist.songs.length - 1;
      if (newPosition < 0 || newPosition > maxPosition) {
        throw new Error(`Invalid position. Must be between 0 and ${maxPosition}`);
      }

      await updatePlaylistSongPositionMutation.mutateAsync({
        playlistId,
        songId,
        position: newPosition,
      });

      // Force a refetch to ensure UI is up to date
      await queryClient.invalidateQueries({ queryKey: ["/api/playlists", user?.id] });
    } catch (error) {
      console.error("Error in handlePlaylistSongPositionUpdate:", error);
      toast({
        title: "Failed to update song position",
        description: error instanceof Error ? error.message : "Could not reorder the playlist",
        variant: "destructive",
      });
    }
  };

  const handleAddPlaylistToQueue = async (playlistSongs: PlaylistSong[], playlistId?: number) => {
    if (!playlistSongs.length) {
      toast({
        title: "Empty playlist",
        description: "This playlist has no songs to add to the queue",
        variant: "destructive",
      });
      return;
    }

    try {
      await addMultipleSongsMutation.mutateAsync(playlistSongs);

      toast({
        title: "Playlist added to queue",
        description: `Added ${playlistSongs.length} songs to your queue`,
      });

      // Track playlist added to queue event
      trackEvent({
        category: AnalyticsEventCategory.PLAYLIST,
        action: AnalyticsEventAction.ADD_PLAYLIST_TO_QUEUE,
        label: 'Add playlist to queue',
        playlistId: playlistId,
        songCount: playlistSongs.length,
        userId: user?.id
      });
    } catch (error) {
      console.error("Error adding playlist to queue:", error);

      toast({
        title: "Failed to add playlist",
        description: "Could not add playlist songs to queue",
        variant: "destructive",
      });

      // Track error event
      trackEvent({
        category: AnalyticsEventCategory.ERROR,
        action: AnalyticsEventAction.API_ERROR,
        label: 'Failed to add playlist to queue',
        error: error instanceof Error ? error.message : 'Unknown error',
        songCount: playlistSongs.length
      });
    }
  };

  // Add new mutation after other mutations
  const updatePlaylistVisibilityMutation = useMutation({
    mutationFn: async ({ playlistId, isVisible }: { playlistId: number; isVisible: boolean }) => {
      return apiRequest("PATCH", `/api/playlists/${playlistId}/visibility`, {
        isVisible,
      });
    },
    onMutate: async ({ playlistId, isVisible }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/playlists", user?.id] });
      const previousPlaylists = queryClient.getQueryData<(Playlist & { songs: PlaylistSong[] })[]>(["/api/playlists", user?.id]);

      if (previousPlaylists) {
        queryClient.setQueryData<(Playlist & { songs: PlaylistSong[] })[]>(
          ["/api/playlists", user?.id],
          (old) =>
            old?.map((playlist) =>
              playlist.id === playlistId ? { ...playlist, isVisibleToGuests: isVisible } : playlist
            ) ?? []
        );
      }

      return { previousPlaylists };
    },
    onError: (err, { playlistId, isVisible }, context) => {
      if (context?.previousPlaylists) {
        queryClient.setQueryData(["/api/playlists", user?.id], context.previousPlaylists);
      }
      toast({
        title: "Failed to update visibility",
        description: "Could not update playlist visibility. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: (data, { isVisible }) => {
      toast({
        title: "Visibility updated",
        description: `Playlist is now ${isVisible ? "visible" : "hidden"} to guests`,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists", user?.id] });
    },
  });

  // Add the new mutation after other mutations
  const replaceQueueWithPlaylistMutation = useMutation({
    mutationFn: async ({ songs, playlistId }: { songs: Song[]; playlistId: number }) => {
      if (!user) throw new Error("User not authenticated");
      console.log("Replacing queue with playlist:", playlistId);
      setIsReplacingQueue(true);

      try {
        // First stop the current song
        console.log("Stopping current song");
        await updateCurrentlyPlayingMutation.mutateAsync(null);

        // Add delay to ensure current song is stopped
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get current queue after stopping song
        const response = await apiRequest("GET", OWNER_PLAYBACK_URL);
        const currentQueue = await response.json();

        // Delete existing songs one by one
        if (currentQueue.songs?.length > 0) {
          console.log("Clearing current queue:", currentQueue.songs.length, "songs");
          for (const song of currentQueue.songs) {
            await apiRequest("DELETE", `/api/playlist/songs/${song.id}`);
          }
        }

        // Add delay after clearing queue
        await new Promise(resolve => setTimeout(resolve, 500));

        // Add all songs from the playlist
        console.log("Adding new songs from playlist");
        for (let i = 0; i < songs.length; i++) {
          const song = songs[i];
          try {
            const addedSong = await apiRequest("POST", "/api/playlist/songs", {
              youtubeId: song.youtubeId,
              title: song.title,
              artist: song.artist,
              thumbnailUrl: song.thumbnailUrl,
              // Queue position is assigned by the owner-predicated repository.
            });
            console.log(`Added song ${i + 1}:`, addedSong);
          } catch (error) {
            console.error(`Failed to add song ${i + 1}:`, error);
            throw error;
          }
        }

        // Add delay before fetching updated queue
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get the updated queue
        const updatedResponse = await apiRequest("GET", OWNER_PLAYBACK_URL);
        const updatedQueue = await updatedResponse.json();

        // Start playing the first song
        if (updatedQueue.songs?.length > 0) {
          const firstSong = updatedQueue.songs[0];
          console.log("Starting playback of first song:", firstSong);

          // Set the new song as currently playing
          await updateCurrentlyPlayingMutation.mutateAsync(firstSong.id);
          setCurrentPlayingSong(firstSong);
        }

        return updatedQueue.songs;
      } catch (error) {
        console.error("Error in replaceQueueWithPlaylist:", error);
        throw error;
      } finally {
        setIsReplacingQueue(false);
      }
    },
    onSuccess: () => {
      if (user?.guestUrl) {
        queryClient.invalidateQueries({ queryKey: [OWNER_PLAYBACK_URL] });
      }
      toast({
        title: "Playlist Started",
        description: "The playlist has been loaded and started playing",
      });
      // Close the dialog after successful operation
      setPlaylistToReplace(null);
    },
    onError: (error) => {
      console.error("Failed to replace queue with playlist:", error);
      toast({
        title: "Failed to Start Playlist",
        description: error instanceof Error ? error.message : "There was an error replacing the current queue. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update the shuffle mutation with similar sequencing
  const shufflePlaylistMutation = useMutation({
    mutationFn: async ({ songs, playlistId }: { songs: Song[]; playlistId: number }) => {
      if (!user) throw new Error("User not authenticated");
      console.log("Shuffling and replacing queue with playlist:", playlistId);
      setIsReplacingQueue(true);

      try {
        // First stop the current song
        console.log("Stopping current song");
        await updateCurrentlyPlayingMutation.mutateAsync(null);

        // Add delay to ensure current song is stopped
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get current queue after stopping song
        const response = await apiRequest("GET", OWNER_PLAYBACK_URL);
        const currentQueue = await response.json();

        // Delete existing songs one by one
        if (currentQueue.songs?.length > 0) {
          console.log("Clearing current queue:", currentQueue.songs.length, "songs");
          for (const song of currentQueue.songs) {
            await apiRequest("DELETE", `/api/playlist/songs/${song.id}`);
          }
        }

        // Add delay after clearing queue
        await new Promise(resolve => setTimeout(resolve, 500));

        // Shuffle the songs array
        const shuffledSongs = [...songs].sort(() => Math.random() - 0.5);
        console.log("Current queue cleared, adding shuffled songs");

        // Add all songs from the playlist in shuffled order
        for (let i = 0; i < shuffledSongs.length; i++) {
          const song = shuffledSongs[i];
          try {
            const addedSong = await apiRequest("POST", "/api/playlist/songs", {
              youtubeId: song.youtubeId,
              title: song.title,
              artist: song.artist,
              thumbnailUrl: song.thumbnailUrl,
              // Queue position is assigned by the owner-predicated repository.
            });
            console.log(`Added song ${i + 1}:`, addedSong);
          } catch (error) {
            console.error(`Failed to add song ${i + 1}:`, error);
            throw error;
          }
        }

        // Add delay before starting playback
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get the updated queue
        const updatedResponse = await apiRequest("GET", OWNER_PLAYBACK_URL);
        const updatedQueue = await updatedResponse.json();

        // Start playing the first song
        if (updatedQueue.songs?.length > 0) {
          const firstSong = updatedQueue.songs[0];
          console.log("Starting playback of first shuffled song:", firstSong);

          // Set the new song as currently playing
          await updateCurrentlyPlayingMutation.mutateAsync(firstSong.id);
          setCurrentPlayingSong(firstSong);
        }

        return updatedQueue.songs;
      } catch (error) {
        console.error("Error in shufflePlaylist:", error);
        throw error;
      } finally {
        setIsReplacingQueue(false);
      }
    },
    onSuccess: () => {
      if (user?.guestUrl) {
        queryClient.invalidateQueries({ queryKey: [OWNER_PLAYBACK_URL] });
      }
      toast({
        title: "Playlist Shuffled",
        description: "The playlist has been shuffled and started playing",
      });
      // Close the dialog after successful operation
      setPlaylistToReplace(null);
    },
    onError: (error) => {
      console.error("Failed to shuffle playlist:", error);
      toast({
        title: "Failed to Shuffle Playlist",
        description: error instanceof Error ? error.message : "There was an error shuffling the playlist. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update the AlertDialog to show loading state
  const handleShufflePlaylist = async (playlistId: number, songs: Song[]) => {
    try {
      return await shufflePlaylistMutation.mutateAsync({ songs, playlistId });
    } catch (error) {
      console.error("Error in handleShufflePlaylist:", error);
      throw error;
    }
  };

  const handlePlayPlaylist = async (playlistId: number, songs: Song[]) => {
    try {
      return await replaceQueueWithPlaylistMutation.mutateAsync({ songs, playlistId });
    } catch (error) {
      console.error("Error in handlePlayPlaylist:", error);
      throw error;
    }
  };

  const handleAddToQueue = (song: Song) => addToQueueMutation.mutate(song);

  if (!user || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <MusicLoader size="lg" />
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Failed to load playlist</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              if (user?.guestUrl) {
                queryClient.invalidateQueries({ queryKey: [OWNER_PLAYBACK_URL] });
              }
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Add loading state during playlist replacement */}
      {isReplacingQueue && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <MusicLoader size="lg" />
            <p className="text-lg font-medium">Updating playlist...</p>
          </div>
        </div>
      )}

      <div className="container mx-auto py-6 pb-24 sm:pb-6 space-y-6">
        <BottomNavigation onAccordionValueChange={setAccordionValue} />
        <Accordion
          type="single"
          collapsible
          value={accordionValue}
          onValueChange={(value) => {
            if (accordionValue === value && value) {
              // If clicking an already open accordion, we want to close it
              setAccordionValue(undefined);
            } else {
              // If opening a new accordion or closing a different one
              setAccordionValue(value);
            }
          }}
          defaultValue=""
        >
          <AccordionItem value="share" className="border rounded-lg shadow-sm">
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center">
                <Share2 className="h-5 w-5 mr-2 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold text-left">Share Your Playlist</h3>
                  <p className="text-sm text-muted-foreground text-left">Let others join your playlist and request songs</p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6 pt-2 space-y-4">
              <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm text-muted-foreground mb-2">Guest URL:</p>
                  <code className="block p-2 bg-muted rounded-md text-xs break-all">
                    {`${window.location.origin}/playlist/${user.guestUrl}`}
                  </code>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={handleCopyLink}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleShare}>
                    <Share2 className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" asChild>
                    <a href={`${window.location.origin}/playlist/${user.guestUrl}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>

              <Accordion type="single" collapsible>
                <AccordionItem value="qr">
                  <AccordionTrigger onClick={() => { void ensureShareCapability(); }}>
                    <div className="flex items-center">
                      <QrCode className="h-4 w-4 mr-2" />
                      Show QR Code
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col items-center gap-4">
                      <div className="bg-white p-4 rounded-lg qr-code-container">
                        <QRCode
                          value={shareCapability ? guestCapabilityHandoff(shareCapability, user.guestUrl) : "explorers-music-guest/v1\nCapability loading"}
                          style={{ width: "200px", height: "200px" }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 justify-center">
                        <Button variant="outline" size="sm" onClick={handleDownloadQR}>
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleShare}>
                          <Share2 className="h-4 w-4 mr-2" />
                          Share
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Add anchor divs for navigation with proper offset */}
        <div id="now-playing" className="scroll-mt-20"></div>

        {/* Subscription Plan Info */}
        {user?.username && (
          <SubscriptionPlanCard username={user.username} />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
          <div className="space-y-4 sm:space-y-6">
            {/* Now Playing Section - Always visible on all devices */}
            <div>
              <Card className="border rounded-lg shadow-sm mb-4">
                <CardHeader className="px-6 py-4">
                  <div className="flex items-center">
                    <Play className="h-5 w-5 mr-2 text-primary" />
                    <div>
                      <h3 className="text-lg font-semibold text-left">Now Playing</h3>
                      <p className="text-sm text-muted-foreground text-left">
                        {(currentPlayingSong || playlist?.currentlyPlaying)?.title || "No song selected"}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pb-6">
                  <div className="relative w-full aspect-video mb-4">
                    <YoutubePlayer
                      currentSong={currentPlayingSong || playlist?.currentlyPlaying}
                      nextSong={playlist?.songs?.[0]}
                      previousSong={playlist?.playedSongs?.[0]} // Use the first song from played songs as previous
                      showAutoplayControl={true}
                      onSongFinished={handleSongFinished}
                      onPreviousSong={async () => {
                        // Play the most recently played song from history
                        if (playlist?.playedSongs?.[0] && playlist?.playedSongs?.length > 0) {
                          try {
                            await handlePlaySong(playlist.playedSongs[0]);
                            toast({
                              title: "Playing previous song",
                              description: `Now playing ${playlist.playedSongs[0].title}`,
                            });
                          } catch (error) {
                            console.error("Error playing previous song:", error);
                            toast({
                              title: "Error",
                              description: "Could not play previous song",
                              variant: "destructive"
                            });
                          }
                        }
                      }}
                      onPlayStateChange={(isPlayingState) => setIsPlaying(isPlayingState)}
                      fetchCurrentSong={async () => {
                        if (!user?.guestUrl) return undefined;
                        try {
                          const response = await apiRequest("GET", OWNER_PLAYBACK_URL);
                          const data = await response.json();
                          return data.currentlyPlaying;
                        } catch (error) {
                          console.error("Error fetching current song:", error);
                          return undefined;
                        }
                      }}
                      guestUrl={user?.guestUrl}
                      username={user?.username}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Queue Section */}
            {/* Anchor div placed right before accordion for proper scrolling */}
            <div id="queue" className="scroll-mt-24"></div>
            <Accordion
              type="single"
              collapsible
              className="mb-4"
              value={accordionValue === "queue" ? "queue" : undefined}
              defaultValue={isMobile ? undefined : "queue"}
              onValueChange={(value) => {
                if (accordionValue === "queue" && !value) {
                  // If clicking an already open accordion, we want to close it
                  setAccordionValue(undefined);
                } else if (value) {
                  // If opening a new accordion, update the value
                  setAccordionValue(value);
                }
              }}
            >
              <AccordionItem value="queue" className="border rounded-lg shadow-sm">
                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                  <div className="flex items-center">
                    <ListMusic className="h-5 w-5 mr-2 text-primary" />
                    <div>
                      <h3 className="text-lg font-semibold text-left">Queue</h3>
                      <p className="text-sm text-muted-foreground text-left">Your upcoming songs</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  <div className="mt-4">
                    <PlaylistTable
                      songs={playlist?.songs || []}
                      showControls
                      onPlaySong={handlePlaySong}
                      onDeleteSong={handleDeleteFromQueue}
                      onUpdatePosition={handleUpdatePosition}
                      currentPlayingSong={currentPlayingSong || playlist?.currentlyPlaying}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <div className="space-y-4 sm:space-y-8">
            {/* Anchor div placed right before search accordion for proper scrolling */}
            <div id="search" className="scroll-mt-24"></div>

            <Accordion
              type="single"
              collapsible
              className="mb-4"
              value={accordionValue === "add-songs" ? "add-songs" : undefined}
              defaultValue={isMobile ? undefined : "add-songs"}
              onValueChange={(value) => {
                // Prevent opening if plan is expired
                if (isPlanExpired && value === "add-songs") {
                  return;
                }
                if (accordionValue === "add-songs" && !value) {
                  // If clicking an already open accordion, we want to close it
                  setAccordionValue(undefined);
                } else if (value) {
                  // If opening a new accordion, update the value
                  setAccordionValue(value);
                }
              }}
            >
              <AccordionItem
                value="add-songs"
                className={cn("border rounded-lg shadow-sm", isPlanExpired && "opacity-50")}
              >
                <AccordionTrigger
                  className={cn("px-6 py-4 hover:no-underline", isPlanExpired && "cursor-not-allowed pointer-events-none")}
                  disabled={isPlanExpired}
                >
                  <div className="flex items-center">
                    <Search className="h-5 w-5 mr-2 text-primary" />
                    <div>
                      <h3 className="text-lg font-semibold text-left">Add Songs</h3>
                      <p className="text-sm text-muted-foreground text-left">Search and add songs to your playlist</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  <Card className="shadow-sm border-0">
                    <CardContent className="p-0 pt-4">
                      <SearchSongs />
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Anchor div placed right before guest controls accordion for proper scrolling */}
            <div id="guest-controls" className="scroll-mt-24"></div>
            <Accordion
              type="single"
              collapsible
              className="mb-4"
              value={accordionValue === "guest-controls" ? "guest-controls" : undefined}
              defaultValue={isMobile ? undefined : "guest-controls"}
              onValueChange={(value) => {
                if (accordionValue === "guest-controls" && !value) {
                  // If clicking an already open accordion, we want to close it
                  setAccordionValue(undefined);
                } else if (value) {
                  // If opening a new accordion, update the value
                  setAccordionValue(value);
                }
              }}
            >
              <AccordionItem value="guest-controls" className="border rounded-lg shadow-sm">
                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                  <div className="flex items-center">
                    <Settings className="h-5 w-5 mr-2 text-primary" />
                    <div>
                      <h3 className="text-lg font-semibold text-left">Guest Controls</h3>
                      <p className="text-sm text-muted-foreground text-left">Manage guest permissions and settings</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  <div className="space-y-4">
                    {/* Song Requests Setting */}
                    <Card className="shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <h3 className="text-base font-medium flex items-center gap-2">
                              <Music2 className="h-4 w-4 text-primary" />
                              Song Requests
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Managed in Explorer settings; this control is read-only here
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={allowSongRequests} disabled
                              onCheckedChange={async (checked) => {
                                try {
                                  // Update local state immediately for responsive UI
                                  setAllowSongRequests(checked);

                                  await Promise.reject(new Error("Music guest settings are managed in Explorer."));

                                  // Send WebSocket message to update guests in real-time
                                  if (user?.guestUrl) {
                                    sendMessage({
                                      type: 'SONG_REQUESTS_TOGGLE',
                                      payload: checked
                                    });
                                  }

                                  queryClient.invalidateQueries({ queryKey: ["/api/user"] });
                                  if (user?.guestUrl) {
                                    queryClient.invalidateQueries({
                                      queryKey: [OWNER_PLAYBACK_URL],
                                    });
                                  }
                                  toast({
                                    title: checked ? "Song requests enabled" : "Song requests disabled",
                                    description: checked
                                      ? "Guests can now add songs to your playlist"
                                      : "Guests can no longer add songs to your playlist",
                                  });
                                } catch (error) {
                                  // Revert local state if API call fails
                                  setAllowSongRequests(!checked);

                                  console.error("Failed to update song request settings:", error);
                                  toast({
                                    title: "Failed to update settings",
                                    description: "Could not update song request settings",
                                    variant: "destructive",
                                  });
                                }
                              }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Play on Device Setting */}
                    <Card className="shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <h3 className="text-base font-medium flex items-center gap-2">
                              <Tablet className="h-4 w-4 text-primary" />
                              Play on Guest Device
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Managed in Explorer settings; this control is read-only here
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={allowGuestPlayOnDevice} disabled
                              onCheckedChange={async (checked) => {
                                try {
                                  // Update local state immediately for responsive UI
                                  setAllowGuestPlayOnDevice(checked);

                                  await Promise.reject(new Error("Music device settings are managed in Explorer."));

                                  // Send WebSocket message to update guests in real-time
                                  if (user?.guestUrl) {
                                    sendMessage({
                                      type: 'GUEST_PLAY_TOGGLE',
                                      payload: checked
                                    });
                                  }

                                  queryClient.invalidateQueries({ queryKey: ["/api/user"] });
                                  if (user?.guestUrl) {
                                    queryClient.invalidateQueries({
                                      queryKey: [OWNER_PLAYBACK_URL],
                                    });
                                  }
                                  toast({
                                    title: checked ? "Guest device play enabled" : "Guest device play disabled",
                                    description: checked
                                      ? "Guests can now play music on their device"
                                      : "Guests can no longer play music on their device",
                                  });
                                } catch (error) {
                                  // Revert local state if API call fails
                                  setAllowGuestPlayOnDevice(!checked);

                                  console.error("Failed to update guest play settings:", error);
                                  toast({
                                    title: "Failed to update settings",
                                    description: "Could not update guest play settings",
                                    variant: "destructive",
                                  });
                                }
                              }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Playlist Sharing Setting */}
                    <Card className="shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <h3 className="text-base font-medium flex items-center gap-2">
                              <ListMusic className="h-4 w-4 text-primary" />
                              Playlist Sharing
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Use saved-playlist visibility controls; this legacy switch is read-only
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={allowPlaylistSharing} disabled
                              onCheckedChange={async (checked) => {
                                try {
                                  // Update local state immediately for responsive UI
                                  setAllowPlaylistSharing(checked);

                                  await Promise.reject(new Error("Music sharing settings are managed through playlist visibility."));

                                  // Send WebSocket message to update guests in real-time
                                  if (user?.guestUrl) {
                                    sendMessage({
                                      type: 'PLAYLIST_SHARING_TOGGLE',
                                      payload: checked
                                    });
                                  }

                                  queryClient.invalidateQueries({ queryKey: ["/api/user"] });
                                  if (user?.guestUrl) {
                                    queryClient.invalidateQueries({
                                      queryKey: [OWNER_PLAYBACK_URL],
                                    });
                                  }
                                  toast({
                                    title: checked ? "Playlist sharing enabled" : "Playlist sharing disabled",
                                    description: checked
                                      ? "Guests can now view and play your saved playlists"
                                      : "Guests can no longer view or play your saved playlists",
                                  });
                                } catch (error) {
                                  // Revert local state if API call fails
                                  setAllowPlaylistSharing(!checked);

                                  console.error("Failed to update playlist sharing settings:", error);
                                  toast({
                                    title: "Failed to update settings",
                                    description: "Could not update playlist sharing settings",
                                    variant: "destructive",
                                  });
                                }
                              }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Recently Played Visibility Setting */}
                    <Card className="shadow-sm">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <h3 className="text-base font-medium flex items-center gap-2">
                              <History className="h-4 w-4 text-primary" />
                              Recently Played Visibility
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Managed in Explorer settings; this control is read-only here
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={allowRecentlyPlayedVisibility} disabled
                              onCheckedChange={async (checked) => {
                                try {
                                  // Update local state immediately for responsive UI
                                  setAllowRecentlyPlayedVisibility(checked);

                                  await Promise.reject(new Error("Music history visibility is managed in Explorer."));

                                  // Send WebSocket message to update guests in real-time
                                  if (user?.guestUrl) {
                                    sendMessage({
                                      type: 'RECENTLY_PLAYED_TOGGLE',
                                      payload: checked
                                    });
                                  }

                                  queryClient.invalidateQueries({ queryKey: ["/api/user"] });
                                  if (user?.guestUrl) {
                                    queryClient.invalidateQueries({
                                      queryKey: [OWNER_PLAYBACK_URL],
                                    });
                                  }
                                  toast({
                                    title: checked ? "Recently played visibility enabled" : "Recently played visibility disabled",
                                    description: checked
                                      ? "Guests can now view your recently played songs"
                                      : "Guests can no longer view your recently played songs",
                                  });
                                } catch (error) {
                                  // Revert local state if API call fails
                                  setAllowRecentlyPlayedVisibility(!checked);

                                  console.error("Failed to update recently played visibility settings:", error);
                                  toast({
                                    title: "Failed to update settings",
                                    description: "Could not update recently played visibility settings",
                                    variant: "destructive",
                                  });
                                }
                              }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Anchor div placed right before history accordion for proper scrolling */}
            <div id="history" className="scroll-mt-24"></div>
            <Accordion
              type="single"
              collapsible
              className="mb-4"
              value={accordionValue === "history" ? "history" : undefined}
              defaultValue={isMobile ? undefined : "history"}
              onValueChange={(value) => {
                if (accordionValue === "history" && !value) {
                  // If clicking an already open accordion, we want to close it
                  setAccordionValue(undefined);
                } else if (value) {
                  // If opening a new accordion, update the value
                  setAccordionValue(value);
                }
              }}
            >
              <AccordionItem value="history" className="border rounded-lg shadow-sm">
                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                  <div className="flex items-center">
                    <History className="h-5 w-5 mr-2 text-primary" />
                    <div>
                      <h3 className="text-lg font-semibold text-left">Recently Played</h3>
                      <p className="text-sm text-muted-foreground text-left">Songs that have been played</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  <PlaylistTable
                    songs={playlist.playedSongs ?? []}
                    showControls={true}
                    onPlaySong={handlePlaySong}
                    onDeleteSong={handleDeleteSong}
                    onDeleteMultiple={handleDeleteMultiple}
                    onAddMultiple={handleAddMultiple}
                    onClearHistory={handleClearHistory}
                    isHistory={true}
                    currentPlayingSong={currentPlayingSong || playlist.currentlyPlaying}
                    isAddingMultiple={addMultipleSongsMutation.isPending}
                    isDeletingMultiple={deleteMultipleSongsMutation.isPending}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>

      {/* Saved Playlists Section */}
      <div id="playlists" className="scroll-mt-24 container mx-auto">
        <Accordion
          type="single"
          collapsible
          className="mb-4"
          value={accordionValue === "playlists" ? "playlists" : undefined}
          defaultValue={isMobile ? undefined : "playlists"}
          onValueChange={(value) => {
            if (accordionValue === "playlists" && !value) {
              // If clicking an already open accordion, we want to close it
              setAccordionValue(undefined);
            } else if (value) {
              // If opening a new accordion, update the value
              setAccordionValue(value);
            }
          }}
        >
          <AccordionItem value="playlists" className="border rounded-lg shadow-sm">
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center w-full">
                <Music2 className="h-5 w-5 mr-2 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold text-left">Saved Playlists</h3>
                  <p className="text-sm text-muted-foreground text-left">Your custom playlists</p>
                </div>
              </div>
            </AccordionTrigger>

            {/* Place the dialog outside of AccordionTrigger to avoid button nesting */}
            <div className="px-6 py-2 flex justify-end border-t">
              <Dialog open={isCreatePlaylistOpen} onOpenChange={setIsCreatePlaylistOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Playlist
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreatePlaylist}>
                    <DialogHeader>
                      <DialogTitle>Create New Playlist</DialogTitle>
                      <DialogDescription>
                        Create a new playlist to organize your favorite songs
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                          id="name"
                          value={playlistName}
                          onChange={(e) => setPlaylistName(e.target.value)}
                          placeholder="My Awesome Playlist"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={playlistDescription}
                          onChange={(e) => setPlaylistDescription(e.target.value)}
                          placeholder="Optional description for your playlist"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createPlaylistMutation.isPending}>
                        {createPlaylistMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Create Playlist
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <AccordionContent className="px-6 pb-6">
              {playlists && playlists.length > 0 ? (
                <Tabs defaultValue={playlists[0].id.toString()}>
                  <TabsList className="mb-4 w-full overflow-x-auto flex-nowrap justify-start sm:justify-center p-0.5 gap-1">
                    {playlists.map((playlist) => (
                      <TabsTrigger
                        key={playlist.id}
                        value={playlist.id.toString()}
                        className="px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap flex-shrink-0"
                      >
                        <span>{playlist.name}</span>
                        <span className="ml-1 text-xs text-muted-foreground hidden xs:inline">({playlist.songs?.length || 0})</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {playlists.map((p) => (
                    <TabsContent key={p.id} value={p.id.toString()}>
                      <div className="space-y-4">
                        {/* Add Songs Section */}
                        <Card className="shadow-sm">
                          <CardHeader className="py-3 sm:py-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <CardTitle className="text-base sm:text-lg">Add Songs</CardTitle>
                                <CardDescription className="text-xs sm:text-sm">Search and add songs to this playlist</CardDescription>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <SearchSongs
                              playlistId={p.id}
                              onAdd={(songs) => handleAddSongsToPlaylist(p.id, songs)}
                            />
                          </CardContent>
                        </Card>

                        {/* Playlist Content */}
                        <div className="space-y-4">
                          {/* Title Row */}
                          <div className="flex items-center">
                            <h3 className="text-base sm:text-lg font-semibold">
                              {p.name} <span className="text-muted-foreground text-xs sm:text-sm">({p.songs.length} songs)</span>
                            </h3>
                          </div>

                          {/* Description if exists */}
                          {p.description && (
                            <p className="text-xs sm:text-sm text-muted-foreground">{p.description}</p>
                          )}

                          {/* Mobile Action Buttons - Grid layout */}
                          <div className="grid grid-cols-3 gap-2 sm:hidden">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => setPlaylistToReplace({ id: p.id, songs: p.songs, type: 'play' })}
                              disabled={p.songs.length === 0}
                              className="w-full h-10 px-2"
                            >
                              <PlayCircle className="h-4 w-4 mr-1" />
                              <span className="text-xs">Play</span>
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPlaylistToReplace({ id: p.id, songs: p.songs, type: 'shuffle' })}
                              disabled={p.songs.length === 0}
                              className="w-full h-10 px-2"
                            >
                              <Shuffle className="h-4 w-4 mr-1" />
                              <span className="text-xs">Shuffle</span>
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAddPlaylistToQueue(p.songs)}
                              disabled={p.songs.length === 0}
                              className="w-full h-10 px-2"
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              <span className="text-xs">Queue</span>
                            </Button>
                          </div>

                          {/* Mobile visibility and settings */}
                          <div className="flex justify-between items-center sm:hidden mt-2">
                            {user?.allowPlaylistSharing && (
                              <div className="flex items-center gap-1">
                                <Switch
                                  id={`visibility-mobile-${p.id}`}
                                  checked={p.isVisibleToGuests}
                                  onCheckedChange={(checked) => {
                                    updatePlaylistVisibilityMutation.mutate({
                                      playlistId: p.id,
                                      isVisible: checked,
                                    });
                                  }}
                                  className="scale-75"
                                />
                                <Label htmlFor={`visibility-mobile-${p.id}`} className="text-xs text-muted-foreground">
                                  Visible to guests
                                </Label>
                              </div>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditPlaylist(p)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit Playlist
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDeletePlaylist(p.id)}>
                                  <Trash className="h-4 w-4 mr-2" />
                                  Delete Playlist
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {/* Desktop Action Buttons Row */}
                          <div className="hidden sm:flex sm:flex-row sm:justify-between sm:items-center">
                            {/* Main action buttons for desktop */}
                            <div className="flex gap-2 items-center">
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => setPlaylistToReplace({ id: p.id, songs: p.songs, type: 'play' })}
                                disabled={p.songs.length === 0}
                              >
                                <PlayCircle className="h-4 w-4 mr-2" />
                                Play Playlist
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPlaylistToReplace({ id: p.id, songs: p.songs, type: 'shuffle' })}
                                disabled={p.songs.length === 0}
                              >
                                <Shuffle className="h-4 w-4 mr-2" />
                                Shuffle Playlist
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAddPlaylistToQueue(p.songs)}
                                disabled={p.songs.length === 0}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Add to Queue
                              </Button>
                            </div>

                            {/* Desktop Controls on the right */}
                            <div className="flex justify-end items-center gap-2">
                              {user?.allowPlaylistSharing && (
                                <div className="flex items-center gap-2">
                                  <Switch
                                    id={`visibility-${p.id}`}
                                    checked={p.isVisibleToGuests}
                                    onCheckedChange={(checked) => {
                                      updatePlaylistVisibilityMutation.mutate({
                                        playlistId: p.id,
                                        isVisible: checked,
                                      });
                                    }}
                                  />
                                  <Label htmlFor={`visibility-${p.id}`} className="text-sm text-muted-foreground whitespace-nowrap">
                                    Visible to guests
                                  </Label>
                                </div>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleEditPlaylist(p)}>
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Edit Playlist
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDeletePlaylist(p.id)}>
                                    <Trash className="h-4 w-4 mr-2" />
                                    Delete Playlist
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                        {p.songs.length > 0 ? (
                          <PlaylistTable
                            songs={p.songs}
                            showControls
                            onDeleteSong={(songId) => handleDeletePlaylistSong(p.id, songId)}
                            onPlaySong={handlePlaySavedPlaylistSong}
                            onAddToQueue={(song) => addToQueueMutation.mutate(song)}
                            showAddToQueue={true}
                            currentPlayingSong={currentPlayingSong}
                            onUpdatePosition={(songId, newPosition) =>
                              handlePlaylistSongPositionUpdate(songId, newPosition, p.id)
                            }
                            isPlaylist={true}
                          />
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            This playlist is empty. Add some songs above!
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <p>You haven't created any playlists yet. Create one to get started!</p>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
      <AlertDialog
        open={!!playlistToReplace}
        onOpenChange={(open) => {
          // Only allow closing if we're not in the middle of an operation
          if (!isReplacingQueue && !open) {
            setPlaylistToReplace(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace Current Queue?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all songs from your current queue and {playlistToReplace?.type === 'shuffle' ? 'shuffle' : 'play'} the selected playlist instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isReplacingQueue}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                // Prevent the default close behavior
                e.preventDefault();

                if (playlistToReplace) {
                  try {
                    if (playlistToReplace.type === 'shuffle') {
                      await shufflePlaylistMutation.mutateAsync({
                        songs: playlistToReplace.songs,
                        playlistId: playlistToReplace.id
                      });
                    } else {
                      await replaceQueueWithPlaylistMutation.mutateAsync({
                        songs: playlistToReplace.songs,
                        playlistId: playlistToReplace.id
                      });
                    }
                  } catch (error) {
                    console.error('Error replacing playlist:', error);
                    toast({
                      title: "Failed to replace playlist",
                      description: "There was an error replacing the playlist. Please try again.",
                      variant: "destructive",
                    });
                  }
                }
              }}
              disabled={isReplacingQueue}
            >
              {isReplacingQueue ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating Playlist...
                </>
              ) : (
                'Continue'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PersistentYoutubePlayer has been removed to prevent double playback */}

      {/* Edit Playlist Dialog */}
      <Dialog open={isEditPlaylistOpen} onOpenChange={setIsEditPlaylistOpen}>
        <DialogContent>
          <form onSubmit={handleUpdatePlaylist}>
            <DialogHeader>
              <DialogTitle>Edit Playlist</DialogTitle>
              <DialogDescription>
                Update your playlist details
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                  placeholder="My Awesome Playlist"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={playlistDescription}
                  onChange={(e) => setPlaylistDescription(e.target.value)}
                  placeholder="Optional description for your playlist"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updatePlaylistMutation.isPending}>
                {updatePlaylistMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Update Playlist
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
