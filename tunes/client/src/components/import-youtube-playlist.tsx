import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ImportYouTubePlaylist({ playlistId }: { playlistId: number }) {
  void playlistId;
  return (
    <Card className="shadow-sm">
      <CardHeader><CardTitle>Playlist import unavailable</CardTitle></CardHeader>
      <CardContent>
        <p>Playlist import is unavailable in this Music release until a separately server-derived entitlement authorizes it.</p>
      </CardContent>
    </Card>
  );
}
