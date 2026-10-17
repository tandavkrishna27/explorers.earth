import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function ImportPlaylistModal({ open, onOpenChange }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  guestUrl?: string;
  playlistId?: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Playlist import unavailable</DialogTitle>
          <DialogDescription>
            Playlist import is unavailable in this Music release until a separately server-derived entitlement authorizes it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter><Button type="button" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
