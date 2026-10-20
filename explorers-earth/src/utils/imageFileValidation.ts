/**
 * Client-side checks for image pickers, matching what the media service accepts for
 * recommendation and collection images, so a bad file is refused with a clear message
 * before anything is saved rather than failing after the owning record exists.
 */
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const ACCEPTED_IMAGE_ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(",");
/** Mirrors the server limit for recommendation/collection images (5 MB). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type RejectedImage = { file: File; reason: "type" | "size" | "empty" };

export function validateImageFiles(
  files: readonly File[],
  maxBytes: number = MAX_IMAGE_BYTES,
): { valid: File[]; rejected: RejectedImage[] } {
  const valid: File[] = [];
  const rejected: RejectedImage[] = [];
  for (const file of files) {
    if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) rejected.push({ file, reason: "type" });
    else if (file.size < 1) rejected.push({ file, reason: "empty" });
    else if (file.size > maxBytes) rejected.push({ file, reason: "size" });
    else valid.push(file);
  }
  return { valid, rejected };
}

export function maxImageMegabytes(maxBytes: number = MAX_IMAGE_BYTES): number {
  return Math.floor(maxBytes / (1024 * 1024));
}
