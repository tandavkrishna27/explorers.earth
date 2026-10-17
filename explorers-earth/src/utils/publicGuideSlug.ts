const PUBLIC_DETAIL_SEGMENT = /^[A-Za-z0-9_-]{1,160}$/;

export function publicGuideSlug(guide: { slug?: unknown; documentId: string }): string {
  return typeof guide.slug === "string" && PUBLIC_DETAIL_SEGMENT.test(guide.slug)
    ? guide.slug
    : guide.documentId;
}
