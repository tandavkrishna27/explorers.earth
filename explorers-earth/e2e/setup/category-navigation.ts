import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Kind, parse, print, visit, type SelectionSetNode } from 'graphql';
import { canonicalAccountFixture } from '../../src/test/canonicalAccountFixture';
import { bookFixtureId, createBooksOwnerFixture } from './books-owner-content';
import { commandKeySchema, updateCollectionSchema, contentRevisionSchema, collectionCoreDtoSchema, updateAccountRequestSchema, accountDtoSchema } from '../../../tunes/shared/explorersContract';

export const fixtureUser = { id: 'browser-user', documentId: 'browser-user', username: 'fixture-owner', email: 'owner@example.test', blocked: false };
export const token = 'synthetic-browser-authority-not-a-live-token';
const sessionCookie = 'better-auth.session_token';
const sessionValue = 'contained-browser-session';
const sessionId = 'contained-browser-session-id';
export const categories = [
  { field: 'public_recommendations', route: 'places', label: 'Places Tab', root: 'recommendationLists' },
  { field: 'public_movie', route: 'movies', label: 'Movies & Shows Tab', root: 'movieLists' },
  { field: 'public_books', route: 'books', label: 'Books Tab', root: 'bookLists' },
  { field: 'public_games', route: 'games', label: 'Games Tab', root: 'gameLists' },
  { field: 'public_apps', route: 'apps', label: 'Apps & Tools Tab', root: 'appLists' },
  { field: 'public_products', route: 'products', label: 'Products Tab', root: 'productLists' },
  { field: 'public_people', route: 'people', label: 'People Tab', root: 'personLists' },
  { field: 'public_guides', route: 'guides', label: 'Guides Tab', root: 'guides' },
] as const;
export const publicSlug = 'fixture-public-music';
const credential = 'synthetic-music-browser-credential';
const recommendationRelationByRoute: Record<string, string> = {
  places: 'recommended_places', movies: 'recommended_movies', books: 'recommended_books', games: 'recommended_games',
  apps: 'recommended_apps', products: 'recommended_products', people: 'recommended_people', guides: 'guide_sections',
};
type RequestRecord = { name: string; variables: Record<string, any>; owner: boolean };
export type FixtureFault = {
  kind?: 'error' | 'partial' | 'lost' | 'expired' | 'offline';
  status?: number;
  gate?: Promise<void>;
  data?: Record<string, unknown>;
  nullRootPage?: boolean;
};
export function fixtureState(extra: Record<string, unknown> = {}, mode: 'private' | 'unlisted' | 'public' = 'private') {
  const account: Record<string, any> = {
    __typename: 'Account', documentId: 'browser-account', username: fixtureUser.username,
    Account_Name: 'Fixture Explorer', Account_Type: 'Personal', mobile_number: '+15555550123',
    Addresss: null, Primary_Address: { address: 'Fixture City' }, Public_Profile_Address: 'Fixture City',
    Bio: 'Contained browser publication fixture', Feed_Data: [], social_media: {
      theme_settings: { preset: 'minimal-light', wallpaperMode: 'solid-color', landingTab: 'profile',
        visibleTabs: { recommendations: true, gallery: false, business: false }, footerBranding: 'disabled' },
    }, profile_picture: null, bg_picture: null, mobile_number_visibility: false, recommendation_lists: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    public_profile: 'Yes', public_music: 'No', ...Object.fromEntries(categories.map(c => [c.field, 'Yes'])),
    pinned_nav_tabs: ['public_profile', 'public_books'], auto_pinning: false, ...extra,
  };
  const lists = Object.fromEntries(categories.map(c => [c.root, [{
    __typename: c.root === 'guides' ? 'Guide' : `${c.route[0].toUpperCase()}${c.route.slice(1, -1)}List`,
    documentId: `${c.route}-list`, List_Name: `Public ${c.route}`, Title: `Public ${c.route}`,
    slug: `public-${c.route}`, Visibility: true, visibility: true, createdAt: '2026-01-01T00:00:00.000Z',
    account: { __typename: 'Account', documentId: account.documentId, username: fixtureUser.username },
    updatedAt: '2026-01-01T00:00:00.000Z', List_Name_Details: {}, Description: null,
    recommended_places: [], recommended_books: [], recommended_movies: [], recommended_games: [], recommended_apps: [], recommended_products: [], recommended_people: [],
    guide_sections: [], Guide_Media: [], Guide_Tags: [], Number_Of_Days: 1,
  }]])) as Record<string, Record<string, any>[]>;
  return {
    account, lists, mode, revision: 1, canonicalAccountRevision: 1, identityReady: true, ownerWorkspace: true,
    alternateAccounts: new Map<string, Record<string, any>>(),
    guestControls: { allowSongRequests: false, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: false, allowQueueVisibility: true },
    playlists: [{ id: 1, name: 'Private owner playlist', description: null, isVisibleToGuests: false, songs: [] }],
    publicResource: {
      version: 'music-public-resource/v1', revision: 1,
      user: { username: fixtureUser.username, venueName: 'Fixture Venue' },
      permissions: { allowSongRequests: false, allowGuestPlayOnDevice: false, allowPlaylistSharing: true, allowRecentlyPlayedVisibility: false, allowQueueVisibility: true },
      currentlyPlaying: null,
      queue: { items: [], total: 0, truncated: false },
      recentlyPlayed: { items: [], total: 0, truncated: false },
      playlists: { items: [], total: 0, truncated: false },
    },
    writes: [] as RequestRecord[], reads: [] as RequestRecord[], faults: new Map<string, FixtureFault[]>(),
    destinationGates: new Map<string, Promise<void>>(), destinationWaits: [] as string[],
    apiCalls: [] as { path: string; method: string; body?: any; key?: string; authenticated: boolean }[],
    replay: new Map<string, { mode: string; body: unknown }>(), sockets: new Set<(revision: number) => void>(),
  };
}
export type FixtureState = ReturnType<typeof fixtureState>;
export function canonicalCategoryAccount(state:FixtureState) {
  return accountDtoSchema.parse(canonicalAccountFixture({handle:state.account.username,displayName:state.account.Account_Name,
    accountType:state.account.Account_Type,mobileNumber:state.account.mobile_number,
    onboardingStatus:state.account.Account_Name&&state.account.Account_Type&&state.account.mobile_number?'complete':'incomplete',
    publicProfile:state.account.public_profile==='Yes',autoPinning:state.account.auto_pinning,revision:state.canonicalAccountRevision,
    categories:[...categories.map((category,displayOrder)=>({category:category.route,isPublic:state.account[category.field]==='Yes',displayOrder,
      pinnedOrder:state.account.pinned_nav_tabs.includes(category.field)?state.account.pinned_nav_tabs.indexOf(category.field):null})),
      {category:'music',isPublic:state.account.public_music==='Yes',displayOrder:8,pinnedOrder:state.account.pinned_nav_tabs.includes('public_music')?state.account.pinned_nav_tabs.indexOf('public_music'):null}],
  }));
}

