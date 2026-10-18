import { expect, type BrowserContext } from '@playwright/test';
import { fixtureState, installContainedRoutes } from './category-navigation';

// Render-only public-presentation fixture for the public chrome specs. It owns
// the contained category fixture, the account appearance, a local artwork
// route and the single guide-detail record the shared fixture does not model.
export async function installPublicPresentationFixture(context: BrowserContext, origin: string, options: {
  preset?: string; wallpaperMode?: string; imageMode?: 'valid' | 'missing' | 'broken';
} = {}) {
  let imageMode = options.imageMode ?? 'valid';
  const artwork = origin + '/images/public-presentation-art.svg';
  const state = fixtureState({ public_music: 'Yes', pinned_nav_tabs: ['public_profile', 'public_music'] }, 'public');
  const setAppearance = (preset = 'cinematic-dark', wallpaperMode = 'solid-color', mode = imageMode) => {
    imageMode = mode;
    state.account.social_media.theme_settings = { ...state.account.social_media.theme_settings, preset, wallpaperMode, accentColor: '#10b981' };
    state.account.profile_picture = imageMode === 'missing' ? null : { url: artwork, alternativeText: 'Selected profile photo' };
    state.account.bg_picture = imageMode === 'missing' ? null : { url: artwork, alternativeText: 'Selected background' };
  };
  setAppearance(options.preset, options.wallpaperMode);
  const guard = await installContainedRoutes(context, origin, state);
  // PublicGuideDetailPage resolves its selected guide through a singular `guide`
  // query; the shared category fixture deliberately models only list roots.
  // Keep this tiny detail record local to presentation tests so the real header
  // is exercised without reaching an external guide service.
  const publicGuide = {
    ...state.lists.guides[0],
    Description: null,
    Guide_Type: "City guide",
    Estimated_Budget: null,
    Number_Of_Days: 1,
    guide_sections: [{
      documentId: "guide-section-day-1",
      Title: "Day 1",
      Sequence: 1,
      Description: "A contained first-day itinerary for sticky navigation geometry.",
      Timeline: null,
      Transport: null,
      Stay: null,
      Recommendation_Activity: null,
      Map_Details: null,
      Packing_List: null,
      Pre_Tasks: null,
      Section_tags: null,
      Budget: null,
    }],
    Guide_Media: [{ url: artwork, name: "Contained guide cover" }],
    Guide_Tags: [],
    Place_Details: [],
    Tips_Notes: null,
    Guide_Section_Details: null,
    is_pinned: false,
    pin_order: 0,
    display_order: 0,
    account: state.account,
  };
  await context.route("**/graphql", async route => {
    const request = route.request();
    const operationName = request.method() === "POST" ? request.postDataJSON()?.operationName : undefined;
    if (operationName === "GetPublicGuideById") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { guide: publicGuide } }) });
    }
    return route.fallback();
  });
  await context.route("https://images.unsplash.com/**", route => route.fulfill({
    status: 200,
    contentType: "image/gif",
    body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
  }));
  await context.route(artwork, route => route.fulfill({
    status: 200, contentType: 'image/svg+xml',
    body: imageMode === 'broken' ? 'invalid image fixture' : '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#314f6b"/><stop offset=".5" stop-color="#db957c"/><stop offset="1" stop-color="#284435"/></linearGradient></defs><path fill="url(#g)" d="M0 0h1000v600H0z"/><circle cx="740" cy="140" r="80" fill="#f7dfb4"/><path d="M0 380 260 180 540 380 790 250 1000 360v240H0" fill="#152d35" opacity=".65"/></svg>',
  }));
  return {
    state, setAppearance,
    assertClean() { guard.assertClean(); expect(state.writes).toEqual([]); },
  };
}
