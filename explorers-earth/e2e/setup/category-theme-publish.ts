import { expect, type BrowserContext } from '@playwright/test';
import { Kind, parse } from 'graphql';
import { token, type FixtureState } from './category-navigation';

export const publishPresets = {
  'cinematic-dark': { page: '#090D16', text: '#FFFFFF', accent: '#10B981' },
  glassmorphism: { page: '#0F172A', text: '#FFFFFF', accent: '#38BDF8' },
  'sunset-glow': { page: '#1A0B2E', text: '#FFFFFF', accent: '#EC4899' },
  'minimal-light': { page: '#F8FAFC', text: '#0F172A', accent: '#0F172A' },
  'emerald-nature': { page: '#064E3B', text: '#FFFFFF', accent: '#059669' },
  'neon-cyber': { page: '#030712', text: '#FFFFFF', accent: '#F43F5E' },
} as const;

// Late, task-local routes. Every other operation still reaches the shared deny-by-default guard.
export async function installCategoryThemePublishIntercept(context: BrowserContext, state: FixtureState, origin: string, preset: keyof typeof publishPresets) {
  const violations: string[] = [];
  const updates: Record<string, any>[] = [];
  const identityAttempts: string[] = [];
  const original = structuredClone(state.account);
  // Profile's normal save materializes these empty platforms. Preserve seeded unknown
  // fields exactly, while allowing only these known normalizations and the chosen theme edit.
  // Independently checked against the real saved wire payload; do not import its production builder.
  const expectedTheme = { ...original.social_media.theme_settings, preset, accentColor: publishPresets[preset].accent };
  const expectedSocial = {
    ...original.social_media,
    ...Object.fromEntries(['instagram', 'youtube', 'whatsapp', 'website', 'facebook', 'linkedin', 'snapchat', 'tiktok', 'email', 'X', 'spotify', 'youtubeMusic', 'appleMusic'].map(key => [key, {
      ...original.social_media[key],
      link: original.social_media[key]?.link ?? '',
      visibility: original.social_media[key]?.visibility ?? false,
    }])),
    theme_settings: expectedTheme,
  };
  await context.route('**/graphql', async route => {
    const request = route.request();
    let body: any;
    try { body = request.postDataJSON(); } catch { return route.fallback(); }
    if (body?.operationName !== 'UpdateAccount') return route.fallback();
    try {
      const url = new URL(request.url());
      expect(url.origin).toBe(origin);
      expect(url.pathname).toBe('/graphql');
      expect(url.search).toBe('');
      expect(request.method()).toBe('POST');
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      const definitions = parse(body.query).definitions;
      expect(definitions).toHaveLength(1);
      const operation = definitions[0];
      expect(operation.kind).toBe(Kind.OPERATION_DEFINITION);
      if (operation.kind !== Kind.OPERATION_DEFINITION) throw new Error('Missing mutation');
      expect(operation.operation).toBe('mutation');
      expect(operation.name?.value).toBe('UpdateAccount');
      expect(operation.selectionSet.selections).toHaveLength(1);
      const root = operation.selectionSet.selections[0];
      expect(root.kind).toBe(Kind.FIELD);
      if (root.kind !== Kind.FIELD) throw new Error('Missing updateAccount');
      expect(root.name.value).toBe('updateAccount');
      expect(root.alias).toBeUndefined();
      expect(root.arguments?.map(argument => argument.name.value).sort()).toEqual(['data', 'documentId']);
      for (const argument of root.arguments ?? []) {
        expect(argument.value.kind).toBe(Kind.VARIABLE);
        if (argument.value.kind !== Kind.VARIABLE) throw new Error('Unexpected hard-coded mutation subject');
        expect(argument.value.name.value).toBe(argument.name.value);
      }
      expect(Object.keys(body.variables).sort()).toEqual(['data', 'documentId']);
      expect(body.variables.documentId).toBe(original.documentId);
      const data = body.variables.data;
      expect(Object.keys(data).sort()).toEqual(['Account_Name', 'Account_Type', 'Addresss', 'Bio', 'Feed_Data', 'Primary_Address', 'Public_Profile_Address', 'mobile_number', 'mobile_number_visibility', 'social_media'].sort());
      for (const key of ['Account_Name', 'Account_Type', 'Bio', 'Feed_Data', 'Primary_Address', 'Public_Profile_Address', 'mobile_number', 'mobile_number_visibility']) expect(data[key], key).toEqual(original[key]);
      expect(data.Addresss).toEqual(original.Addresss);
      expect(data.social_media.theme_settings).toEqual(expectedTheme);
      expect(data.social_media).toEqual(expectedSocial);
      expect(updates).toHaveLength(0);
      Object.assign(state.account, structuredClone(data), { updatedAt: '2026-09-08T00:00:00.000Z' });
      updates.push(structuredClone(body.variables));
      state.writes.push({ name: 'UpdateAccount', variables: structuredClone(body.variables), owner: true });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { updateAccount: state.account } }) });
    } catch (error) {
      violations.push(`UpdateAccount: ${String(error)}`);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ errors: [{ message: 'Contained publish violation' }] }) });
    }
  });
  const identityUrls = ['https://music-fixture.test/api/music/identity/ensure', `${origin}/__localtunes/api/music/identity/ensure`];
  await context.route(url => identityUrls.includes(url.href), async route => {
    const request = route.request();
    // Dashboard bootstrap already owns an identity read. Before any save, retain that shared guard path.
    if (updates.length === 0) return route.fallback();
    try {
      expect(identityUrls).toContain(request.url());
      expect(request.method()).toBe('POST');
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      expect(request.postData()).toBeNull();
      expect(updates).toHaveLength(1);
      expect(identityAttempts).toHaveLength(0);
      identityAttempts.push(request.url());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ credential: { token: 'synthetic-music-browser-credential', expiresAt: 2000000000000 } }) });
    } catch (error) {
      violations.push(`Music ensure: ${String(error)}`);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
  });
  return { violations, updates, identityAttempts };
}
