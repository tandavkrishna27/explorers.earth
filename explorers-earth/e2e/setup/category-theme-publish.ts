import { expect, type BrowserContext } from '@playwright/test';
import { canonicalCategoryAccount, type FixtureState } from './category-navigation';
import { accountDtoSchema, updateAccountRequestSchema } from '../../../tunes/shared/explorersContract';

export const publishPresets = {
  'cinematic-dark': { page: '#090D16', text: '#FFFFFF', accent: '#10B981' },
  glassmorphism: { page: '#0F172A', text: '#FFFFFF', accent: '#38BDF8' },
  'sunset-glow': { page: '#1A0B2E', text: '#FFFFFF', accent: '#EC4899' },
  'minimal-light': { page: '#F8FAFC', text: '#0F172A', accent: '#0F172A' },
  'emerald-nature': { page: '#064E3B', text: '#FFFFFF', accent: '#059669' },
  'neon-cyber': { page: '#030712', text: '#FFFFFF', accent: '#F43F5E' },
} as const;

const themeKeys = ['preset', 'wallpaperMode', 'accentColor', 'customTextColor', 'landingTab', 'visibleTabs', 'footerBranding'];

// Late, task-local routes. Every other operation still reaches the shared deny-by-default guard.
// Since the replatform the Appearance save is one canonical PATCH /api/explorers/v1/account
// (useUpdateProfile -> toAccountUpdate); the Strapi UpdateAccount mutation and the Music identity
// ensure it used to drive are gone. The write is checked against the server's own strict request
// schema, and every identity field must round-trip unchanged beside the chosen theme edit.
export async function installCategoryThemePublishIntercept(context: BrowserContext, state: FixtureState, origin: string, preset: keyof typeof publishPresets) {
  const violations: string[] = [];
  const updates: Record<string, any>[] = [];
  const ownerAccount = () => accountDtoSchema.parse({
    ...canonicalCategoryAccount(state),
    themeSettings: Object.fromEntries(Object.entries(state.account.social_media.theme_settings ?? {})
      .filter(([key, value]) => themeKeys.includes(key) && value !== '')),
  });
  const original = ownerAccount();
  await context.route(url => url.origin === origin && url.pathname === '/api/explorers/v1/me', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    state.reads.push({ name: 'GET /api/explorers/v1/me', variables: {}, owner: true });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: ownerAccount() }) });
  });
  await context.route(url => url.origin === origin && url.pathname === '/api/explorers/v1/account', async route => {
    const request = route.request();
    if (request.method() !== 'PATCH') return route.fallback();
    try {
      expect(new URL(request.url()).search).toBe('');
      expect(updates).toHaveLength(0);
      const body = updateAccountRequestSchema.parse(request.postDataJSON());
      expect(body.expectedRevision).toBe(original.revision);
      expect(body.themeSettings).toEqual({ ...original.themeSettings, preset, accentColor: publishPresets[preset].accent });
      for (const key of ['handle', 'displayName', 'accountType', 'mobileNumber', 'mobileNumberVisible', 'primaryAddress'] as const) {
        if (key in body) expect(body[key], key).toEqual(original[key]);
      }
      Object.assign(state.account.social_media.theme_settings, { preset, accentColor: publishPresets[preset].accent });
      state.canonicalAccountRevision++;
      updates.push(structuredClone(body));
      state.writes.push({ name: 'PATCH /api/explorers/v1/account', variables: structuredClone(body), owner: true });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: ownerAccount() }) });
    } catch (error) {
      violations.push(`PATCH account: ${String(error)}`);
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'CONFLICT', message: 'Contained publish violation', requestId: 'category-theme-publish' } }) });
    }
  });
  return { violations, updates };
}
