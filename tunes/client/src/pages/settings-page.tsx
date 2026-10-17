import Container from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <Container>
      <Card className="mx-auto max-w-2xl">
        <CardHeader><CardTitle>Music settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p>Account, device, password, and subscription settings are managed in Explorer.</p>
          <p className="text-sm text-muted-foreground">Playlist visibility and guest capability rotation remain available from the Local Tunes dashboard.</p>
          <Button asChild>
            <a href="https://explorers.earth/settings" rel="noreferrer">Open Explorer settings</a>
          </Button>
        </CardContent>
      </Card>
    </Container>
  );
}
