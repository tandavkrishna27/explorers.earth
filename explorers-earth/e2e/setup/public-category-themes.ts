import type { ThemePresetId } from '../../src/features/Profile/types/themeTypes';
import { categories, fixtureState } from './category-navigation';
import { seedLongPublicCollection, seedScopedPlaces } from './public-scroll';
import { expect, type Locator, type Page } from '@playwright/test';

// Independent literal acceptance table: deliberately does not call the production palette helper.
export const categoryTokens = {
  'minimal-light': ['#F8FAFC', '#FFFFFF', '#FFFFFF', '#0F172A', '#475569', '#E2E8F0', '#64748B', '#0F172A', '#ffffff', '#0F172A', '#A16207'],
  'cinematic-dark': ['#090D16', '#111827', '#111827', '#FFFFFF', '#9CA3AF', 'rgba(255, 255, 255, 0.1)', '#9CA3AF', '#10B981', '#000000', '#10B981', '#FACC15'],
  glassmorphism: ['#0F172A', 'rgba(255, 255, 255, 0.07)', '#0F172A', '#FFFFFF', '#94A3B8', 'rgba(255, 255, 255, 0.2)', '#94A3B8', '#38BDF8', '#000000', '#38BDF8', '#FACC15'],
  'sunset-glow': ['#1A0B2E', '#2D124D', '#2D124D', '#FFFFFF', '#E9D5FF', '#3B1766', '#E9D5FF', '#EC4899', '#000000', '#EC4899', '#FACC15'],
  'emerald-nature': ['#064E3B', '#047857', '#064E3B', '#FFFFFF', '#D1FAE5', 'rgba(255, 255, 255, 0.15)', '#A7F3D0', '#059669', '#000000', '#A7F3D0', '#FACC15'],
  'neon-cyber': ['#030712', '#111827', '#111827', '#FFFFFF', '#FCA5A5', '#F43F5E', '#F43F5E', '#F43F5E', '#000000', '#F43F5E', '#FACC15'],
} as const;

export async function assertCategoryTokens(page: Page, preset: keyof typeof categoryTokens) {
  const keys = ['page', 'card', 'panel', 'text', 'muted', 'border', 'control-border', 'accent', 'accent-ink', 'focus', 'rating'];
  const shell = page.locator('[data-public-profile-chrome]');
  await expect(shell).toHaveAttribute('data-theme-preset', preset);
  const actual = await shell.evaluate((element: HTMLElement, keys) => keys.map(key => element.style.getPropertyValue(`--category-${key}`)), keys);
  expect.soft(actual).toEqual([...categoryTokens[preset]]);
  expect.soft(await shell.evaluate((element: HTMLElement) => element.style.getPropertyValue('--category-hover'))).toBe(preset === 'emerald-nature' ? 'color-mix(in srgb, var(--category-text) 2%, var(--category-card))' : 'color-mix(in srgb, var(--category-text) 8%, var(--category-card))');
  expect.soft(await shell.evaluate((element: HTMLElement) => element.style.getPropertyValue('--category-skeleton'))).toBe('color-mix(in srgb, var(--category-text) 12%, var(--category-page))');
  await expect(page.locator('[data-profile-wallpaper], [data-profile-hero-backdrop], [data-music-cover]')).toHaveCount(0);
}

export async function assertCategoryKeyboardFocus(page: Page, preset: keyof typeof categoryTokens) {
  const share = page.locator('.public-brand-header .public-brand-action');
  for (let step = 0; step < 30 && !await share.evaluate(element => element === document.activeElement); step++) await page.keyboard.press('Tab');
  await expect(share).toBeFocused();
  await expect(share).toHaveCSS('outline-style', 'solid');
  // Keyboard traversal can scroll a carousel under the fixed header; explicitly sample its solid-page state.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => page.locator('[data-public-profile-chrome]').evaluate((element: HTMLElement) => element.style.getPropertyValue('--category-header-action-ink'))).toBe('');
  const expected = { 'minimal-light': 'rgb(15, 23, 42)', 'cinematic-dark': 'rgb(16, 185, 129)', glassmorphism: 'rgb(56, 189, 248)', 'sunset-glow': 'rgb(236, 72, 153)', 'emerald-nature': 'rgb(167, 243, 208)', 'neon-cyber': 'rgb(244, 63, 94)' };
  expect.soft(await share.evaluate(element => getComputedStyle(element).outlineColor)).toBe(expected[preset]);
}

