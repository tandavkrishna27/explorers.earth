/**
 * The local fixture embeds YouTube. Chromium reports this provider-side
 * permissions-policy warning for its iframe even though the Music app did not
 * request the feature. Keep this list exact: application and unknown console
 * errors must continue failing UAT.
 */
export function isKnownMusicFixtureProviderDiagnostic(input: { message: string; sourceUrl: string }): boolean {
  if (input.message !== "Permissions policy violation: compute-pressure is not allowed in this document.") return false;
  try {
    const source = new URL(input.sourceUrl);
    if (source.protocol !== "https:" || !["www.youtube.com", "www.youtube-nocookie.com"].includes(source.hostname)) return false;
    return source.pathname.startsWith("/embed/") || source.pathname.startsWith("/s/player/") || source.pathname === "/iframe_api";
  } catch {
    return false;
  }
}