function canonical(source: string) { return print(visit(parse(source), { Field(node) { return node.name.value === '__typename' ? null : undefined; } })); }
// Read only checked-in frontend source, never .env or the mixed live fixture.
const documents = new Set<string>();
function register(directory: string) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    if (item.isDirectory() && item.name !== '__tests__') register(resolve(directory, item.name));
    else if (item.isFile() && /\.tsx?$/.test(item.name) && !/\.test\./.test(item.name)) {
      for (const match of readFileSync(resolve(directory, item.name), 'utf8').matchAll(/gql`([\s\S]*?)`/g)) {
        try { documents.add(canonical(match[1])); } catch { /* Interpolated documents require explicit fixture support. */ }
      }
    }
  }
}
register(resolve(process.cwd(), 'src'));
function project(selection: SelectionSetNode, value: any): any {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(item => project(selection, item));
  return Object.fromEntries(selection.selections.filter(s => s.kind === Kind.FIELD).map(s => {
    const next = value?.[s.name.value] ?? null;
    return [s.alias?.value ?? s.name.value, s.selectionSet && next !== null ? project(s.selectionSet, next) : next];
  }));
}
const placesProjection = parse(`query PublicPlacesFixture { recommendationLists {
  documentId List_Name slug Visibility is_pinned pin_order List_Name_Details
  recommended_places { documentId Place_Details Recommendation_Type Contact_Name
    Places_Social_Link Users_Social_URL user_recommendation_note user_rating google_rating
    media_details Media { url alternativeText } recommendation_category { Category_Name }
  }
} }`).definitions[0];
const placesSelection = placesProjection.kind === Kind.OPERATION_DEFINITION
  && placesProjection.selectionSet.selections[0].kind === Kind.FIELD
  ? placesProjection.selectionSet.selections[0].selectionSet! : undefined!;
export function invalidateGuests(state: FixtureState) { for (const send of state.sockets) send(state.revision); }

