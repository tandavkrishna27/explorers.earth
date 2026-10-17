import { useEffect, useState, useRef } from "react";
import { Song } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Music2, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Shuffle, Repeat, Repeat1 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { MusicLoader } from "@/components/ui/music-loader";
import { ConnectionStatus } from "@/components/connection-status";
import ReactPlayer from "react-player";
import { useWebSocket } from '@/hooks/use-websocket';
import { apiRequest } from "@/lib/queryClient";

type Props = {
  currentSong?: Song;
  nextSong?: Song;
  previousSong?: Song;
  defaultAutoplay?: boolean;
  showAutoplayControl?: boolean;
  onSongFinished?: () => void;
  onPreviousSong?: () => void;
  onShuffleSongs?: () => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  fetchCurrentSong: () => Promise<Song | undefined>;
  guestUrl?: string;
  username?: string;
};

type RepeatMode = 'none' | 'all' | 'one';

export default function YoutubePlayer({
  currentSong,
  nextSong,
  previousSong,
  defaultAutoplay = true,
  showAutoplayControl = false,
  onSongFinished,
  onPreviousSong,
  onShuffleSongs,
  onPlayStateChange,
  fetchCurrentSong,
  guestUrl,
  username,
}: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [autoplay, setAutoplay] = useState(defaultAutoplay);
  const [isPlaying, setIsPlaying] = useState(defaultAutoplay);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [played, setPlayed] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('none');
  const playerRef = useRef<ReactPlayer>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const playerErrorRetries = useRef(0);
  const MAX_RETRIES = 3;
  const lastPlayerStateUpdate = useRef<number>(0);
  const playerStateUpdateThrottle = 200;

  // Format time helper function
  const formatTime = (timeInSeconds: number): string => {
    if (!timeInSeconds) return '00:00';

    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = Math.floor(timeInSeconds % 60);

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Socket.IO setup for guest view
  const { sendMessage, isConnected, connectionError } = useWebSocket(
    (!showAutoplayControl && guestUrl && playerReady) ? guestUrl : undefined,
    (message) => {
      console.log('Received WebSocket message in player:', message);
      try {
        if (message.type === 'player_state' && !showAutoplayControl) {
          const now = Date.now();
          if (now - lastPlayerStateUpdate.current > playerStateUpdateThrottle) {
            setIsPlaying(!!message.playing);
            lastPlayerStateUpdate.current = now;

            if (playerRef.current && playerReady) {
              const player = playerRef.current.getInternalPlayer();
              if (player && typeof player.playVideo === 'function' && typeof player.pauseVideo === 'function') {
                try {
                  if (message.playing) {
                    player.playVideo();
                  } else {
                    player.pauseVideo();
                  }
                } catch (err) {
                  console.error('Error controlling YouTube player:', err);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Error handling WebSocket message:', err);
      }
    }
  );

  // Load preferences from localStorage
  useEffect(() => {
    const savedAutoplay = localStorage.getItem('youtube_autoplay');
    const savedVolume = localStorage.getItem('youtube_volume');
    const savedShuffle = localStorage.getItem('youtube_shuffle');
    const savedRepeatMode = localStorage.getItem('youtube_repeat_mode') as RepeatMode;

    if (savedAutoplay !== null) {
      setAutoplay(savedAutoplay === 'true');
      setIsPlaying(savedAutoplay === 'true');
    }
    if (savedVolume !== null) {
      setVolume(parseInt(savedVolume));
    }
    if (savedShuffle !== null) {
      setShuffle(savedShuffle === 'true');
    }
    if (savedRepeatMode) {
      setRepeatMode(savedRepeatMode);
    }
  }, []);

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('youtube_autoplay', autoplay.toString());
  }, [autoplay]);

  // Also save isPlaying state for syncing with persistent player
  useEffect(() => {
    localStorage.setItem('youtube_autoplay', isPlaying.toString());
  }, [isPlaying]);

  useEffect(() => {
    // Save volume to localStorage
    localStorage.setItem('youtube_volume', volume.toString());

    // Broadcast volume change event to persistent player
    const event = new CustomEvent('volume-change', {
      detail: { volume }
    });
    window.dispatchEvent(event);
  }, [volume]);

  useEffect(() => {
    localStorage.setItem('youtube_shuffle', shuffle.toString());
  }, [shuffle]);

  useEffect(() => {
    localStorage.setItem('youtube_repeat_mode', repeatMode);
  }, [repeatMode]);

  // Handle progress updates from ReactPlayer
  const handleProgress = (state: { played: number; playedSeconds: number; loaded: number; loadedSeconds: number }) => {
    if (!seeking) {
      setPlayed(state.played);
      setCurrentTime(state.playedSeconds);
    }
  };

  // Player ready handler to properly sync initial state
  const handlePlayerReady = () => {
    console.log('YouTube player ready');
    setIsLoading(false);
    setError(null);
    setPlayerReady(true);

    // Get saved play state and apply on ready
    const savedPlayState = localStorage.getItem('youtube_autoplay');
    const shouldPlay = savedPlayState === null ? defaultAutoplay : savedPlayState === 'true';

    if (playerRef.current) {
      const player = playerRef.current.getInternalPlayer();
      // Apply volume first
      if (player && typeof player.setVolume === 'function') {
        player.setVolume(volume);
      }

      // Ensure player state matches UI state
      if (shouldPlay !== isPlaying) {
        setIsPlaying(shouldPlay);

        // Apply to player directly
        if (player) {
          if (shouldPlay && typeof player.playVideo === 'function') {
            player.playVideo();
          } else if (!shouldPlay && typeof player.pauseVideo === 'function') {
            player.pauseVideo();
          }
        }

        // Broadcast state to keep things in sync
        broadcastPlayerState(shouldPlay);

        // Notify parent
        if (onPlayStateChange) {
          onPlayStateChange(shouldPlay);
        }
      }
    }
  };

  // Handle YouTube specific errors
  const handleYouTubeError = (error: any) => {
    console.log('YouTube player error:', error);
    // YouTube specific error codes
    const errorMessages: Record<number, string> = {
      2: 'Invalid video ID',
      5: 'HTML5 player error',
      100: 'Video not found',
      101: 'Video playback not allowed',
      150: 'Video playback not allowed'
    };

    // Get error code from YouTube API
    let errorCode = 0;
    if (typeof error === 'object' && error !== null && 'data' in error) {
      errorCode = (error as any).data;
    }

    const errorMessage = errorMessages[errorCode] || 'Unknown YouTube error';
    handleError(new Error(errorMessage));
  };

  // Handle song completion based on repeat mode
  const handleSongComplete = async () => {
    if (!onSongFinished) return;

    switch (repeatMode) {
      case 'one':
        // Replay the current song
        if (playerRef.current) {
          playerRef.current.seekTo(0);
          setPlayed(0);
          setCurrentTime(0);
          setIsPlaying(true);
        }
        break;
      case 'all':
        // Move to next song, will loop back to start when reaching the end
        await handleSongEnd();
        break;
      case 'none':
        // Only move to next if autoplay is enabled
        if (autoplay) {
          await handleSongEnd();
        } else {
          setIsPlaying(false);
        }
        break;
    }
  };

  // Timeline seeking handlers
  const handleSeekMouseDown = () => {
    setSeeking(true);
  };

  const handleSeekChange = (value: number[]) => {
    const newPlayed = value[0] / 100;
    setPlayed(newPlayed);
    setCurrentTime(duration * newPlayed);
  };

  const handleSeekMouseUp = async (value: number[]) => {
    setSeeking(false);
    if (playerRef.current) {
      const seekTime = value[0] / 100;
      playerRef.current.seekTo(seekTime);
      setCurrentTime(duration * seekTime);

      // If seeking to the end, handle based on repeat mode
      if (seekTime >= 0.999) {
        await handleSongComplete();
      }
    }
  };

  // Song end handler
  const handleSongEnd = async () => {
    if (!onSongFinished) return;

    try {
      await apiRequest("POST", "/api/playlist/currently-playing", { songId: null });

      onSongFinished();
    } catch (error) {
      console.error('Error handling song end:', error);
      toast({
        title: "Error",
        description: "Failed to update playback status",
        variant: "destructive",
      });
    }
  };

  // Error handling with retries
  const handleError = async (error: any) => {
    console.error('Player error:', error);

    // Log detailed error information
    if (error?.target) {
      console.log('Video element error details:', {
        code: error.target.error?.code,
        message: error.target.error?.message,
        networkState: error.target.networkState,
        readyState: error.target.readyState
      });
    }

    // First try to recover by reloading the video
    if (playerRef.current && playerErrorRetries.current < MAX_RETRIES) {
      playerErrorRetries.current++;
      console.log(`Retrying playback (attempt ${playerErrorRetries.current} of ${MAX_RETRIES})`);

      try {
        setIsLoading(true);
        setError("Attempting to recover playback...");
        setPlayerReady(false);

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));

        const player = playerRef.current.getInternalPlayer();
        if (player && typeof player.loadVideoById === 'function' && currentSong?.youtubeId) {
          player.loadVideoById(currentSong.youtubeId);
          setError(null);
          return;
        }
      } catch (retryError) {
        console.error('Retry attempt failed:', retryError);
      }
    }

    // If retries exhausted or retry failed, show error and prepare to skip
    setError("Failed to play video");
    setIsLoading(false);
    setPlayerReady(false);

    // Only skip to next if autoplay is enabled and we have a callback
    if (autoplay && onSongFinished) {
      toast({
        title: "Playback Error",
        description: "Could not play this video. Skipping to next song.",
        variant: "destructive",
      });

      try {
        // Ensure we clear the currently playing song before moving to next
        await apiRequest("POST", "/api/playlist/currently-playing", { songId: null });

        // Small delay before triggering next song to prevent rapid skips
        await new Promise(resolve => setTimeout(resolve, 1000));
        onSongFinished();
      } catch (skipError) {
        console.error('Error while trying to skip song:', skipError);
        toast({
          title: "Error",
          description: "Failed to skip to next song. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  // Player control handlers
  const handlePlayPause = () => {
    if (!playerReady) return;
    const newPlayingState = !isPlaying;
    setIsPlaying(newPlayingState);
    broadcastPlayerState(newPlayingState);

    // Notify parent about play state change
    if (onPlayStateChange) {
      onPlayStateChange(newPlayingState);
    }
  };

  const handlePrevious = () => {
    if (onPreviousSong) {
      onPreviousSong();
      broadcastPlayerState(autoplay);
    }
  };

  const handleNext = () => {
    if (onSongFinished) {
      onSongFinished();
      broadcastPlayerState(autoplay);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (isMuted) {
      setVolume(100); // Restore previous volume
    } else {
      setVolume(0);
    }
  };

  const toggleShuffle = () => {
    const newShuffleState = !shuffle;
    setShuffle(newShuffleState);
    if (onShuffleSongs && newShuffleState) {
      onShuffleSongs();
    }
  };

  const toggleRepeat = () => {
    const modes: RepeatMode[] = ['none', 'all', 'one'];
    const currentIndex = modes.indexOf(repeatMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setRepeatMode(modes[nextIndex]);
  };

  // Broadcast player state to guests and persistent player
  const broadcastPlayerState = (playing: boolean) => {
    const now = Date.now();
    if (now - lastPlayerStateUpdate.current > playerStateUpdateThrottle) {
      console.log('Broadcasting player state:', playing);

      // Update localStorage and dispatch an event for the persistent player
      localStorage.setItem('youtube_autoplay', playing.toString());

      // Create and dispatch a custom event that the persistent player can listen for
      const event = new CustomEvent('player-state-change', {
        detail: { playing }
      });
      window.dispatchEvent(event);

      // Only send websocket message if this is the host player
      if (showAutoplayControl) {
        try {
          sendMessage({
            type: 'player_state',
            playing
          });
        } catch (err) {
          console.error('Error broadcasting player state to guests:', err);
        }
      }

      lastPlayerStateUpdate.current = now;
    }
  };

  // Poll for current song updates
  useEffect(() => {
    const intervalId = setInterval(async () => {
      try {
        const newCurrentSong = await fetchCurrentSong();
        if (newCurrentSong && (!currentSong || newCurrentSong.youtubeId !== currentSong.youtubeId)) {
          console.log('New song detected:', newCurrentSong.title);
          setIsLoading(true);
          setError(null);
          setIsPlaying(autoplay);
          setPlayerReady(false);
          playerErrorRetries.current = 0;
          setPlayed(0);
          setCurrentTime(0);
          broadcastPlayerState(autoplay);
        }
      } catch (error) {
        console.error("Error fetching current song:", error);
      }
    }, 2000);

    return () => clearInterval(intervalId);
  }, [fetchCurrentSong, currentSong, autoplay]);

  if (!currentSong) {
    return (
      <Card>
        <CardContent className="h-[360px] flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <Music2 className="h-12 w-12 mx-auto mb-4 text-muted" />
            <p>No songs in playlist</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="h-[360px] flex flex-col items-center justify-center gap-4 text-destructive">
          <AlertCircle className="h-12 w-12" />
          <p>{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="w-full rounded-lg overflow-hidden bg-muted relative" style={{ aspectRatio: '16/9' }}>
        {!showAutoplayControl && (
          <div className="absolute top-2 right-2 z-10">
            <ConnectionStatus
              isConnected={isConnected}
              error={connectionError}
              className="bg-background/80 backdrop-blur-sm p-2 rounded-lg"
            />
          </div>
        )}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <MusicLoader />
          </div>
        )}
        <ReactPlayer
          ref={playerRef}
          url={`https://www.youtube.com/watch?v=${currentSong.youtubeId}`}
          width="100%"
          height="100%"
          playing={isPlaying}
          volume={volume / 100}
          muted={isMuted}
          controls={false}
          loop={repeatMode === 'one'}
          onError={handleError}
          onEnded={handleSongComplete}
          onProgress={handleProgress}
          onDuration={setDuration}
          onReady={handlePlayerReady}
          config={{
            youtube: {
              playerVars: {
                modestbranding: 1,
                rel: 0,
                controls: 0,
                disablekb: 1,
                showinfo: 0,
                iv_load_policy: 3,
                playsinline: 1,
                origin: typeof window !== 'undefined' ? window.location.origin : undefined,
                enablejsapi: 1,
                widget_referrer: typeof window !== 'undefined' ? window.location.origin : undefined
              }
            }
          }}
        />
      </div>

      {showAutoplayControl && (
        <div className="space-y-4">
          {/* Controls Row */}
          <div className="grid grid-cols-1 gap-4 p-4 bg-primary/5 rounded-lg border border-primary/10">
            {/* Timeline Row - Moved inside the controls panel */}
            <div className="space-y-2">
              <Slider
                value={[played * 100]}
                min={0}
                max={100}
                step={0.1}
                onValueChange={handleSeekChange}
                onValueCommit={handleSeekMouseUp}
                onPointerDown={handleSeekMouseDown}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Main Controls with Shuffle and Repeat on either side */}
            <div className="flex items-center justify-center gap-2 pt-2 border-t border-border/20">
              {/* Shuffle button always visible, now on the left */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleShuffle}
                className={`h-8 w-8 ${shuffle ? 'text-primary' : ''}`}
                title="Shuffle"
              >
                <Shuffle className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={handlePrevious}
                disabled={!previousSong || (!showAutoplayControl && !isConnected)}
                className="h-8 w-8"
              >
                <SkipBack className="h-4 w-4" />
              </Button>

              <Button
                variant="default"
                size="icon"
                onClick={handlePlayPause}
                className="h-10 w-10"
                disabled={!showAutoplayControl && !isConnected}
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={handleNext}
                className="h-8 w-8"
                disabled={!nextSong || (!showAutoplayControl && !isConnected)}
              >
                <SkipForward className="h-4 w-4" />
              </Button>

              {/* Repeat button always visible, now on the right */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleRepeat}
                className={`h-8 w-8 ${repeatMode !== 'none' ? 'text-primary' : ''}`}
                title={`Repeat ${repeatMode}`}
              >
                {repeatMode === 'one' ? (
                  <Repeat1 className="h-4 w-4" />
                ) : (
                  <Repeat className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Volume and Autoplay in the same row */}
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-border/20">
              {/* Volume Controls - Left side */}
              <div className="flex items-center gap-2 flex-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                  className="h-8 w-8 shrink-0"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </Button>
                <Slider
                  value={[volume]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={handleVolumeChange}
                  className="w-full max-w-[150px] sm:max-w-none"
                />
              </div>

              {/* Autoplay Switch - Right side on the same row */}
              <div className="flex items-center gap-2 shrink-0">
                <Label htmlFor="autoplay" className="text-sm whitespace-nowrap">Autoplay</Label>
                <Switch
                  id="autoplay"
                  checked={autoplay}
                  onCheckedChange={(checked) => {
                    setAutoplay(checked);
                    setIsPlaying(checked);
                    broadcastPlayerState(checked);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Current Song Row */}
          <div className="flex items-center space-x-4 p-4 bg-primary/5 rounded-lg border border-primary/10">
            <img
              src={currentSong.thumbnailUrl}
              alt={currentSong.title}
              className="h-12 w-12 rounded object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
              }}
            />
            <div className="flex-grow min-w-0">
              <p className="font-medium truncate">{currentSong.title}</p>
              <p className="text-sm text-muted-foreground truncate">{currentSong.artist}</p>
            </div>
            <Music2 className="h-8 w-8 text-primary animate-pulse" />
          </div>
        </div>
      )}
    </div>
  );
}
