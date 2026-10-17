import { useEffect, useState, useMemo } from "react";
import { useParams } from "wouter";
import { Song, User, Playlist } from "@shared/schema";
import SEO from "@/components/SEO";
import { createVenueGEOData } from "@/utils/geoHelpers";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MusicLoader } from "@/components/ui/music-loader";
import PlaylistTable from "@/components/playlist-table";
import SearchSongs from "@/components/search-songs";
import { Music2, Volume2, Share2, Copy, History, Search, PlayCircle, ChevronDown, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { acquireGuestMusicCapability, getGuestMusicCapability, guestMusicRequest } from "@/lib/musicCredential";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import YoutubePlayer from "@/components/youtube-player";
import { useWebSocket } from "@/hooks/use-websocket";
import { useTheme } from "@/components/theme-provider";
import { GuestBottomNavigation } from "@/components/guest-bottom-navigation";
import { useUserSubscriptionPlanInfo } from "@/lib/strapi-queries";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils"; import GuestCapabilityImport from "@/components/guest-capability-import";
import { PUBLIC_PLAYLIST_POLLING_INTERVAL_MS } from "@/lib/publicPlaylistPolling";


interface PlaylistResponse {
  songs: Song[];
  user: User & { 
    allowPlaylistSharing: boolean; 
    allowRecentlyPlayedVisibility?: boolean;
    theme?: any 
  };
  currentlyPlaying?: Song;
  playedSongs: Song[];
  allowGuestPlayOnDevice: boolean;
  allowRecentlyPlayedVisibility?: boolean;
  playlists?: (Playlist & { songs: Song[] })[];
}

export default function PlaylistPage() {
  const { guestUrl } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { updateTheme } = useTheme();
  const [themeUpdated, setThemeUpdated] = useState(false);
  const [accordionValue, setAccordionValue] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);

  // Query for playlist data
  const { data: playlist, isLoading, error } = useQuery<PlaylistResponse>({
    queryKey: [`/api/playlist/${guestUrl}`],
    refetchInterval: PUBLIC_PLAYLIST_POLLING_INTERVAL_MS,
    staleTime: 0,
    retry: true,
    retryDelay: 1000,
    onSuccess: (data) => {
      console.log('Guest page received playlist data:', {
        allowPlaylistSharing: data.user.allowPlaylistSharing,
        playlistsReceived: data.playlists?.length ?? 0,
        visiblePlaylists: data.playlists?.filter(p => p.isVisibleToGuests).length ?? 0
      });
    }
  });

  // Initial theme setup from playlist data
  useEffect(() => {
    if (playlist?.user?.theme?.primary && updateTheme && !themeUpdated) {
      console.log('Setting initial theme from playlist data:', playlist.user.theme.primary);
      updateTheme(playlist.user.theme.primary);
      setThemeUpdated(true);
    }
  }, [playlist?.user?.theme?.primary, updateTheme, themeUpdated]);
  

  // Guest pages deliberately do not read the owner-only entitlement endpoint.
  // Song-request authorization comes only from the slug-bound guest capability.
  // No browser username or plan assertion participates in guest authorization.
  void useUserSubscriptionPlanInfo; void Alert;
  void AlertDescription; void AlertCircle;

  // Handle WebSocket messages
  const handleMessage = (message: any) => {
    console.log('Received WebSocket message:', message);

    if (message.type === 'THEME_UPDATE' && message.payload?.theme?.primary) {
      console.log('Updating theme from WebSocket:', message.payload.theme.primary);

      // Force immediate theme update
      if (updateTheme) {
        updateTheme(message.payload.theme.primary);
      }

      // Update playlist cache with new theme
      queryClient.setQueryData([`/api/playlist/${guestUrl}`], (oldData: any) => {
        if (!oldData) return oldData;

        // Create new object to trigger state update
        const newData = {
          ...oldData,
          user: {
            ...oldData.user,
            theme: {
              ...oldData.user.theme,
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
      queryClient.setQueryData([`/api/playlist/${guestUrl}`], (oldData: any) => {
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
      queryClient.setQueryData([`/api/playlist/${guestUrl}`], (oldData: any) => {
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
      queryClient.setQueryData([`/api/playlist/${guestUrl}`], (oldData: any) => {
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
      queryClient.setQueryData([`/api/playlist/${guestUrl}`], (oldData: any) => {
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
  const { sendMessage } = useWebSocket(guestUrl || '', handleMessage, {
    enabled: true,
    showConnectionToasts: false
  });

  // Add new mutation for adding songs to queue
  const addSongToQueueMutation = useMutation({
    mutationFn: async (song: Song) => {
      return guestMusicRequest(acquireGuestMusicCapability(guestUrl ?? "") ?? "", {
        youtubeId: song.youtubeId,
        title: song.title,
        artist: song.artist,
        thumbnailUrl: song.thumbnailUrl,
      }, guestUrl ?? "");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/playlist/${guestUrl}`] });
      toast({
        title: "Song added",
        description: "The song has been added to the playlist",
      });
    },
    onError: (error) => {
      console.error('Error adding song to queue:', error);
      toast({
        title: "Failed to add song",
        description: "Could not add song to playlist",
        variant: "destructive",
      });
    },
  });

  // Delete single song mutation
  const deleteSongMutation = useMutation({
    mutationFn: async (songId: number) => {
      void songId;
      throw new Error("Guests cannot remove owner queue or history entries.");
    },
    onSuccess: () => {
      if (guestUrl) {
        queryClient.invalidateQueries({ queryKey: [`/api/playlist/${guestUrl}`] });
      }
      toast({
        title: "Song removed",
        description: "The song has been removed from history",
      });
    },
    onError: (error) => {
      console.error('Failed to delete song:', error);
      toast({
        title: "Failed to remove song",
        description: "Could not remove song from history",
        variant: "destructive",
      });
    },
  });

  // Delete multiple songs mutation
  const deleteMultipleSongsMutation = useMutation({
    mutationFn: async (songIds: number[]) => {
      void songIds;
      throw new Error("Guests cannot remove owner queue or history entries.");
    },
    onSuccess: () => {
      if (guestUrl) {
        queryClient.invalidateQueries({ queryKey: [`/api/playlist/${guestUrl}`] });
      }
      toast({
        title: "Songs removed",
        description: "Selected songs have been removed from history",
      });
    },
    onError: (error) => {
      console.error('Failed to delete multiple songs:', error);
      toast({
        title: "Failed to remove songs",
        description: "Could not remove selected songs from history",
        variant: "destructive",
      });
    },
  });

  // Add multiple songs mutation
  const addMultipleSongsMutation = useMutation({
    mutationFn: async (songs: Song[]) => {
      console.log('Adding multiple songs:', songs);
      const capability = acquireGuestMusicCapability(guestUrl ?? "") ?? "";
      const addPromises = songs.map(song =>
        guestMusicRequest(capability, {
          youtubeId: song.youtubeId,
          title: song.title,
          artist: song.artist,
          thumbnailUrl: song.thumbnailUrl,
        }, guestUrl ?? "")
      );

      try {
        const results = await Promise.all(addPromises);
        return results;
      } catch (error) {
        console.error('Error in add multiple songs:', error);
        throw error; // Re-throw to trigger onError
      }
    },
    onSuccess: () => {
      if (guestUrl) {
        queryClient.invalidateQueries({ queryKey: [`/api/playlist/${guestUrl}`] });
      }
      toast({
        title: "Songs added",
        description: "Selected songs have been added to the playlist",
      });
    },
    onError: (error) => {
      console.error('Failed to add multiple songs:', error);
      toast({
        title: "Failed to add songs",
        description: "Could not add selected songs to playlist",
        variant: "destructive",
      });
    },
  });

  // Clear history mutation
  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      throw new Error("Guests cannot clear owner playback history.");
    },
    onSuccess: () => {
      if (guestUrl) {
        queryClient.invalidateQueries({ queryKey: [`/api/playlist/${guestUrl}`] });
      }
      toast({
        title: "History cleared",
        description: "All songs have been removed from history",
      });
    },
    onError: (error) => {
      console.error('Failed to clear history:', error);
      toast({
        title: "Failed to clear history",
        description: "Could not clear song history",
        variant: "destructive",
      });
    },
  });


  const handleDeleteSong = async (songId: number) => {
    try {
      console.log('Handling delete for song:', songId);
      await deleteSongMutation.mutateAsync(songId);
    } catch (error) {
      console.error('Error in handleDeleteSong:', error);
    }
  };

  const handleDeleteMultiple = async (songIds: number[]) => {
    if (!songIds.length) return;
    try {
      console.log('Handling delete multiple songs:', songIds);
      await deleteMultipleSongsMutation.mutateAsync(songIds);
    } catch (error) {
      console.error('Error in handleDeleteMultiple:', error);
    }
  };

  const handleAddMultiple = async (songs: Song[]) => {
    if (!songs.length) return;
    try {
      console.log('Handling add multiple songs:', songs);
      await addMultipleSongsMutation.mutateAsync(songs);
    } catch (error) {
      console.error('Error in handleAddMultiple:', error);
    }
  };

  const handleClearHistory = async () => {
    try {
      await clearHistoryMutation.mutateAsync();
    } catch (error) {
      console.error('Error in handleClearHistory:', error);
    }
  };

  // Add handler for adding song to queue
  const handleAddToQueue = async (song: Song) => {
    try {
      await addSongToQueueMutation.mutateAsync(song);
    } catch (error) {
      console.error('Error in handleAddToQueue:', error);
    }
  };
  
  // Handle song finished event
  const handleSongFinished = () => {
    console.log('Song finished, refreshing playlist data');
    queryClient.invalidateQueries({ queryKey: [`/api/playlist/${guestUrl}`] });
  };

  const handleShare = async () => {









    console.log('Share button clicked, guestUrl:', guestUrl);
    if (!guestUrl) {
      console.error('No guestUrl available');
      toast({
        title: "Share Failed",
        description: "Could not share the playlist - missing URL",
        variant: "destructive",
      });
      return;
    }

    const shareUrl = `${window.location.origin}/playlist/${guestUrl}`;
    console.log('Attempting to share URL:', shareUrl);

    if (navigator.share) {
      try {
        await navigator.share({
          title: `${playlist?.user?.venueName || 'Shared'}'s Playlist`,
          text: "Join our playlist and request songs!",
          url: shareUrl,
        });
        console.log('Share successful');
      } catch (error) {
        console.error('Share failed:', error);
        if ((error as Error).name !== 'AbortError') {
          toast({
            title: "Share Failed",
            description: "Could not share the playlist",
            variant: "destructive",
          });
        }
      }
    } else {
      console.log('Share API not available, falling back to copy');
      handleCopyLink();
    }
  };

  const handleCopyLink = async () => {
    console.log('Copy button clicked, guestUrl:', guestUrl);
    if (!guestUrl) {
      console.error('No guestUrl available');
      toast({
        title: "Copy Failed",
        description: "Could not copy the playlist link - missing URL",
        variant: "destructive",
      });
      return;
    }

    const shareUrl = `${window.location.origin}/playlist/${guestUrl}`;
    console.log('Attempting to copy URL:', shareUrl);

    try {
      await navigator.clipboard.writeText(shareUrl);
      console.log('Copy successful');
      toast({
        title: "Link Copied",
        description: "Playlist link has been copied to clipboard",
      });
    } catch (error) {
      console.error('Copy failed:', error);
      toast({
        title: "Copy Failed",
        description: "Could not copy the playlist link",
        variant: "destructive",
      });
    }
  };

  const venueGeoData = useMemo(() => {
    if (!playlist?.user) return undefined;
    return createVenueGEOData({
      venueName: playlist.user.venueName,
      guestUrl: guestUrl || '',
      displayName: playlist.user.username,
    });
  }, [playlist?.user?.venueName, playlist?.user?.username, guestUrl]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <MusicLoader size="lg" />
      </div>
    );
  }

  if (error || !playlist) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <h1 className="text-2xl font-bold text-destructive mb-2">
              Playlist Not Found
            </h1>
            <p className="text-muted-foreground">
              The playlist you're looking for doesn't exist or has been removed.
            </p>{guestUrl && <div className="mt-6"><GuestCapabilityImport guestUrl={guestUrl} onImported={() => { void queryClient.invalidateQueries({ queryKey: [`/api/playlist/${guestUrl}`] }); }} /></div>}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SEO
        title={`${playlist.user.venueName} - Live Playlist | Local Tunes`}
        description={`Listen to music and request songs at ${playlist.user.venueName}. Interactive playlist powered by Local Tunes.`}
        keywords={[playlist.user.venueName, 'live playlist', 'song request', 'venue music', 'collaborative playlist']}
        canonical={`/playlist/${guestUrl}`}
        url={`/playlist/${guestUrl}`}
        enableGEO={true}
        geoData={venueGeoData}
      />
      {/* Brand Header */}
      <div className="bg-background/80 backdrop-blur-sm border-b border-border/40 py-4 px-4 sm:px-6 fixed top-0 left-0 right-0 z-50">
        <div className="container mx-auto flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary">{playlist.user.venueName}</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              <Copy className="h-4 w-4 mr-2" />
              Copy Link
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto py-8 space-y-8 pt-20 pb-28 px-4">
        {/* Now Playing Section - Enhanced UI */}
        <Card className="border rounded-lg shadow-lg overflow-hidden">
          <CardHeader className="px-6 py-4 bg-gradient-to-r from-primary/10 to-secondary/20">
            <div className="flex items-center">
              <div className="bg-primary/20 p-2 rounded-full mr-3">
                <Music2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-left">Now Playing</h3>
                <p className="text-sm text-muted-foreground text-left">
                  {playlist.currentlyPlaying?.title || "No song selected"}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0 pt-0 pb-0">
            <div className="relative w-full">
              {playlist.currentlyPlaying && (
                <div className="w-full flex flex-col items-center bg-gradient-to-b from-background to-secondary/10 pb-6">
                  <div className="w-full max-w-xs p-6">
                    <div className="aspect-square relative rounded-lg overflow-hidden shadow-lg border-4 border-primary/10 mx-auto">
                      <img
                        src={playlist.currentlyPlaying.thumbnailUrl}
                        alt={playlist.currentlyPlaying.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300">
                        <div className="p-3 bg-primary rounded-full">
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" fill="white"></polygon></svg>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="w-full text-center px-6">
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-bold text-xl md:text-2xl leading-tight">{playlist.currentlyPlaying.title}</h3>
                        <p className="text-primary font-medium mt-2">{playlist.currentlyPlaying.artist}</p>
                      </div>
                      
                      <div className="flex items-center justify-center space-x-2">
                        <span className="inline-flex items-center bg-primary/20 text-primary text-xs px-2.5 py-1 rounded-full">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><path d="m9 12 2 2 4-4"></path></svg>
                          Now Playing
                        </span>
                        {!playlist.allowGuestPlayOnDevice && (
                          <span className="inline-flex items-center bg-secondary text-muted-foreground text-xs px-2.5 py-1 rounded-full">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            Host-Only Playback
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {!playlist.currentlyPlaying && (
                <div className="w-full flex flex-col items-center justify-center bg-gradient-to-b from-background to-secondary/10 rounded-lg">
                  <div className="text-center p-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary/50 flex items-center justify-center">
                      <Music2 className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold text-xl">No song playing</h3>
                    <p className="mt-3 text-muted-foreground text-sm max-w-md mx-auto">
                      The host hasn't started any music yet. When a song starts playing, it will appear here.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Search Songs Section - Only show if song requests are allowed */}
        {playlist?.user.allowSongRequests && (
          <>
            {guestUrl && (

              <GuestCapabilityImport
                guestUrl={guestUrl}
                onImported={() => {
                  void queryClient.invalidateQueries({ queryKey: [`/api/playlist/${guestUrl}`] });
                }}
              />
            )}
            
            <Accordion 
              type="single" 
              collapsible
              value={accordionValue} 
              onValueChange={setAccordionValue}
            >
              <AccordionItem 
                value="search" 
                id="search"
                className="border rounded-lg shadow-sm"
              >
                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                  <div className="flex items-center">
                    <Search className="h-5 w-5 mr-2 text-primary" />
                    <div className="text-left">
                      <h3 className="text-lg font-semibold">Add Songs</h3>
                      <p className="text-sm text-muted-foreground">Search and add songs to the playlist</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6">
                  <Card className="mt-4 border-0 shadow-none">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-2xl">Request a Song</CardTitle>
                      <CardDescription className="text-base">Search and add songs to the playlist</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <SearchSongs guestUrl={guestUrl} ownerUsername={playlist?.user?.username} />
                    </CardContent>
                  </Card>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}

        {/* Queue Section */}
        <Accordion 
          type="single" 
          collapsible
          value={accordionValue} 
          onValueChange={setAccordionValue}
        >
          <AccordionItem value="queue" id="queue">
            <AccordionTrigger>
              <div className="flex items-center gap-2">
                <Music2 className="h-4 w-4" />
                Queue
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Queue</CardTitle>
                  <CardDescription>Songs in the queue</CardDescription>
                </CardHeader>
                <CardContent>
                  <PlaylistTable
                    songs={playlist?.songs || []}
                    showControls={false}
                    currentPlayingSong={playlist?.currentlyPlaying}
                    guestUrl={guestUrl}
                  />
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* History Section */}
        {/* Only show Recently Played section if allowRecentlyPlayedVisibility is true */}
        {(playlist?.user?.allowRecentlyPlayedVisibility !== false) && (
          <Accordion 
            type="single" 
            collapsible
            value={accordionValue} 
            onValueChange={setAccordionValue}
          >
            <AccordionItem value="history" id="history">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Recently Played
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle>Recently Played</CardTitle>
                    <CardDescription>Songs that have been played</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(playlist?.playedSongs?.length ?? 0) > 0 ? (
                      <PlaylistTable
                        songs={playlist?.playedSongs ?? []}
                        showControls={false}
                        isHistory={true}
                        currentPlayingSong={playlist?.currentlyPlaying}
                        guestUrl={guestUrl}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">No songs have been played yet</p>
                    )}
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* Add Saved Playlists Section */}
        {playlist?.user.allowPlaylistSharing && playlist.playlists && playlist.playlists.length > 0 && (
          <Accordion 
            type="single" 
            collapsible
            value={accordionValue} 
            onValueChange={setAccordionValue}
          >
            <AccordionItem value="playlists" id="playlists">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Music2 className="h-4 w-4" />
                  Playlists
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle>Saved Playlists</CardTitle>
                    <CardDescription>Browse {playlist.user.venueName}'s playlists</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {playlist.playlists.some(p => p.isVisibleToGuests) ? (
                      <Tabs defaultValue={playlist.playlists.find(p => p.isVisibleToGuests)?.id.toString()}>
                        <TabsList className="mb-4">
                          {playlist.playlists
                            .filter(p => p.isVisibleToGuests)
                            .map((p) => (
                              <TabsTrigger key={p.id} value={p.id.toString()}>
                                {p.name}
                              </TabsTrigger>
                            ))}
                        </TabsList>

                        {playlist.playlists
                          .filter(p => p.isVisibleToGuests)
                          .map((p) => (
                            <TabsContent key={p.id} value={p.id.toString()}>
                              <div className="space-y-4">
                                {p.description && (
                                  <p className="text-sm text-muted-foreground">{p.description}</p>
                                )}
                                <div className="flex justify-between items-center">
                                  <div className="text-sm text-muted-foreground">
                                    {p.songs.length} songs
                                  </div>
                                </div>
                                {p.songs.length > 0 ? (
                                  <PlaylistTable
                                    songs={p.songs}
                                    showControls={true}
                                    currentPlayingSong={playlist.currentlyPlaying}
                                    onAddToQueue={handleAddToQueue}
                                    showAddToQueue={true}
                                    guestUrl={guestUrl}
                                    showReorderControls={false} // Hide reorder controls in the guest view
                                    isPlaylist={true}
                                  />
                                ) : (
                                  <p className="text-center py-8 text-muted-foreground">
                                    This playlist is empty
                                  </p>
                                )}
                              </div>
                            </TabsContent>
                          ))}
                      </Tabs>
                    ) : (
                      <p className="text-center py-8 text-muted-foreground">
                        No playlists are currently shared
                      </p>
                    )}
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* Play on Device Section - Only visible to guests if allowed */}
        {playlist.allowGuestPlayOnDevice && (
          <Accordion 
            type="single" 
            collapsible
            value={accordionValue} 
            onValueChange={setAccordionValue}
          >
            <AccordionItem value="play-device" id="play-device">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  Play on Your Device
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle>Play on Your Device</CardTitle>
                    <CardDescription>Control playback on your device</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-3">
                      <p className="text-sm">
                        The host has allowed playback on guest devices. You can control the music from here.
                      </p>
                      
                      <div className="relative w-full aspect-video mb-4">
                        <YoutubePlayer
                          currentSong={playlist.currentlyPlaying}
                          nextSong={playlist.songs?.[0]}
                          showAutoplayControl={false}
                          onSongFinished={handleSongFinished}
                          onPlayStateChange={(isPlayingState) => setIsPlaying(isPlayingState)}
                          fetchCurrentSong={async () => {
                            if (!guestUrl) return undefined;
                            try {
                              const response = await fetch(`/api/playlist/${guestUrl}`, { headers: ((guestCapability) => guestCapability ? { "X-Music-Guest-Capability": guestCapability } : undefined)(getGuestMusicCapability(guestUrl)) });
                              const data = await response.json();
                              return data.currentlyPlaying;
                            } catch (error) {
                              console.error("Error fetching current song:", error);
                              return undefined;
                            }
                          }}
                          guestUrl={guestUrl}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
      
      {/* Guest Bottom Navigation */}
      <GuestBottomNavigation 
        currentlyPlaying={playlist.currentlyPlaying}
        onAccordionValueChange={setAccordionValue}
        allowSongRequests={playlist.user.allowSongRequests}
        allowPlaylistSharing={playlist.user.allowPlaylistSharing}
        allowGuestPlayOnDevice={playlist.allowGuestPlayOnDevice}
        allowRecentlyPlayedVisibility={playlist.user.allowRecentlyPlayedVisibility}
      />
    </div>
  );
}
