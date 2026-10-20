import { guideDescriptionText } from "./guideDescriptionText";

/**
 * Plain text for a one-line note preview. Notes are stored as HTML, so tags are dropped
 * and entities such as &nbsp; are decoded the way guide descriptions are, rather than
 * shown literally.
 */
export function notePreviewText(note: string): string {
  return guideDescriptionText(note.replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}
