import Container from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminDashboard() {
  return (
    <Container>
      <Card className="mx-auto max-w-2xl">
        <CardHeader><CardTitle>Administration moved</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p>Music administration is unavailable in Local Tunes because no internal Music admin principal exists.</p>
          <p className="text-sm text-muted-foreground">Use the authoritative Explorer administration surface for account, content, team, email, analytics, and system operations.</p>
          <Button asChild>
            <a href="https://explorers.earth/admin" rel="noreferrer">Open Explorer administration</a>
          </Button>
        </CardContent>
      </Card>
    </Container>
  );
}
