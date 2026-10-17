import { useState, useEffect, useRef } from "react";
import { Song } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Grip, Trash2, Play, Loader2, Plus, Check, Square, ChevronUp, ChevronDown } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { acquireGuestMusicCapability, guestMusicRequest } from "@/lib/musicCredential";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationEllipsis,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

// Marquee-like text component for long titles
interface MarqueeTextProps {
  text: string;
  className?: string;
}

function MarqueeText({ text, className }: MarqueeTextProps) {
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 640);
    };

    // Check on mount
    checkMobile();

    // Add resize listener
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Determine if text is longer than container and needs animation
  useEffect(() => {
    if (textRef.current && containerRef.current) {
      const isOverflowing = textRef.current.scrollWidth > containerRef.current.clientWidth;
      setShouldAnimate(isOverflowing);
    }
  }, [text]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "overflow-marquee max-w-full",
        className
      )}
    >
      <div
        ref={textRef}
        className={cn(
          "marquee-text",
          shouldAnimate && "marquee-text-clone",
          // Always animate text if it's overflowing, not just on mobile
          shouldAnimate && "marquee-text-mobile-auto",
          !shouldAnimate && "!animate-none"
        )}
        title={text} // Add tooltip on hover
        data-content={text} // Store the text for pseudo-element duplication
      >
        {text}
      </div>
    </div>
  );
}

const SONGS_PER_PAGE = 10;

// Update type to handle both main playlist songs and saved playlist songs
type PlaylistSong = {
  id: number;
  youtubeId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  position: number;
  addedAt: Date;
};

type SongType = Song | PlaylistSong;

type Props = {
  songs: SongType[];
  showControls?: boolean;
  onPlaySong?: (song: SongType) => void;
  onDeleteSong?: (songId: number) => void;
  onUpdatePosition?: (songId: number, newPosition: number) => void;
  onDeleteMultiple?: (songIds: number[]) => void;
  onAddMultiple?: (songs: SongType[]) => void;
  onClearHistory?: () => void;
  onAddToQueue?: (song: SongType) => void;
  showAddToQueue?: boolean;
  currentPlayingSong?: SongType | null;
  isHistory?: boolean;
  guestUrl?: string;
  isAddingMultiple?: boolean;
  isDeletingMultiple?: boolean;
  isPlaylist?: boolean;
  showReorderControls?: boolean; // New prop to control visibility of reorder column
};

