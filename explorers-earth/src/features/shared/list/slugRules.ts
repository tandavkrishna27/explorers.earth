// Must equal contentSlug in tunes/shared/explorersContract.ts.
const PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MAX = 200;

export const slugify = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, SLUG_MAX).replace(/-+$/, "");

export function slugProblem(slug: string): string | null {
  if (!slug) return "Enter a URL name";
  if (slug.length > SLUG_MAX) return `Keep it to ${SLUG_MAX} characters or fewer`;
  if (!PATTERN.test(slug)) return "Use lowercase letters, numbers and dashes";
  return null;
}