// Resolve translucent foreground and every ancestor background before measuring WCAG contrast.
export async function assertCompositedContrast(target: Locator, minimum = 4.5, options: { uniformGradientText?: boolean; uniformBackgroundGradients?: boolean } = {}) {
  const result = await target.evaluate((element, options) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const channels = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const values = Array.from(context.getImageData(0, 0, 1, 1).data);
      values[3] /= 255;
      return values;
    };
    const over = (front: number[], back: number[]) => front.slice(0, 3).map((value, index) => value * (front[3] ?? 1) + back[index] * (1 - (front[3] ?? 1)));
    const uniformGradient = (value: string) => {
      if (!value.startsWith('linear-gradient(')) throw new Error(`Unsupported gradient: ${value}`);
      const stops = value.match(/rgba?\([^)]+\)/g) || [];
      if (stops.length < 2 || value.replace(/rgba?\([^)]+\)/g, '').match(/(?:url|hsl|color|oklab|var|gradient)\(/g)?.length !== 1) throw new Error(`Unsupported resolved gradient stops: ${value}`);
      const resolved = stops.map(channels);
      if (resolved.some(stop => JSON.stringify(stop) !== JSON.stringify(resolved[0]))) throw new Error(`Nonuniform gradient is not supported: ${value}`);
      return { color: stops[0], channels: resolved[0] };
    };
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) ancestors.unshift(current);
    let background = [255, 255, 255];
    for (const ancestor of ancestors) {
      const style = getComputedStyle(ancestor);
      background = over(channels(style.backgroundColor), background);
      if (options.uniformBackgroundGradients && style.backgroundImage !== 'none' && !(ancestor === element && options.uniformGradientText)) background = over(uniformGradient(style.backgroundImage).channels, background);
    }
    const targetStyle = getComputedStyle(element);
    if (options.uniformGradientText && targetStyle.backgroundClip !== 'text') throw new Error('Expected actual background-clipped text');
    const color = options.uniformGradientText ? uniformGradient(targetStyle.backgroundImage).color : targetStyle.color;
    const foreground = over(channels(color), background);
    const luminance = (rgb: number[]) => rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const a = luminance(foreground), b = luminance(background);
    return { color, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
  }, options);
  expect.soft(result.ratio, JSON.stringify(result)).toBeGreaterThanOrEqual(minimum);
  return result;
}

export const mediaFamilies = ['movies', 'books', 'games', 'apps', 'products', 'people'] as const;
// Existing bundled artwork stays inside the contained origin, including URL builders.
const artwork = 'http://127.0.0.1:55184/images/category-theme-fixture.svg';

export function seedCategoryThemeState(preset: ThemePresetId) {
  const state = fixtureState({ social_media: { theme_settings: {
    preset, wallpaperMode: 'solid-color', accentColor: '', customTextColor: '',
    landingTab: 'profile', visibleTabs: { recommendations: true, gallery: false, business: false },
    footerBranding: 'enabled',
  } } });
  seedScopedPlaces(state);
  seedLongPublicCollection(state, 'guides', { lists: 1, items: 2 });
  const firstPlace = state.lists.recommendationLists[0].recommended_places[0];
  firstPlace.Place_Details.Geometry = { lat: 26.9124, lng: 75.7873 };
  state.lists.recommendationLists[0].recommended_places.push({ ...structuredClone(firstPlace), documentId: 'place-1-2', Place_Details: { ...firstPlace.Place_Details, Title: 'City 1 place 2', Place_Name: 'City 1 place 2', Place_Id: 'fixture-1-2', Geometry: { lat: 26.9150, lng: 75.7900 } } });
  state.lists.guides[0].guide_sections.forEach((section: any, index: number) => {
    section.Timeline[index === 0 ? 'morning' : 'afternoon'] = [{
      place_id: `guide-place-${index + 1}`, name: `Guide place ${index + 1}`, formatted_address: 'Fixture City',
      geometry: { location: { lat: 26.9124 + index * .01, lng: 75.7873 + index * .01 } },
      rating: 4.5, user_ratings_total: 20, photos: [], types: ['cafe'],
    }];
  });
  for (const family of mediaFamilies) {
    seedLongPublicCollection(state, family, { lists: 1, items: 3 });
    const root = categories.find(category => category.route === family)!.root;
    const list = state.lists[root][0];
    list.list_description = 'A thoughtful collection';
    for (const [index, item] of list[`recommended_${family}`].entries()) {
      Object.assign(item, { is_pinned: index === 0, pin_order: index === 0 ? 0 : null,
        description: 'A considered recommendation with useful details.',
        overview: 'A considered recommendation with useful details.',
        summary: 'A considered recommendation with useful details.',
        bio: 'A considered recommendation with useful details.',
        user_recommendation_note: 'Recommended for its thoughtful design.',
        poster_path: artwork, backdrop_path: artwork, cover_url: artwork, cover_url_large: artwork,
        logo_url: artwork, avatar_url: artwork, avatar_path: artwork,
        genres: family === 'movies' ? [{ id: 18, name: 'Drama' }] : ['Adventure'], subjects: ['Fiction'],
        skills_tags: ['Design'], tags: ['Design'], people_category: { documentId: 'design', Category_name: 'Design' }, screenshots: [artwork], images: [artwork],
      });
    }
  }
  return state;
}
