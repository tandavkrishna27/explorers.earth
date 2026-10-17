import Container from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPage() {
  return (
    <Container>
      <Card className="mx-auto max-w-4xl">
        <CardHeader><CardTitle className="text-2xl font-bold">Privacy Policy</CardTitle></CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4">
          <p>Local Tunes processes only the information needed to provide owner playlists, guest requests, public discovery, and security controls.</p>
          <p>Guest capabilities are kept out of URLs, sitemaps, logs, and analytics. A capability is stored only for the matching public playlist in the current browser session.</p>
          <p>Account and venue identity information is managed by Explorer. Contact Explorer support for identity, account, or deletion requests.</p>
        </CardContent>
      </Card>
    </Container>
  );
}
