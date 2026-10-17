import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { importGuestMusicCapability } from "@/lib/musicCredential";

export default function GuestCapabilityImport({ guestUrl, onImported }: { guestUrl: string; onImported: () => void }) {
  const [handoff, setHandoff] = useState("");
  const [error, setError] = useState<string>();

  const importAccess = (event: FormEvent) => {
    event.preventDefault();
    try {
      importGuestMusicCapability(handoff, guestUrl);
      setHandoff("");
      setError(undefined);
      onImported();
    } catch {
      setError("That guest access handoff is invalid for this playlist.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paste guest access handoff</CardTitle>
        <CardDescription>
          Paste the complete handoff shared by the playlist owner. The secret stays in this tab and is sent only in the protected request header.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={importAccess} className="space-y-3">
          <Textarea
            aria-label="Guest access handoff"
            autoComplete="off"
            spellCheck={false}
            value={handoff}
            onChange={(event) => setHandoff(event.target.value)}
          />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!handoff.trim()}>Import guest access</Button>
        </form>
      </CardContent>
    </Card>
  );
}
