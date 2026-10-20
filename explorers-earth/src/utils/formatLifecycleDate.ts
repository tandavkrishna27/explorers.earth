/** A scheduled-deletion timestamp as a long calendar date in the viewer's language; "" if unusable. */
export function formatLifecycleDate(iso: string | null | undefined, language?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(language || undefined, { dateStyle: "long" }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(date);
  }
}