export async function installContainedRoutes(context: BrowserContext, origin: string, state: FixtureState) {
  const errors: string[] = [];
  const booksOwnerFixture = createBooksOwnerFixture(() => state.lists.bookLists, state.account.documentId);
  const booksCommands = new Map<string, { body: string; result: unknown }>();
  const denied: string[] = [];
  const vendors: string[] = [];
  const expectedHttpErrors = new Map<string, number>();
  const expectedOffline = new Set<string>();
  const observedHttpErrors: string[] = [];
  const attach = (page: Page) => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const status = expectedHttpErrors.get(message.location().url);
      if (expectedOffline.has(message.location().url) && message.text() === 'Failed to load resource: net::ERR_INTERNET_DISCONNECTED') observedHttpErrors.push(`offline ${new URL(message.location().url).pathname}`);
      else if (status && message.text() === `Failed to load resource: the server responded with a status of ${status} (${status === 401 ? 'Unauthorized' : status === 404 ? 'Not Found' : status === 429 ? 'Too Many Requests' : status === 409 ? 'Conflict' : 'Service Unavailable'})`) observedHttpErrors.push(`${status} ${new URL(message.location().url).pathname}`);
      else errors.push(message.text());
    });
  };
  context.pages().forEach(attach); context.on('page', attach);
  await context.routeWebSocket(/.*/, socket => {
    const url = new URL(socket.url());
    if (url.host === new URL(origin).host && url.pathname === '/' && url.searchParams.has('token')) { socket.send('{"type":"connected"}'); return; }
    if (url.host !== new URL(origin).host || url.pathname !== '/__localtunes/ws/' || url.searchParams.get('EIO') !== '4' || url.searchParams.get('transport') !== 'websocket') {
      denied.push('unexpected websocket'); socket.close(); return;
    }
    // Contained Engine.IO/Socket.IO boundary. No connectToServer / real socket.
    socket.send('0' + JSON.stringify({ sid: 'fixture-engine', upgrades: [], pingInterval: 600000, pingTimeout: 600000, maxPayload: 1000000 }));
    const send = (revision: number) => socket.send('42' + JSON.stringify(['music_public_change', { version: 'music-public-change/v1', kind: 'publication_changed', revision }]));
    socket.onMessage(raw => {
      const message = String(raw);
      if (message.startsWith('40')) { socket.send('40{"sid":"fixture-socket"}'); state.sockets.add(send); }
      else if (message === '2') socket.send('3');
    });
    socket.onClose(() => state.sockets.delete(send));
  });
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    const isContainedMusicAuthority = url.origin === 'https://localtunes.test';
    // Canonical authentication follows the cookie actually sent by this request.
    // Playwright's abbreviated headers() collection can omit Cookie.
    const hasOwnerSession = async () => ((await request.headerValue('cookie')) ?? '')
      .split(';').some(cookie => cookie.trim() === `${sessionCookie}=${sessionValue}`);
    if(url.origin===origin&&url.pathname==='/api/explorers/v1/account'&&url.search===''&&request.method()==='PATCH') {
      const reply=(body:unknown,status=200)=>{if(status>=400)expectedHttpErrors.set(request.url(),status);return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});};
      const fail=(code:string,status:number)=>reply({error:{code,message:'Contained Books account command rejected',requestId:'books-fixture'}},status);
      if(!await hasOwnerSession())return fail('UNAUTHENTICATED',401);
      const parsed=updateAccountRequestSchema.safeParse(request.postDataJSON());
      const observed=canonicalCategoryAccount(state);
      if(parsed.success&&parsed.data.expectedRevision!==observed.revision)return fail('CONFLICT',409);
      if(!parsed.success||Object.keys(parsed.data).sort().join(',')!=='categories,expectedRevision'||!parsed.data.categories||parsed.data.categories.length!==observed.categories.length
        ||new Set(parsed.data.categories.map(c=>c.category)).size!==observed.categories.length
        ||parsed.data.categories.some(c=>{const previous=observed.categories.find(p=>p.category===c.category);return !previous||c.displayOrder!==previous.displayOrder||c.category!=='books'&&(c.isPublic!==previous.isPublic||c.pinnedOrder!==previous.pinnedOrder);})) {
        denied.push('Books account command shape');return fail('INVALID_INPUT',422);
      }
      const books=parsed.data.categories.find(c=>c.category==='books')!;
      state.account.public_books=books.isPublic?'Yes':'No';
      state.account.pinned_nav_tabs=state.account.pinned_nav_tabs.filter((field:string)=>field!=='public_books');
      if(books.pinnedOrder!==null)state.account.pinned_nav_tabs.splice(books.pinnedOrder,0,'public_books');
      state.canonicalAccountRevision++;
      state.writes.push({name:'PATCH /api/explorers/v1/account',variables:parsed.data,owner:true});
      return reply({account:canonicalCategoryAccount(state)});
    }
    const bookCollectionCommand = url.pathname.match(/^\/api\/explorers\/v1\/collections\/([0-9a-f-]{36})$/);
    if (url.origin === origin && bookCollectionCommand && url.search === '' && ['PATCH','DELETE'].includes(request.method())) {
      const reply = (body:unknown,status=200) => {
        if (status >= 400) expectedHttpErrors.set(request.url(),status);
        return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
      };
      const fail = (code:string,status:number) => reply({error:{code,message:'Contained Books command rejected',requestId:'books-fixture'}},status);
      if (!await hasOwnerSession()) return fail('UNAUTHENTICATED',401);
      const key = await request.headerValue('idempotency-key');
      const body = request.postDataJSON();
      const parsed = (request.method()==='PATCH'?updateCollectionSchema:contentRevisionSchema).safeParse(body);
      if (!parsed.success || !commandKeySchema.safeParse(key).success || Object.keys(body).some(field=>!['expectedRevision','title','description','heading','visibility','publicationState'].includes(field))) { denied.push('Books collection command shape'); return fail('INVALID_INPUT',422); }
      const replayKey = `${request.method()}:${bookCollectionCommand[1]}:${key}`, serialized = JSON.stringify(body);
      const previous = booksCommands.get(replayKey);
      if (previous) return previous.body === serialized ? reply(previous.result) : fail('CONFLICT',409);
      const list = state.lists.bookLists.find(list => bookFixtureId('collection',list.documentId) === bookCollectionCommand[1]);
      if (!list) return fail('NOT_FOUND',404);
      if (list.account?.documentId !== state.account.documentId) return fail('FORBIDDEN',403);
      if (body.expectedRevision !== (list.canonicalRevision ?? 1)) return fail('CONFLICT',409);
      const fault = state.faults.get(url.pathname)?.shift(); if(fault?.gate) await fault.gate;
      if (!state.lists.bookLists.includes(list) || body.expectedRevision !== (list.canonicalRevision ?? 1)) return fail('CONFLICT',409);
      if(fault?.kind==='error') return fail('PROVIDER_UNAVAILABLE',fault.status??503);
      state.writes.push({name:`${request.method()} ${url.pathname}`,variables:body,owner:true});
      let result:unknown;
      if(request.method()==='DELETE') {
        state.lists.bookLists=state.lists.bookLists.filter(candidate=>candidate!==list);
        result={collection:{id:bookCollectionCommand[1],archived:true}};
      } else {
        if(body.title!==undefined) list.List_Name=body.title;
        if(body.description!==undefined) list.list_description=body.description;
        if(body.heading!==undefined) list.top_reads_heading=body.heading;
        if(body.visibility!==undefined) list.visibility=body.visibility==='public';
        if(body.publicationState!==undefined) { list.Visibility=body.publicationState==='published'; list.canonicalPublicationState=body.publicationState; }
        list.canonicalRevision=(list.canonicalRevision??1)+1;
        result={collection:collectionCoreDtoSchema.parse({id:bookCollectionCommand[1],accountId:canonicalAccountFixture().id,category:'books',title:list.List_Name,slug:list.slug,
          visibility:list.visibility?'public':'private',publicationState:list.Visibility?'published':'draft',revision:list.canonicalRevision,
          description:list.list_description??null,heading:list.top_reads_heading??null,coverMediaId:null})};
      }
      booksCommands.set(replayKey,{body:serialized,result});
      return fault?.kind==='lost' ? fail('PROVIDER_UNAVAILABLE',503) : reply(result);
    }
    if (url.origin === origin && request.method() === 'GET') {
      const booksResponse = booksOwnerFixture(url);
      if (booksResponse) {
        const authenticated = await hasOwnerSession();
        state.apiCalls.push({ path: url.pathname, method: 'GET', authenticated });
        const fault = state.faults.get(url.pathname)?.shift();
        if (fault?.gate) await fault.gate;
        const status = authenticated ? fault?.kind === 'error' ? fault.status ?? 503 : booksResponse.status : 401;
        if (authenticated && fault?.kind === 'offline') { expectedOffline.add(request.url()); return route.abort('internetdisconnected'); }
        if (status >= 400) expectedHttpErrors.set(request.url(), status);
        return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 401
          ? { error: { code: 'UNAUTHENTICATED', message: 'Fixture session is required', requestId: 'books-fixture' } }
          : fault?.kind === 'error' ? { error: { code: 'PROVIDER_UNAVAILABLE', message: 'Contained Books failure', requestId: 'books-fixture' } }
          : fault?.kind === 'partial' ? fault.data ?? {} : booksResponse.body) });
      }
    }
    if (url.origin === origin && url.pathname === '/api/auth/get-session' && url.search === '' && request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
        await hasOwnerSession() ? { user: { id: fixtureUser.id, email: fixtureUser.email }, session: { id: sessionId } } : null,
      ) });
    }
    if (url.origin === origin && url.pathname === '/api/explorers/v1/me' && request.method() === 'GET') {
      if (!await hasOwnerSession()) {
        expectedHttpErrors.set(request.url(), 401);
        return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: {
          code: 'UNAUTHENTICATED', message: 'Fixture session is required', requestId: 'category-fixture-account-read',
        } }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account: canonicalCategoryAccount(state) }) });
    }
    if (url.origin === origin && url.pathname === '/api/explorers/v1/account/lifecycle' && url.search === '' && request.method() === 'GET') {
      if (!await hasOwnerSession()) {
        expectedHttpErrors.set(request.url(), 401);
        return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lifecycle: {
        accountId: canonicalAccountFixture().id, status: 'active', operationId: null, revision: canonicalAccountFixture().revision,
      } }) });
    }
    const waitForDestination = async () => {
      const pending = state.destinationGates.entries().next().value as [string, Promise<void>] | undefined;
      if (!pending) return;
      const [destinationPath, gate] = pending;
      if (!state.destinationWaits.includes(destinationPath)) state.destinationWaits.push(destinationPath);
      await gate;
    };
    if (url.origin !== origin) {
      if ((url.origin === 'https://music-fixture.test' || isContainedMusicAuthority) && url.pathname.startsWith('/api/explorers/v1/profiles/')) {
        await waitForDestination();
        if (request.method() !== 'GET' || request.headers().authorization) {
          return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ version: 'explorers-public-error/v1', error: { code: 'NOT_FOUND' } }) });
        }
        const profilePrefix = '/api/explorers/v1/profiles/';
        const requestedUsername = decodeURIComponent(url.pathname.slice(profilePrefix.length).split('/')[0]).trim().toLowerCase();
        const selectedAccount = requestedUsername === fixtureUser.username.toLowerCase()
          ? state.account
          : state.alternateAccounts.get(requestedUsername);
        const prefix = `${profilePrefix}${encodeURIComponent(requestedUsername)}`;
        if (!selectedAccount || !(url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) {
          expectedHttpErrors.set(request.url(), 404);
          return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ version: 'explorers-public-error/v1', error: { code: 'NOT_FOUND' } }) });
        }
        if (url.pathname === prefix) {
          const name = 'PublicProfileData';
          state.reads.push({ name, variables: { username: requestedUsername }, owner: false });
          const fault = state.faults.get(name)?.shift(); if (fault?.gate) await fault.gate;
          if (fault?.kind === 'offline') { expectedOffline.add(request.url()); return route.abort('internetdisconnected'); }
          if (fault?.kind === 'error') { const status = fault.status ?? 503; expectedHttpErrors.set(request.url(), status); return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UPSTREAM_UNAVAILABLE' } }) }); }
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fault?.kind === 'partial' ? { ...selectedAccount, Bio: null } : selectedAccount) });
        }
        const match = url.pathname.match(new RegExp(`^${prefix}/recommendations/([a-z]+)(?:/([A-Za-z0-9_-]+))?$`));
        const category = match && categories.find((candidate) => candidate.route === match[1]);
        if (!category) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ version: 'explorers-public-error/v1', error: { code: 'NOT_FOUND' } }) });
        const name = match?.[2] ? 'AppListBySlug' : category.route === 'apps' ? 'PublicAppData' : `Public${category.route[0].toUpperCase()}${category.route.slice(1)}Data`;
        state.reads.push({ name, variables: { username: requestedUsername, category: category.route, limit: Number(url.searchParams.get('limit') ?? 12), cursor: url.searchParams.get('cursor') }, owner: false });
        const fault = state.faults.get(name)?.shift(); if (fault?.gate) await fault.gate;
        if (fault?.kind === 'offline') { expectedOffline.add(request.url()); return route.abort('internetdisconnected'); }
        if (fault?.kind === 'error') { const status = fault.status ?? 503; expectedHttpErrors.set(request.url(), status); return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UPSTREAM_UNAVAILABLE' } }) }); }
        const publicLists = state.lists[category.root].filter((list) => list.Visibility === true && list.visibility === true);
        const limit = Number(url.searchParams.get('limit') ?? 12);
        const cursor = url.searchParams.get('cursor');
        const offset = cursor && /^o(?:0|[1-9][0-9]{0,4})$/.test(cursor) ? Number(cursor.slice(1)) : 0;
        const relation = recommendationRelationByRoute[category.route];
        const pageList = (list: Record<string, unknown>) => ({
          ...(category.route === 'places' ? project(placesSelection, list) : list),
          ...(match[2] && relation && Array.isArray(list[relation])
            ? { [relation]: (category.route === 'places' ? project(placesSelection, list)[relation] : list[relation]).slice(offset, offset + limit) }
            : Array.isArray(list[relation])
              ? { [relation]: (category.route === 'places' ? project(placesSelection, list)[relation] : list[relation]).slice(0, category.route === 'places' ? 24 : 12) }
              : {}),
        });
        const body = match[2]
          ? { [category.root]: publicLists.filter((list) => list.slug === match[2] || category.route === 'guides' && list.documentId === match[2]).map(pageList) }
          : { [category.root]: publicLists.slice(offset, offset + limit).map(pageList) };
        const partialBody = fault?.kind === 'partial' && !match?.[2]
          ? { ...body, [category.root]: fault.nullRootPage ? (body[category.root] as unknown[]).map(() => null) : [...(body[category.root] as unknown[]), null] }
          : body;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(partialBody) });
      }
      // Media transport is inert: permission/control rendering only, no playback proof.
      if (url.origin === 'https://www.youtube.com' && url.pathname === '/iframe_api') return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      if (url.origin === 'https://www.youtube.com' && /^\/embed\/(?:abcdefghijk|lmnopqrstuv)$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Inert media fixture</title>' });
      const flag = url.origin === 'https://flagcdn.com' && /^\/w40\/(?:in|us|gb|jp|fr|au|br|ae|sg|de)\.png$/.test(url.pathname);
      const avatar = url.origin === 'https://images.unsplash.com' && [
        'photo-1494790108377-be9c29b29330', 'photo-1507003211169-0a1dd7228f2d', 'photo-1506794778202-cad84cf45f1d',
        'photo-1438761681033-6461ffad8d80', 'photo-1472099645785-5658abf4ff4e', 'photo-1534528741775-53994a69daeb',
        'photo-1531403009284-440f080d1e12', 'photo-1512820790803-83ca734da794', 'photo-1488646953014-85cb44e25828',
        'photo-1493976040374-85c8e12f0c0e', 'photo-1505740420928-5e560c06d30e', 'photo-1489599849927-2ee91cede3ba',
      ].includes(url.pathname.slice(1));
      const texture = url.origin === 'https://www.transparenttextures.com' && ['/patterns/stardust.png', '/patterns/carbon-fibre.png'].includes(url.pathname);
      if (flag || avatar || texture) return route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') });
      if (url.origin === 'https://music-fixture.test' && /^\/api\/explorers\/analytics\/(events|session)$/.test(url.pathname) && request.method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: '{"accepted":true}' });
      if (url.origin === 'https://music-fixture.test' && url.pathname === '/api/explorers/analytics/events' && request.method() === 'GET' && request.headers().authorization === `Bearer ${token}` && url.searchParams.get('accountId') === state.account.documentId) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"events":[]}' });
      if (url.origin === 'https://placehold.co' && url.pathname === '/400x400') return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"/>' });
      if (url.origin === 'https://zupimages.net' && ['/up/19/34/4820.gif', '/up/19/34/6vlb.gif'].includes(url.pathname)) return route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64') });
      if (url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      if ((url.origin === 'https://www.googletagmanager.com' && url.pathname === '/gtag/js') || (url.origin === 'https://www.clarity.ms' && url.pathname.startsWith('/tag/'))) {
        vendors.push(url.origin); return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
      }
      // The PR-safe runtime deliberately configures this inert Music authority.
      // Its remaining API paths fall through to the same contained handlers as
      // the development proxy; every other external origin remains denied.
      if (!isContainedMusicAuthority) {
        denied.push(`${request.method()} external ${url.hostname}`); return route.abort('blockedbyclient');
      }
    }
    if (url.pathname === '/logo.svg') return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => {
      if (status >= 400) expectedHttpErrors.set(request.url(), status);
      return route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    };
    // The contained legacy GraphQL adapter maps the fixture's verified session
    // to its Strapi subject without giving the browser a JWT or forwarding a
    // canonical credential to GraphQL. It remains test-only and exact-origin.
    const owner = request.headers().authorization === `Bearer ${token}`
      || url.origin === origin && url.pathname === '/graphql' && (await context.cookies(origin))
        .some(cookie => cookie.name === sessionCookie && cookie.value === sessionValue);
    if (url.pathname === '/graphql' && request.method() === 'POST') {
      await waitForDestination();
      const body = request.postDataJSON();
      try {
        if (!documents.has(canonical(body.query))) throw new Error('unregistered document');
        const definition = parse(body.query).definitions[0];
        if (definition.kind !== Kind.OPERATION_DEFINITION || !definition.name || definition.name.value !== body.operationName) throw new Error('invalid operation');
        const name = definition.name.value; const variables = body.variables ?? {};
        const record = { name, variables, owner };
        const mutation = definition.operation === 'mutation';
        if (mutation) state.writes.push(record); else state.reads.push(record);
        const fault = state.faults.get(name)?.shift(); if (fault?.gate) await fault.gate;
        if (fault?.kind === 'offline') { expectedOffline.add(request.url()); return route.abort('internetdisconnected'); }
        if (fault?.kind === 'error') return json({ errors: [{ message: 'Contained fixture failure' }] });
        if (mutation) {
          if (owner && ['UpdateBookList', 'DeleteBookList'].includes(name)) {
            const list = state.lists.bookLists.find(list => list.documentId === variables.documentId);
            if (!list) throw new Error('unknown fixture book list');
            if (name === 'UpdateBookList') {
              if (Object.keys(variables).sort().join(',') !== 'documentId,visibility' || typeof variables.visibility !== 'boolean') throw new Error('unexpected list mutation');
              list.visibility = variables.visibility;
              return json({ data: project(definition.selectionSet, { updateBookList: list }) });
            }
            if (Object.keys(variables).join(',') !== 'documentId') throw new Error('unexpected delete mutation');
            state.lists.bookLists = state.lists.bookLists.filter(candidate => candidate !== list);
            return json({ data: project(definition.selectionSet, { deleteBookList: { documentId: variables.documentId } }) });
          }
          const fields = Object.keys(variables.data ?? {});
          if (!owner || name !== 'UpdateTabVisibility' || variables.documentId !== state.account.documentId || fields.length === 0 || fields.some(field => !['public_profile', 'public_music', 'pinned_nav_tabs', 'auto_pinning', ...categories.map(c => c.field)].includes(field))) throw new Error('unexpected mutation');
          Object.assign(state.account, structuredClone(variables.data));
          if (fault?.kind === 'lost') return json({ errors: [{ message: 'Contained lost acknowledgement' }] });
          return json({ data: project(definition.selectionSet, { updateAccount: state.account }) });
        }
        const roots = definition.selectionSet.selections.filter(s => s.kind === Kind.FIELD).map(s => s.name.value);
        if (roots.includes('usersPermissionsUser') && (!owner || variables.documentId !== fixtureUser.documentId)) throw new Error('wrong owner subject');
        const knownAccountDocumentIds = new Set([state.account.documentId, ...[...state.alternateAccounts.values()].map(account => account.documentId)]);
        if (variables.accountDocumentId && !knownAccountDocumentIds.has(variables.accountDocumentId)) throw new Error('wrong account subject');
        const user = { __typename: 'UsersPermissionsUser', ...fixtureUser, provider: 'local', confirmed: true, blocked: false, accounts: [state.account], razorpay_customer_id: null };
        const username = variables.username ?? variables.filters?.username?.eq;
        const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : username;
        const selectedAccount = normalizedUsername === undefined || normalizedUsername === fixtureUser.username.toLowerCase()
          ? state.account
          : state.alternateAccounts.get(normalizedUsername);
        const selectedUser = selectedAccount ? { ...user, accounts: [selectedAccount] } : undefined;
        const data: Record<string, any> = { usersPermissionsUser: user, usersPermissionsUsers: selectedUser ? [selectedUser] : [], accounts: selectedAccount ? [selectedAccount] : [], faqs: [] };
        for (const root of roots) {
          if (root in state.lists) data[root] = state.lists[root].filter(list => (owner && !['CheckPublishedLists', 'PublicCategoryListCounts'].includes(name) || list.Visibility === true && list.visibility === true) && (!variables.bookListDocumentId || list.documentId === variables.bookListDocumentId) && (!variables.slug || list.slug === variables.slug));
          else if (root === 'guide') data.guide = state.lists.guides.find(guide => guide.documentId === variables.documentId) ?? null;
          else if (!(root in data) && /Categories$|^recommended|^pinned/.test(root)) data[root] = [];
          else if (!(root in data)) throw new Error(`unsupported root ${root}`);
        }
        const projected = project(definition.selectionSet, fault?.data ? { ...data, ...structuredClone(fault.data) } : data);
        return json(fault?.kind === 'partial'
          ? { data: projected, errors: [{ message: 'Contained partial fixture failure' }] }
          : { data: projected });
      } catch (error) { denied.push(`graphql ${body.operationName}: ${String(error)}`); return json({ errors: [{ message: 'Fixture operation denied' }] }); }
    }
    const path = url.pathname.replace(/^\/__localtunes/, '');
    if (path.startsWith('/api/')) {
      await waitForDestination();
      state.apiCalls.push({ path, method: request.method(), key: request.headers()['idempotency-key'], authenticated: !!request.headers().authorization,
        ...(path === '/api/music/publication' ? { body: request.postDataJSON() } : {}) });
      const fault = state.faults.get(path)?.shift(); if (fault?.gate) await fault.gate;
      if (fault?.kind === 'error') return json({ version: 'music-error/v1', error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Contained fixture failure', action: 'retry', retryable: true, requestId: 'fixture-failure' } }, fault.status ?? 503, { 'retry-after': '1' });
      if (path === '/api/music/identity/ensure' && request.method() === 'POST' && owner) return json({ version: 'music-identity/v1', identity: { musicUserId: 41, status: 'active' }, credential: { token: credential, expiresAt: Date.now() + 600000 } });
      if (path === '/api/music/identity/lifecycle/status' && owner) return json({ error: { code: 'LIFECYCLE_NOT_FOUND', message: 'No fixture deletion' } }, 404);
      const musicOwner = request.headers().authorization === `Bearer ${credential}`;
      if (path === '/api/music/dashboard' && musicOwner) return json({ queueRevision: 0, songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode: state.mode, publicSlug }, guestControls: state.guestControls });
      if (path === '/api/playlists' && request.method() === 'GET' && musicOwner) return json(state.playlists);
      if (path === '/api/music/entitlement' && musicOwner) return json({ state: 'included', coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 });
      if (path === '/api/music/features' && musicOwner) return json({ ownerWorkspace: state.ownerWorkspace, guestWorkspace: false, playlistImports: false, exposureId: 'fixture-browser', expiresAt: new Date(Date.now() + 600000).toISOString() });
      if (path === '/api/music/publication' && request.method() === 'POST' && musicOwner) {
        const body = request.postDataJSON(); const key = request.headers()['idempotency-key'];
        state.writes.push({ name: path, owner: true, variables: { body, key } });
        if (!key || !['private', 'public', 'unlisted'].includes(body.mode) || Object.keys(body).join(',') !== 'mode') { denied.push('publication shape'); return json({}, 400); }
        if (fault?.kind === 'expired') return json({ version: 'music-error/v1', error: { code: 'PUBLICATION_REPLAY_EXPIRED', message: 'Fixture replay expired', retryable: false, action: 'refresh', requestId: 'fixture-expired' } }, 409);
        const previous = state.replay.get(key);
        if (previous) return json(previous.body);
        state.mode = body.mode; state.revision++;
        const result = { version: 'music-publication/v1', publication: { mode: state.mode, publicSlug }, ...(state.mode === 'unlisted' ? { capability: 'x'.repeat(43) } : {}) };
        state.replay.set(key, { mode: body.mode, body: result });
        if (fault?.kind === 'lost') return json({ version: 'music-error/v1', error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Contained lost response', retryable: true, requestId: 'fixture-lost' } }, 503);
        return json(result);
      }
      if (path === `/api/music/public-profile/${state.account.documentId}`) return state.mode === 'public'
        ? json({ version: 'music-public-descriptor/v1', publication: { mode: 'public', publicSlug, revision: state.revision } }) : json({}, 404);
      if (path.startsWith('/api/music/public-resource/v1/')) {
        if (path !== `/api/music/public-resource/v1/${publicSlug}` || !(state.mode === 'public' || state.mode === 'unlisted' && request.headers()['x-music-guest-capability'] === 'x'.repeat(43))) return json({}, 404);
        return json({ ...structuredClone(state.publicResource), revision: state.revision, permissions: state.guestControls });
      }
      if (/^\/api\/explorers\/analytics\//.test(path) && request.method() === 'POST') return json({ accepted: true }, 201);
    }
    if (isContainedMusicAuthority) {
      denied.push(`${request.method()} external ${url.hostname}${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    if (request.method() === 'GET' && (request.resourceType() === 'document' || url.pathname === '/e2e/setup/maps-fixture.tsx' || /^\/(?:src|node_modules|images|assets|landing|@vite|@id|@fs)\//.test(url.pathname) || /^\/(?:@react-refresh|explorers\.svg|eoe-icon\.svg|eoe-full\.svg|favicon\.ico)$/.test(url.pathname))) return route.continue();
    denied.push(`${request.method()} ${url.pathname}`); return route.abort('blockedbyclient');
  });
  return { errors, denied, vendors, observedHttpErrors, assertClean() { expect(denied).toEqual([]); expect(errors).toEqual([]); } };
}

export async function openFixture(browser: Browser, origin: string, state: FixtureState, options: {
  owner?: boolean;
  width?: number;
  height?: number;
  theme?: string;
  touch?: boolean;
  reducedMotion?: 'reduce' | 'no-preference';
  safeArea?: { top?: number; right?: number; bottom?: number; left?: number };
} = {}) {
  const entries: { name: string; value: string }[] = [];
  if (options.theme) entries.push({ name: 'dashboard-theme', value: options.theme });
  const context = await browser.newContext({ baseURL: origin, serviceWorkers: 'block', hasTouch: options.touch ?? false, reducedMotion: options.reducedMotion, viewport: { width: options.width ?? 1280, height: options.height ?? 900 },
    storageState: { cookies: options.owner ? [{ name: sessionCookie, value: sessionValue, domain: new URL(origin).hostname, path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' }] : [], origins: [{ origin, localStorage: entries }] },
  });
  if (options.safeArea) await context.addInitScript((safeArea) => {
    const values = {
      top: `${safeArea.top ?? 0}px`, right: `${safeArea.right ?? 0}px`,
      bottom: `${safeArea.bottom ?? 0}px`, left: `${safeArea.left ?? 0}px`,
    };
    const installShellOverride = () => {
      const root = document.documentElement;
      if (!root) return;
      root.style.setProperty('--public-safe-top', values.top);
      root.style.setProperty('--public-safe-right', values.right);
      root.style.setProperty('--public-safe-bottom', values.bottom);
      root.style.setProperty('--public-safe-left', values.left);
      const style = document.createElement('style');
      style.dataset.task7SafeArea = 'true';
      style.textContent = `:is([data-public-profile-chrome], [data-testid="public-profile-theme-root"]) { --public-safe-top: ${values.top} !important; --public-safe-right: ${values.right} !important; --public-safe-bottom: ${values.bottom} !important; --public-safe-left: ${values.left} !important; }`;
      (document.head || document.documentElement).append(style);
    };
    if (document.readyState === 'loading') addEventListener('DOMContentLoaded', installShellOverride, { once: true });
    else installShellOverride();
  }, options.safeArea);
  const guard = await installContainedRoutes(context, origin, state);
  context.setDefaultTimeout(12000);
  return { context, page: await context.newPage(), guard };
}

export async function settings(page: Page, pins = false) {
  await page.goto(pins ? '/settings#public-navigation' : '/settings');
  await page.getByRole('button', { name: /Public Visibility/ }).waitFor();
  if (await page.getByRole('checkbox', { name: 'Books Tab', exact: true }).count() === 0) await page.getByRole('button', { name: /Public Visibility/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Books Tab', exact: true })).toBeEnabled();
}
export async function toggle(control: Locator, checked: boolean) {
  await expect(control).toBeEnabled();
  if (await control.isChecked() !== checked) { await control.focus(); await control.press('Space'); }
  await expect(control).toBeChecked({ checked });
}
export async function closeFixture(handle: Awaited<ReturnType<typeof openFixture>>) {
  try {
    await test.info().attach('fixture-boundary', { contentType: 'application/json', body: JSON.stringify({ denied: handle.guard.denied, unexpectedConsole: handle.guard.errors, expectedHttp: handle.guard.observedHttpErrors, vendorAttempts: handle.guard.vendors }) });
    handle.guard.assertClean();
  } finally { await handle.context.close(); }
}