export default function PlaylistTable({
  songs,
  showControls = true,
  onPlaySong,
  onDeleteSong,
  onUpdatePosition,
  onDeleteMultiple,
  onAddMultiple,
  onClearHistory,
  currentPlayingSong,
  isHistory = false,
  guestUrl,
  isAddingMultiple = false,
  isDeletingMultiple = false,
  onAddToQueue,
  showAddToQueue = false,
  isPlaylist = false,
  showReorderControls = true, // By default show reorder controls
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSongs, setSelectedSongs] = useState<Set<number>>(new Set());

  const addToQueueMutation = useMutation({
    mutationFn: async (song: SongType) => {
      const input = {
        youtubeId: song.youtubeId,
        title: song.title,
        artist: song.artist,
        thumbnailUrl: song.thumbnailUrl,
      };
      if (guestUrl) await guestMusicRequest(acquireGuestMusicCapability(guestUrl) ?? "", input, guestUrl);
      else await apiRequest("POST", "/api/playlist/songs", input);
    },
    onSuccess: () => {
      if (guestUrl) {
        queryClient.invalidateQueries({ queryKey: [`/api/playlist/${guestUrl}`] });
      } else if (user?.guestUrl) {
        queryClient.invalidateQueries({ queryKey: [`/api/playlist/${user.guestUrl}`] });
      }
      toast({
        title: "Song added",
        description: "The song has been added to the playlist",
      });
    },
    onError: (error) => {
      console.error("Failed to add song to queue:", error);
      toast({
        title: "Failed to add song",
        description: error instanceof Error ? error.message : "Could not add song to playlist",
        variant: "destructive",
      });
    },
  });

  const showBulkActions = isHistory && showControls && !guestUrl;

  const handleSelectAll = (checked: boolean) => {
    const startIndex = (currentPage - 1) * SONGS_PER_PAGE;
    const endIndex = startIndex + SONGS_PER_PAGE;
    const currentPageSongs = songs.slice(startIndex, endIndex);

    if (checked) {
      const currentPageSongIds = currentPageSongs.map(song => song.id);
      setSelectedSongs(new Set(currentPageSongIds));
    } else {
      setSelectedSongs(new Set());
    }
  };

  const handleSelectSong = (songId: number, checked: boolean) => {
    const newSelected = new Set(selectedSongs);
    if (checked) {
      newSelected.add(songId);
    } else {
      newSelected.delete(songId);
    }
    setSelectedSongs(newSelected);
  };

  const handleDeleteSelected = async () => {
    if (!onDeleteMultiple || isDeletingMultiple) return;

    const selectedIds = Array.from(selectedSongs);
    if (selectedIds.length === 0) return;

    try {
      await onDeleteMultiple(selectedIds);
    } catch (error) {
      console.error("Error in handleDeleteSelected:", error);
      toast({
        title: "Failed to delete songs",
        description: "Could not remove selected songs from history",
        variant: "destructive",
      });
    }
  };

  const handleAddSelected = async () => {
    if (!onAddMultiple || isAddingMultiple) return;

    const selectedSongObjects = songs.filter(song => selectedSongs.has(song.id));
    if (selectedSongObjects.length === 0) return;

    try {
      await onAddMultiple(selectedSongObjects);
      setSelectedSongs(new Set()); // Clear selection after successful addition
    } catch (error) {
      console.error("Error in handleAddSelected:", error);
      toast({
        title: "Failed to add songs",
        description: "Could not add selected songs to playlist",
        variant: "destructive",
      });
    }
  };

  if (songs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No songs {isHistory ? "in history" : "in your playlist"}. {!isHistory && "Add some songs to get started!"}</p>
      </div>
    );
  }

  const totalPages = Math.ceil(songs.length / SONGS_PER_PAGE);
  const startIndex = (currentPage - 1) * SONGS_PER_PAGE;
  const endIndex = startIndex + SONGS_PER_PAGE;
  const displaySongs = songs.slice(startIndex, endIndex);

  const allSelected = displaySongs.every(song => selectedSongs.has(song.id));
  const someSelected = displaySongs.some(song => selectedSongs.has(song.id));

  const handleMoveUp = (songId: number, currentIndex: number) => {
    if (!onUpdatePosition) return;

    // Get the actual position in the full list
    const actualPosition = startIndex + currentIndex;

    // Only allow moving up if we're not at the first position
    if (actualPosition > 0) {
      console.log('Moving song up:', {
        songId,
        currentIndex,
        startIndex,
        actualPosition,
        newPosition: actualPosition - 1,
        totalSongs: songs.length
      });
      onUpdatePosition(songId, actualPosition - 1);
    }
  };

  const handleMoveDown = (songId: number, currentIndex: number) => {
    if (!onUpdatePosition) return;

    // Get the actual position in the full list
    const actualPosition = startIndex + currentIndex;

    // Only allow moving down if we're not at the last position
    if (actualPosition < songs.length - 1) {
      console.log('Moving song down:', {
        songId,
        currentIndex,
        startIndex,
        actualPosition,
        newPosition: actualPosition + 1,
        totalSongs: songs.length
      });
      onUpdatePosition(songId, actualPosition + 1);
    }
  };

  return (
    <div className="space-y-4">
      {showBulkActions && selectedSongs.size > 0 && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            {selectedSongs.size} song{selectedSongs.size !== 1 ? "s" : ""} selected
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddSelected}
              disabled={isAddingMultiple || selectedSongs.size === 0}
            >
              {isAddingMultiple ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Add Selected to Playlist
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteSelected}
              disabled={isDeletingMultiple || selectedSongs.size === 0}
            >
              {isDeletingMultiple ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete Selected
            </Button>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            {showBulkActions && (
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  data-state={allSelected ? "checked" : someSelected ? "indeterminate" : "unchecked"}
                />
              </TableHead>
            )}
            {showControls && !isHistory && showReorderControls && <TableHead className="w-[100px]">Order</TableHead>}
            <TableHead>Title</TableHead>
            <TableHead className="w-[120px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displaySongs.map((song, index) => {
            const isPlaying = isPlaylist
              ? song.youtubeId === currentPlayingSong?.youtubeId
              : song.id === currentPlayingSong?.id;

            return (
              <TableRow key={song.id} className={isPlaying ? "bg-primary/5" : undefined}>
                {showBulkActions && (
                  <TableCell>
                    <Checkbox
                      checked={selectedSongs.has(song.id)}
                      onCheckedChange={(checked) => handleSelectSong(song.id, checked as boolean)}
                    />
                  </TableCell>
                )}
                {showControls && !isHistory && showReorderControls && (
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <span className="text-muted-foreground">
                        <Grip className="h-4 w-4 cursor-move" />
                      </span>
                      <div className="flex flex-col space-y-1">
                        <div className="p-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8"
                            onClick={() => handleMoveUp(song.id, index)}
                            disabled={startIndex + index === 0}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="p-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8"
                            onClick={() => handleMoveDown(song.id, index)}
                            disabled={startIndex + index >= songs.length - 1}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center space-x-3">
                    <img
                      src={song.thumbnailUrl}
                      alt={song.title}
                      className="h-8 w-8 rounded object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M9 18V5l12-2v13'/><circle cx='6' cy='18' r='3'/><circle cx='18' cy='16' r='3'/></svg>";
                      }}
                    />
                    <div className="flex flex-col max-w-[120px] sm:max-w-[200px] md:max-w-[300px]">
                      <MarqueeText text={song.title} className="font-medium" />
                      <span className="text-sm text-muted-foreground truncate">{song.artist}</span>
                    </div>
                    {isPlaying && (
                      <span className="ml-2 text-sm text-primary">Now Playing</span>
                    )}
                    {!isHistory && !isPlaylist && songs[0]?.id === song.id && !isPlaying && (
                      <span className="ml-2 text-sm text-primary/80">Next up</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    {onPlaySong && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // For saved playlists (isPlaylist=true), directly play the song
                          // For other cases (history or main playlist), use the previous behavior
                          if (isPlaylist) {
                            onPlaySong(song);
                          } else if (isHistory && onAddToQueue) {
                            onAddToQueue(song);
                          } else if (onPlaySong) {
                            onPlaySong(song);
                          }
                        }}
                        disabled={isPlaying}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    )}

                    {(isHistory || showAddToQueue || isPlaylist) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (isHistory) {
                            addToQueueMutation.mutate(song);
                          } else if (onAddToQueue) {
                            onAddToQueue(song);
                          }
                        }}
                        disabled={addToQueueMutation.isPending}
                      >
                        {addToQueueMutation.isPending && isHistory ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                      </Button>
                    )}

                    {((isHistory && !guestUrl) || (showControls && !guestUrl && !isHistory)) && onDeleteSong && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteSong(song.id)}
                        disabled={isPlaying}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {isHistory && !guestUrl && (
        <Button variant="outline" size="sm" onClick={onClearHistory} className="mt-4">
          Clear History
        </Button>
      )}

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>

            {currentPage > 2 && (
              <PaginationItem>
                <PaginationLink onClick={() => setCurrentPage(1)}>1</PaginationLink>
              </PaginationItem>
            )}

            {currentPage > 3 && (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            )}

            {Array.from({ length: 3 }, (_, i) => currentPage - 1 + i)
              .filter((page) => page > 0 && page <= totalPages)
              .map((page) => (
                <PaginationItem key={page}>
                  <PaginationLink
                    isActive={currentPage === page}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              ))}

            {currentPage < totalPages - 2 && (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            )}

            {currentPage < totalPages - 1 && (
              <PaginationItem>
                <PaginationLink onClick={() => setCurrentPage(totalPages)}>
                  {totalPages}
                </PaginationLink>
              </PaginationItem>
            )}

            <PaginationItem>
              <PaginationNext
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
