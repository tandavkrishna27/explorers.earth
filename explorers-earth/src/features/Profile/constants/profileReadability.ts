import type { ThemeSettings, ThemeTokenConfig, WallpaperMode } from '../types/themeTypes';

// Text on a public profile is drawn over backgrounds the owner chooses: their own cover
// image, a wallpaper, a gradient. This module is the one place that decides what colours
// and scrims make that text readable, and the numbers it uses are the same ones the
// components render with, so a test can prove WCAG AA (4.5:1) for every preset x layout x
// cover/wallpaper combination instead of hoping the pairing looks fine.
export const AA_CONTRAST = 4.5;

export type Rgb = readonly [number, number, number];

// An owner's image can be anything, and relative luminance is monotonic in each channel, so
// black and white bound every picture. A guarantee over both holds for all of them.
export const IMAGE_EXTREMES: readonly Rgb[] = [[0, 0, 0], [255, 255, 255]];

/** Black overlay over the banner-top cover where the identity text sits (its weakest stop). */
export const HERO_TEXT_SCRIM_ALPHA = 0.6;
/** How much of the cover shows through the full-wallpaper layer. */
export const WALLPAPER_IMAGE_OPACITY = 0.25;
/** Strength of the ambient-gradient wash (peak, at the accent's centre). */
export const AMBIENT_WASH_ALPHA = 0.15;

