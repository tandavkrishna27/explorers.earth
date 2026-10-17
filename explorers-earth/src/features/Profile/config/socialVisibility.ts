export const SOCIAL_VISIBILITY_FORM_FIELDS = {
  Instagram: "instagramvisiblity",
  Whatsapp: "whatsappvisiblity",
  Youtube: "youtubevisiblity",
  X: "Xvisiblity",
  Spotify: "spotifyvisiblity",
  Website: "websitevisiblity",
  Facebook: "facebookvisiblity",
  YoutubeMusic: "youtubeMusicvisiblity",
  Gmail: "gmailvisiblity",
  Linkedin: "linkedinvisiblity",
  AppleMusic: "appleMusicvisiblity",
  Tiktok: "tiktokvisiblity",
  Snapchat: "snapchatvisiblity",
} as const;

export type SocialVisibilityKey = keyof typeof SOCIAL_VISIBILITY_FORM_FIELDS;

const LEGACY_VISIBILITY_ALIASES: Partial<
  Record<SocialVisibilityKey, readonly string[]>
> = {
  YoutubeMusic: ["Youtube Music"],
  AppleMusic: ["Apple Music"],
};

export const readSocialVisibility = (
  visibility: Record<string, unknown>,
  key: SocialVisibilityKey,
): boolean => {
  for (const candidate of [key, ...(LEGACY_VISIBILITY_ALIASES[key] || [])]) {
    const value = visibility[candidate];
    if (typeof value === "boolean") return value;
  }
  return false;
};
