import { RECOMMENDATION_CATEGORY_IDS } from "../types/themeTypes";
import type { LandingTabId, WallpaperMode } from "../types/themeTypes";

export const THEME_ACCENT_OPTIONS = [
  { name: "Emerald", hex: "#10B981" },
  { name: "Ocean Blue", hex: "#38BDF8" },
  { name: "Sunset Pink", hex: "#EC4899" },
  { name: "Royal Purple", hex: "#8B5CF6" },
  { name: "Amber Gold", hex: "#F59E0B" },
  { name: "Crimson", hex: "#F43F5E" },
] as const;

export const WALLPAPER_OPTIONS = [
  {
    id: "banner-top",
    labelKey: "dashboard.profile.themeAppearance.wallpaperOptions.bannerTop",
    defaultLabel: "Top cover banner photo",
  },
  {
    id: "full-wallpaper-image",
    labelKey:
      "dashboard.profile.themeAppearance.wallpaperOptions.fullWallpaperImage",
    defaultLabel: "Full-screen background image",
  },
  {
    id: "ambient-gradient",
    labelKey:
      "dashboard.profile.themeAppearance.wallpaperOptions.ambientGradient",
    defaultLabel: "Ambient mesh gradient",
  },
  {
    id: "solid-color",
    labelKey: "dashboard.profile.themeAppearance.wallpaperOptions.solidColor",
    defaultLabel: "Solid minimal background",
  },
] as const satisfies readonly {
  id: WallpaperMode;
  labelKey: string;
  defaultLabel: string;
}[];

export const WALLPAPER_MODES = WALLPAPER_OPTIONS.map(
  (option) => option.id,
) as readonly WallpaperMode[];

export const LANDING_TAB_IDS = [
  "all-recommendations",
  ...RECOMMENDATION_CATEGORY_IDS,
  "gallery",
  "business",
] as const satisfies readonly LandingTabId[];