export function parseColor(value: string): { rgb: Rgb; alpha: number } | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(text);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map((c) => c + c).join('');
    if (digits.length !== 6 && digits.length !== 8) return null;
    const channel = (i: number) => parseInt(digits.slice(i, i + 2), 16);
    return { rgb: [channel(0), channel(2), channel(4)], alpha: digits.length === 8 ? channel(6) / 255 : 1 };
  }
  const hsl = /^hsla?\(\s*([\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(text);
  if (hsl) {
    const h = (((+hsl[1] % 360) + 360) % 360) / 360, sat = Math.min(100, +hsl[2]) / 100, light = Math.min(100, +hsl[3]) / 100;
    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat, p = 2 * light - q;
    const channel = (t: number) => {
      const x = (t + 1) % 1;
      const v = x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
      return Math.round(v * 255);
    };
    const alpha = hsl[4] === undefined ? 1 : hsl[4].endsWith('%') ? parseFloat(hsl[4]) / 100 : parseFloat(hsl[4]);
    return { rgb: [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)], alpha };
  }
  const fn = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(text);
  if (fn) {
    const alpha = fn[4] === undefined ? 1 : fn[4].endsWith('%') ? parseFloat(fn[4]) / 100 : parseFloat(fn[4]);
    return { rgb: [Math.min(255, +fn[1]), Math.min(255, +fn[2]), Math.min(255, +fn[3])], alpha };
  }
  return null;
}

export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `top` drawn at `alpha` over `under`. */
export function over(top: Rgb, alpha: number, under: Rgb): Rgb {
  return [0, 1, 2].map((i) => Math.round(top[i] * alpha + under[i] * (1 - alpha))) as unknown as Rgb;
}

const solid = (value: string): Rgb => {
  const parsed = parseColor(value);
  if (!parsed) throw new Error(`Unreadable colour ${value}`);
  return over(parsed.rgb, parsed.alpha, [255, 255, 255]);
};

const hex = ([r, g, b]: Rgb) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const cssRgba = ([r, g, b]: Rgb, alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

/** Every colour the page background can be behind page text, for a layout. */
export function pageBackdrops(styles: ThemeTokenConfig['styles'], mode: WallpaperMode, accent: string, wallpaperScrimAlpha = 0): Rgb[] {
  const page = solid(styles.bgPage);
  if (mode === 'ambient-gradient') {
    const wash = parseColor(accent);
    return [page, ...(wash ? [over(wash.rgb, AMBIENT_WASH_ALPHA, page)] : [])];
  }
  if (mode === 'full-wallpaper-image') {
    return IMAGE_EXTREMES.map((image) => {
      const withImage = over(image, WALLPAPER_IMAGE_OPACITY, page);
      return over(page, wallpaperScrimAlpha, withImage);
    });
  }
  return [page];
}

const minContrast = (text: Rgb, backdrops: readonly Rgb[]) => Math.min(...backdrops.map((b) => contrastRatio(text, b)));

function firstReadable(candidates: Array<string | undefined>, backdrops: readonly Rgb[]): string {
  const usable = candidates.filter((value): value is string => Boolean(value));
  for (const candidate of usable) {
    const parsed = parseColor(candidate);
    if (parsed && parsed.alpha === 1 && minContrast(parsed.rgb, backdrops) >= AA_CONTRAST) return candidate;
  }
  // Nothing offered works: take whichever of black or white reads best.
  return ['#FFFFFF', '#0F172A']
    .map((c) => ({ c, ratio: minContrast(solid(c), backdrops) }))
    .sort((x, y) => y.ratio - x.ratio)[0].c;
}

/** The smallest steps-of-5% cover of `over` that keeps `text` readable on every backdrop under it. */
function readableAlpha(scrim: Rgb, text: Rgb[], under: readonly Rgb[], from: number): number {
  for (let alpha = from; alpha < 1; alpha = Math.round((alpha + 0.05) * 100) / 100) {
    const worst = text.every((t) => minContrast(t, under.map((u) => over(scrim, alpha, u))) >= AA_CONTRAST);
    if (worst) return alpha;
  }
  return 1;
}

export interface ReadableProfileTheme {
  /** Text drawn directly on the page (tabs, headings, empty states). */
  primary: string;
  secondary: string;
  /** Identity text (name, location, social icons) that sits over the banner-top cover. */
  headerPrimary: string;
  headerSecondary: string;
  /** Overlay that sits over the full-wallpaper cover (null in the other layouts). */
  wallpaperScrim: { alpha: number; color: string } | null;
  /** Panel drawn behind the bio where it can sit over a cover image (null elsewhere). */
  bioScrim: { alpha: number; color: string } | null;
}

export function resolveReadableProfileTheme(preset: ThemeTokenConfig, settings: Pick<ThemeSettings, 'wallpaperMode' | 'accentColor' | 'customTextColor'>): ReadableProfileTheme {
  const { styles } = preset;
  const mode = settings.wallpaperMode;
  const page = solid(styles.bgPage);
  const presetPrimary = solid(styles.textPrimary);

  // The wallpaper layer is the page colour over the cover, so the preset's own text keeps
  // working on it; the alpha is only raised if the cover could still wash the primary text
  // out. Secondary text has less margin, so it falls back to the primary colour where needed.
  const wallpaperAlpha = mode === 'full-wallpaper-image'
    ? readableAlpha(page, [presetPrimary], IMAGE_EXTREMES.map((image) => over(image, WALLPAPER_IMAGE_OPACITY, page)), 0.65)
    : 0;
  const backdrops = pageBackdrops(styles, mode, settings.accentColor, wallpaperAlpha);

  // A custom text colour is the owner's explicit choice and is honoured as set (the preset
  // chrome stays readable regardless; see PUBLIC_CHROME_TOKENS). Only the preset's own colours
  // are guaranteed here.
  const primary = settings.customTextColor || firstReadable([styles.textPrimary], backdrops);
  const secondary = firstReadable([styles.textSecondary, primary], backdrops);

  const hero = IMAGE_EXTREMES.map((image) => over([0, 0, 0], HERO_TEXT_SCRIM_ALPHA, image));
  const headerPrimary = mode === 'banner-top' ? firstReadable(['#FFFFFF'], hero) : primary;
  const headerSecondary = mode === 'banner-top' ? firstReadable(['#FFFFFF'], hero) : secondary;

  // The bio can overlap the banner, so it gets its own panel there: the page colour laid
  // over whatever is behind, strong enough for the text colour that was chosen.
  const bioText = solid(primary);
  const bioAlpha = mode === 'banner-top' ? readableAlpha(page, [bioText], [...IMAGE_EXTREMES, page], 0.7) : 0;

  return {
    primary, secondary, headerPrimary, headerSecondary,
    wallpaperScrim: mode === 'full-wallpaper-image' ? { alpha: wallpaperAlpha, color: cssRgba(page, wallpaperAlpha) } : null,
    bioScrim: mode === 'banner-top' ? { alpha: bioAlpha, color: cssRgba(page, bioAlpha) } : null,
  };
}

export { hex as toHex };
