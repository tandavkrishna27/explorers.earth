import i18n from "i18next";
import { ACCEPTED_IMAGE_TYPES } from "./imageFileValidation";

export type MediaPurpose = "profile" | "background" | "feed" | "recommendation" | "collection" | "guide";

// Mirrors mediaUploadProblem in tunes/server/application/media.ts.
const MB = 1024 * 1024;
const limitFor = (purpose: MediaPurpose) => (purpose === "feed" ? 10 : 5) * MB;
const typesFor = (purpose: MediaPurpose): readonly string[] =>
  purpose === "feed" ? [...ACCEPTED_IMAGE_TYPES, "video/mp4"] : ACCEPTED_IMAGE_TYPES;

const tr = (key: string, defaultValue: string, options: Record<string, unknown> = {}) =>
  i18n.isInitialized
    ? String(i18n.t(key, { defaultValue, ...options }))
    : defaultValue.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name] ?? ""));

/** Why the media service would refuse this file, checked before any bytes are sent (UAT MED-X01). */
export function mediaUploadProblem(file: File, purpose: MediaPurpose): { code: string; message: string } | null {
  if (!typesFor(purpose).includes(file.type)) {
    return purpose === "feed"
      ? { code: "UNSUPPORTED_MEDIA_TYPE", message: tr("media.upload.unsupportedTypeFeed", "Use a JPEG, PNG, WebP or GIF image, or an MP4 video") }
      : { code: "UNSUPPORTED_MEDIA_TYPE", message: tr("media.upload.unsupportedType", "Use a JPEG, PNG, WebP or GIF image") };
  }
  if (file.size < 1) return { code: "UNREADABLE_MEDIA", message: tr("media.upload.empty", "The file is empty") };
  const limit = limitFor(purpose);
  if (file.size > limit) {
    return { code: "MEDIA_TOO_LARGE", message: tr("media.upload.tooLarge", "File is too large. The limit is {{limit}} MB", { limit: limit / MB }) };
  }
  return null;
}

/** The media service accepts only letters, digits, underscore, dot, space and hyphen in a file name. */
export function safeMediaFileName(name: string): string {
  const cleaned = name.replace(/[^\w. -]+/g, "-").slice(-255).trim();
  return cleaned || "upload";
}
