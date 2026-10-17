export function publicMusicShareUrl(
  origin: string,
  publication: { mode: "private" | "unlisted" | "public"; publicSlug: string } | undefined,
): string | undefined {
  if (publication?.mode !== "public" || !publication.publicSlug) return undefined;
  return `${origin}/music/share/${encodeURIComponent(publication.publicSlug)}`;
}
