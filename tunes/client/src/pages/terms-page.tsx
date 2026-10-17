import Container from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsPage() {
  return (
    <Container>
      <Card className="mx-auto max-w-4xl">
        <CardHeader><CardTitle className="text-2xl font-bold">Terms of Service</CardTitle></CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4">
          <p>These terms govern your use of Local Tunes and its owner, guest, and public playlist features.</p>
          <p>Use Music only for content you are authorized to access. Do not bypass account, guest capability, publication, rate, or entitlement controls.</p>
          <p>Explorer remains the authority for account, venue, billing, and administrative settings. Local Tunes may make a feature unavailable when its required authority is absent.</p>
        </CardContent>
      </Card>
    </Container>
  );
}
