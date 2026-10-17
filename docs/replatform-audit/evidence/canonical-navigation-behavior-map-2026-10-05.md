# Canonical navigation behavior mapping — 2026-10-05

Preparation baseline HEAD2724ddb. This inventory is written before Task4 fixture edits. Every assertion location remains required; rows grouped under each original spec title enumerate the assertion expressions. Template titles retain their checked-in parameter matrices without collapsing cases. No positive publication assertion is replaced by unavailable, removed or skipped.

Contracts: navigation account read GET /api/explorers/v1/me with cookie session; write PATCH /api/explorers/v1/account with expectedRevision and complete nine category rows (or autoPinning only). Auth user ID and canonical account UUID are distinct. Native eligibility reads complete active owner collections books/movies/games and counts public AND published. Strict cookie membership denial, revision 409, stale generations and no automatic retries are mandatory. Legacy navigation GraphQL must be rejected. All-nine preference read/safe cleanup remains required.

Producer prerequisites: successful Places/Guides/Apps/Products/People publication/new pins require their delivered complete owner publication producers (Epic2.4/7.1 and category tickets). Full Music positive/public visitor/recovery matrices require Epic6.1/6.3 canonical principal/public integration. Stored preference and guard checks alone do not deliver those producers; affected cases remain blocked/failing.

## category-navigation-a.spec.ts

### `Task 6 contained content-state matrix ${viewport.width}x${viewport.height}`

Canonical equivalent / retained invariant: Retain the Apps warm-cache pending refresh, complete empty response, cold terminal error, explicit Retry recovery and usable partial warning at both viewports. Every sampled shell remains nonblank with the asserted banner/navigation/Earth-loading counts; terminal and partial notices retain 4.5 contrast. Invalid username removes stale Apps content; hidden Products falls back to profile; missing nested Apps list remains not-published. Places map deliberately omits navigation while retaining its fallback/banner; the two Music destination checks retain typed public availability, without turning the Apps matrix into Music publication/replay qualification.

Exact fixture contract change: Canonical cookie get-session and GET /me replace owner navigation authority; native complete owner collections only establish Books/Movies/Games eligibility. Preserve PublicAppData gate/error/partial fixtures, PublicProfileData/Account optional-public faults, routing identities and Places map exceptions. Music destination responses retain their actual public protocol. Apps/public producer successes and Music destination success remain required on their corresponding future producers.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 22 | await expect(warm.page.getByText('Public apps', { exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 24 | await expect(warm.page.getByRole('heading', { name: 'Music', level: 1 })).toBeVisible(); → Retain exact assertion semantics. |
| 31 | await expect(warm.page.getByText('Public apps', { exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 32 | await expect(warm.page.locator('[aria-busy="true"]').first()).toBeVisible(); → Retain exact assertion semantics. |
| 35 | await expect(warm.page.locator('[aria-busy="true"]')).toHaveCount(0); → Retain exact assertion semantics. |
| 37 | expect(warmFrames.length).toBeGreaterThan(0); → Retain exact assertion semantics. |
| 38 | expect(warmFrames.every(frame => frame.banner === 1 && frame.nav === 1 && frame.earth === 0 && frame.nonblank)).toBe(true); → Retain exact assertion semantics. |
| 47 | await expect(empty.page.getByText('No apps shared yet', { exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 65 | await expect(terminal.page.getByRole('heading', { name: 'Apps unavailable' })).toBeVisible(); → Retain exact assertion semantics. |
| 68 | await expect(terminal.page.getByText('Please try again. If the problem continues, come back later.', { exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 69 | await expect(terminal.page.getByText('Contained fixture failure', { exact: true })).toHaveCount(0); → Retain exact assertion semantics. |
| 70 | expect((await computedContrast(terminal.page.getByRole('heading', { name: 'Apps unavailable' }))).ratio).toBeGreaterThanOrEqual(4.5); → Retain exact assertion semantics. |
| 75 | await expect(terminal.page.getByText('Public apps', { exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 78 | expect(retryFrames.length).toBeGreaterThan(0); → Retain exact assertion semantics. |
| 79 | expect(retryFrames.every(frame => frame.banner === 1 && frame.nav === 1 && frame.earth === 0 && frame.nonblank)).toBe(true); → Retain exact assertion semantics. |
| 90 | await expect(partial.page.getByText('Public apps', { exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 91 | await expect(partial.page.getByText('Some app data is unavailable.', { exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 92 | expect((await computedContrast(partial.page.getByRole('status'))).ratio).toBeGreaterThanOrEqual(4.5); → Retain exact assertion semantics. |
| 110 | await expect(mapHeading).toBeVisible(); → Retain exact assertion semantics. |
| 112 | expect(mapContrast.ratio).toBeGreaterThanOrEqual(4.5); → Retain exact assertion semantics. |
| 113 | await expect(minimal.page.getByText('Contained fixture failure', { exact: true })).toHaveCount(0); → Retain exact assertion semantics. |
| 126 | await expect(routing.page.getByText('Public apps', { exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 128 | await expect(routing.page.getByRole('heading', { name: 'Page Not Found' })).toBeVisible(); → Retain exact assertion semantics. |
| 129 | await expect(routing.page.getByText('Public apps', { exact: true })).toHaveCount(0); → Retain exact assertion semantics. |
| 130 | await expect(routing.page.getByRole('status', { name: 'Earth loading' })).toHaveCount(0); → Retain exact assertion semantics. |
| 139 | await expect(routing.page).toHaveURL(${baseURL}/${fixtureUser.username}); → Retain exact assertion semantics. |
| 145 | await expect(routing.page.getByText('List not found or not published.', { exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 155 | await expect(exception.page.getByRole('heading', { name: 'Map Unavailable' })).toBeVisible(); → Retain exact assertion semantics. |
| 156 | await expect(exception.page.getByRole('banner')).toHaveCount(1); → Retain exact assertion semantics. |
| 157 | await expect(exception.page.getByRole('banner')).toBeVisible(); → Retain exact assertion semantics. |
| 158 | await expect(exception.page.getByRole('navigation', { name: 'Public navigation' })).toHaveCount(0); → Retain exact assertion semantics. |
| 159 | await expect(exception.page.getByRole('status', { name: 'Earth loading' })).toHaveCount(0); → Retain exact assertion semantics. |
| 160 | expect(await exception.page.locator('body').innerText()).not.toHaveLength(0); → Retain exact assertion semantics. |
| 165 | await expect(exception.page.getByRole('heading', { name: 'Music', level: 1 })).toBeVisible(); → Retain exact assertion semantics. |

### `Task 6 repair rejected Retry is contained ${viewport.width}x${viewport.height}`

Canonical equivalent / retained invariant: Retain every original public-shell/content/layout/accessibility/consent/route/network-containment assertion listed below with identical intended outcome. Canonical navigation conversion grants no waiver of public content parity, successful retry, filtered privacy or accessibility.

Exact fixture contract change: Navigation account authority only changes to cookie get-session/GET /me/PATCH /account revision DTO. Unrelated public gateway, list detail pagination, consent bootstrap, geometry and catchall contracts remain retained; missing category/public producer is a blocking prerequisite.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 193 | await expect(visitor.page.getByRole('heading', { name: 'Apps unavailable' })).toBeVisible(); → Retain exact assertion semantics. |
| 195 | await expect(visitor.page.locator('[aria-busy="true"]')).toHaveCount(0); → Retain exact assertion semantics. |
| 196 | await expect(visitor.page.getByRole('heading', { name: 'Apps unavailable' })).toBeVisible(); → Retain exact assertion semantics. |
| 198 | await expect(visitor.page.getByText('Public apps', { exact: true })).toBeVisible(); → Retain exact assertion semantics. |

### `Task 6 repair shared state contrast ${viewport.width}x${viewport.height}`

Canonical equivalent / retained invariant: Retain every original public-shell/content/layout/accessibility/consent/route/network-containment assertion listed below with identical intended outcome. Canonical navigation conversion grants no waiver of public content parity, successful retry, filtered privacy or accessibility.

Exact fixture contract change: Navigation account authority only changes to cookie get-session/GET /me/PATCH /account revision DTO. Unrelated public gateway, list detail pagination, consent bootstrap, geometry and catchall contracts remain retained; missing category/public producer is a blocking prerequisite.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 216 | await expect(terminal).toBeVisible(); → Retain exact assertion semantics. |
| 219 | expect.soft(terminalContrast.ratio, 'minimal-light PlaceMap terminal heading').toBeGreaterThanOrEqual(4.5); → Retain exact assertion semantics. |
| 229 | await expect(partial).toContainText('Some app data is unavailable.'); → Retain exact assertion semantics. |
| 232 | expect.soft(darkContrast.ratio, 'dark Apps partial notice').toBeGreaterThanOrEqual(4.5); → Retain exact assertion semantics. |

### 'public shell continuity smoke covers every top-level destination'

Canonical equivalent / retained invariant: Retain every original public-shell/content/layout/accessibility/consent/route/network-containment assertion listed below with identical intended outcome. Canonical navigation conversion grants no waiver of public content parity, successful retry, filtered privacy or accessibility.

Exact fixture contract change: Navigation account authority only changes to cookie get-session/GET /me/PATCH /account revision DTO. Unrelated public gateway, list detail pagination, consent bootstrap, geometry and catchall contracts remain retained; missing category/public producer is a blocking prerequisite.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 254 | await expect(visitor.page).toHaveURL(${baseURL}/${fixtureUser.username}/books?utm_source=continuity#matrix); → Retain exact assertion semantics. |
| 262 | await expect(visitor.page).toHaveURL(${baseURL}${destinationPath}); → Retain exact assertion semantics. |
| 264 | await expect(publicNav).toBeVisible(); → Retain exact assertion semantics. |
| 265 | await expect(publicNav.getByRole('link', { name: 'Profile', exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 266 | await expect(visitor.page.getByRole('status', { name: 'Earth loading' })).toHaveCount(0); → Retain exact assertion semantics. |
| 278 | await expect(publicNav).toBeVisible(); → Retain exact assertion semantics. |
| 279 | await expect(publicNav.getByRole('link', { name: 'Profile', exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 281 | await expect(destinationLink).toBeVisible(); → Retain exact assertion semantics. |
| 316 | await expect(visitor.page).toHaveURL(${baseURL}${destinationPath}); → Retain exact assertion semantics. |
| 327 | expect(held.clickTrusted).toBe(true); → Retain exact assertion semantics. |
| 328 | expect(held.postActivation.length).toBeGreaterThan(0); → Retain exact assertion semantics. |
| 329 | expect(held.postActivation.every((frame: any) => ( → Retain exact assertion semantics. |
| 337 | await expect(visitor.page.getByRole('status', { name: 'Earth loading' })).toHaveCount(0); → Retain exact assertion semantics. |
| 338 | await expect(publicNav.getByRole('link', { name: 'Profile', exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 348 | expect(completed.postActivation.length).toBeGreaterThanOrEqual(held.postActivation.length); → Retain exact assertion semantics. |
| 349 | expect(completed.postActivation.every((frame: any) => ( → Retain exact assertion semantics. |

### 'public category pages read every recommendation type through the unauthenticated gateway'

Canonical equivalent / retained invariant: Retain every original public-shell/content/layout/accessibility/consent/route/network-containment assertion listed below with identical intended outcome. Canonical navigation conversion grants no waiver of public content parity, successful retry, filtered privacy or accessibility.

Exact fixture contract change: Navigation account authority only changes to cookie get-session/GET /me/PATCH /account revision DTO. Unrelated public gateway, list detail pagination, consent bootstrap, geometry and catchall contracts remain retained; missing category/public producer is a blocking prerequisite.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 378 | expect(requests.every((request) => request.authorization === undefined)).toBe(true); → Retain exact assertion semantics. |

### 'public Places pagination requests one bounded unauthenticated detail page'

Canonical equivalent / retained invariant: Retain every original public-shell/content/layout/accessibility/consent/route/network-containment assertion listed below with identical intended outcome. Canonical navigation conversion grants no waiver of public content parity, successful retry, filtered privacy or accessibility.

Exact fixture contract change: Navigation account authority only changes to cookie get-session/GET /me/PATCH /account revision DTO. Unrelated public gateway, list detail pagination, consent bootstrap, geometry and catchall contracts remain retained; missing category/public producer is a blocking prerequisite.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 412 | await expect(visitor.page.getByText('Paging Place 24', { exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 415 | expect(requests.every((request) => request.authorization === undefined)).toBe(true); → Retain exact assertion semantics. |

### 'Places ripple radius stays finite at startup, repeat and route re-entry'

Canonical equivalent / retained invariant: Retain every original public-shell/content/layout/accessibility/consent/route/network-containment assertion listed below with identical intended outcome. Canonical navigation conversion grants no waiver of public content parity, successful retry, filtered privacy or accessibility.

Exact fixture contract change: Navigation account authority only changes to cookie get-session/GET /me/PATCH /account revision DTO. Unrelated public gateway, list detail pagination, consent bootstrap, geometry and catchall contracts remain retained; missing category/public producer is a blocking prerequisite.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 435 | await expect(owner.page.getByText('Map your world', { exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 439 | expect(invalid).toEqual([]); → Retain exact assertion semantics. |
| 441 | expect(radii.length).toBeGreaterThan(0); expect(radii.every(r => Number.isFinite(r) && r >= 0)).toBe(true); → Retain exact assertion semantics. |

### 'contained actual Settings boot verifies account without mounting consent or writing preferences'

Canonical equivalent / retained invariant: Canonical verified owner boots Settings without navigation GraphQL, consent mounting or preference writes; original Music readiness assertion remains required on canonical principal qualification.

Exact fixture contract change: Cookie get-session → canonical GET /me account DTO; distinct auth ID/account UUID; no SettingsAccount/PublicCategoryListCounts.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 452 | await expect(owner.page.getByRole('switch', { name: 'Music public visibility' })).toBeEnabled(); → Retain exact assertion semantics. |
| 453 | await expect(owner.page.getByTestId('cookie-consent-positioner')).toHaveCount(0); → Retain exact assertion semantics. |
| 454 | expect(await owner.page.evaluate(() => localStorage.getItem('explorers-cookie-consent'))).toBeNull(); → Retain exact assertion semantics. |
| 455 | expect(state.writes).toEqual([]); owner.guard.assertClean(); → Retain exact assertion semantics. |

### `${category.route}: Auto saved → header Off → reload → Hub On → Manual explicit Pin`

Canonical equivalent / retained invariant: Off persists only target visibility and removes only its saved pin; guest fallback follows confirmed privacy. On requires complete current native publication evidence, never restores a pin. Manual Pin is explicit, profile stays first and slot maximum remains five. Native cases Books/Movies/Games retain success; Places/Guides/Apps/Products/People successful On/Pin remain required and blocked.

Exact fixture contract change: GET /me canonical UUID and PATCH /account expectedRevision with all nine category rows; exact untouched category display/public/pin fields must match previous read. Cookie owner membership and fresh complete owner collection pages replace CheckPublishedLists. Guest reads remain anonymous and retain fallback/invalidation.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 468 | await owner.page.reload(); await expect(owner.page.getByRole('checkbox').first()).not.toBeChecked(); → Retain exact assertion semantics. |
| 469 | expect(state.account.pinned_nav_tabs).toEqual(['public_profile', other]); expect(state.account.auto_pinning).toBe(true); → Retain exact assertion semantics. |
| 470 | await guest.page.goto(/${fixtureUser.username}/${category.route}); await expect(guest.page).toHaveURL(${baseURL}/${fixtureUser.username}); → Retain exact assertion semantics. |
| 478 | expect(state.writes.at(-1)?.variables.data).toEqual({ [category.field]: 'Yes' }); → Navigation observations become canonical account UUID, cookie owner recognition, expectedRevision/category DTO patch; intended state and zero/unrelated-write assertions retained. |
| 480 | await expect(owner.page.getByRole('checkbox', { name: Pin ${category.label}, exact: true })).not.toBeChecked(); → Retain exact assertion semantics. |
| 485 | await expect(guest.page.getByRole('link', { name: category.route[0].toUpperCase() + category.route.slice(1), exact: true })).toBeVisible(); → Retain exact assertion semantics. |

## category-navigation-b.spec.ts

### `${category.route}: Settings Off → guest fallback → header On → explicit manual Pin`

Canonical equivalent / retained invariant: Off persists only target visibility and removes only its saved pin; guest fallback follows confirmed privacy. On requires complete current native publication evidence, never restores a pin. Manual Pin is explicit, profile stays first and slot maximum remains five. Native cases Books/Movies/Games retain success; Places/Guides/Apps/Products/People successful On/Pin remain required and blocked.

Exact fixture contract change: GET /me canonical UUID and PATCH /account expectedRevision with all nine category rows; exact untouched category display/public/pin fields must match previous read. Cookie owner membership and fresh complete owner collection pages replace CheckPublishedLists. Guest reads remain anonymous and retain fallback/invalidation.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 17 | expect(state.writes.map(r => r.variables)).toEqual([{ documentId: 'browser-account', data: { [category.field]: 'No', pinned_nav_tabs: ['public_profile', other] } }]); → Navigation observations become canonical account UUID, cookie owner recognition, expectedRevision/category DTO patch; intended state and zero/unrelated-write assertions retained. |
| 19 | await expect(owner.page.getByRole('checkbox', { name: category.label, exact: true })).not.toBeChecked(); → Retain exact assertion semantics. |
| 20 | await expect(owner.page.getByRole('checkbox', { name: Pin ${category.label}, exact: true })).not.toBeChecked(); → Retain exact assertion semantics. |
| 22 | await expect(guest.page.getByRole('link', { name: 'Profile', exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 23 | await expect(guest.page.locator(a[href="/${fixtureUser.username}/${category.route}"])).toHaveCount(0); → Retain exact assertion semantics. |
| 25 | await expect(guest.page).toHaveURL(${baseURL}/${fixtureUser.username}?utm_source=browser); → Retain exact assertion semantics. |
| 28 | expect(state.writes.at(-1)?.variables.data).toEqual({ [category.field]: 'Yes' }); → Navigation observations become canonical account UUID, cookie owner recognition, expectedRevision/category DTO patch; intended state and zero/unrelated-write assertions retained. |
| 29 | expect(state.account.pinned_nav_tabs).toEqual(['public_profile', other]); → Retain exact assertion semantics. |
| 32 | await expect(pin).not.toBeChecked(); await toggle(pin, true); → Retain exact assertion semantics. |
| 33 | expect(state.writes.at(-1)?.variables.data).toEqual({ pinned_nav_tabs: ['public_profile', other, category.field] }); → Navigation observations become canonical account UUID, cookie owner recognition, expectedRevision/category DTO patch; intended state and zero/unrelated-write assertions retained. |
| 34 | await owner.page.reload(); await settings(owner.page, true); await expect(pin).toBeChecked(); → Retain exact assertion semantics. |
| 36 | await expect(guest.page.getByRole('link', { name: category.route[0].toUpperCase() + category.route.slice(1), exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 37 | expect(guest.guard.vendors).toEqual([]); → Retain exact assertion semantics. |
| 38 | expect(await guest.page.evaluate(() => ({ auth: localStorage.getItem('auth-storage'), token: localStorage.getItem('qrtoken') }))).toEqual({ auth: null, token: null }); → Retain exact assertion semantics. |

### 'Profile mandatory, five slots, unpublished pin blocked and hidden saved choice removable'

Canonical equivalent / retained invariant: Retain profile-first mandatory placement, five-slot bound, safe hidden saved unpin, latest-read merging, repeated-activation deduplication, unknown/error honesty, explicit retry and stale origin rejection as applicable to every enumerated assertion. Future category successful new pins require delivered producers; safe cleanup does not.

Exact fixture contract change: Revision PATCH /account replaces UpdateTabVisibility. Each competing transaction performs fresh canonical GET /me and retains unrelated rows; external revision mismatch yields 409. Profile read/content fault injection targets canonical routes, never GraphQL credentials. Generation invalidation blocks late intents.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 48 | await expect(owner.page.getByRole('checkbox', { name: 'Pin Profile Tab' })).toBeDisabled(); → Retain exact assertion semantics. |
| 49 | await expect(owner.page.getByRole('checkbox', { name: 'Pin Games Tab' })).toBeDisabled(); → Retain exact assertion semantics. |
| 52 | await expect(owner.page.getByRole('alert')).toContainText('up to 5 tabs'); expect(state.writes).toEqual([]); → Retain exact assertion semantics. |
| 55 | expect(state.writes.at(-1)?.variables.data).toEqual({ pinned_nav_tabs: ['public_profile', 'public_movie', 'public_apps', 'public_products'] }); → Navigation observations become canonical account UUID, cookie owner recognition, expectedRevision/category DTO patch; intended state and zero/unrelated-write assertions retained. |
| 56 | expect(state.account.auto_pinning).toBe(false); → Retain exact assertion semantics. |

### `category ${failure} failure remains honest and recovers through explicit Refresh`

Canonical equivalent / retained invariant: Retain profile-first mandatory placement, five-slot bound, safe hidden saved unpin, latest-read merging, repeated-activation deduplication, unknown/error honesty, explicit retry and stale origin rejection as applicable to every enumerated assertion. Future category successful new pins require delivered producers; safe cleanup does not.

Exact fixture contract change: Revision PATCH /account replaces UpdateTabVisibility. Each competing transaction performs fresh canonical GET /me and retains unrelated rows; external revision mismatch yields 409. Profile read/content fault injection targets canonical routes, never GraphQL credentials. Generation invalidation blocks late intents.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 72 | await expect(owner.page.getByRole('alert').filter({ has: owner.page.getByRole('button', { name: 'Refresh', exact: true }) })).toBeVisible(); → Retain exact assertion semantics. |
| 73 | const count = state.writes.length; await owner.page.waitForTimeout(250); expect(state.writes).toHaveLength(count); → Retain exact assertion semantics. |
| 74 | expect(state.account.pinned_nav_tabs).toContain('public_music'); → Retain exact assertion semantics. |
| 79 | await expect(control).toBeEnabled(); → Retain exact assertion semantics. |
| 80 | await expect(control).toBeChecked({ checked: failure === 'read' \|\| failure === 'write' }); → Retain exact assertion semantics. |
| 81 | expect(state.writes.length - before).toBe(failure === 'read' ? 0 : 1); → Retain exact assertion semantics. |

### 'two owner tabs merge latest pins, rapid repeated activation cannot add duplicate writes'

Canonical equivalent / retained invariant: Retain profile-first mandatory placement, five-slot bound, safe hidden saved unpin, latest-read merging, repeated-activation deduplication, unknown/error honesty, explicit retry and stale origin rejection as applicable to every enumerated assertion. Future category successful new pins require delivered producers; safe cleanup does not.

Exact fixture contract change: Revision PATCH /account replaces UpdateTabVisibility. Each competing transaction performs fresh canonical GET /me and retains unrelated rows; external revision mismatch yields 409. Profile read/content fault injection targets canonical routes, never GraphQL credentials. Generation invalidation blocks late intents.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 96 | await submitPinnedCategoryUnpublish(second, control, 'Books Tab'); await expect(control).toBeDisabled(); await control.press('Space'); → Retain exact assertion semantics. |
| 97 | expect(state.writes).toHaveLength(3); release(); await expect(control).not.toBeChecked(); → Retain exact assertion semantics. |
| 99 | await expect(owner.page.getByRole('checkbox', { name: 'Pin Books Tab' })).not.toBeChecked(); → Retain exact assertion semantics. |
| 100 | await expect(owner.page.getByRole('checkbox', { name: 'Pin Games Tab' })).toBeChecked(); → Retain exact assertion semantics. |

### `actual HTML consent ${choice} persists only its explicit choice, never recurring seeds`

Canonical equivalent / retained invariant: Retain every original public-shell/content/layout/accessibility/consent/route/network-containment assertion listed below with identical intended outcome. Canonical navigation conversion grants no waiver of public content parity, successful retry, filtered privacy or accessibility.

Exact fixture contract change: Navigation account authority only changes to cookie get-session/GET /me/PATCH /account revision DTO. Unrelated public gateway, list detail pagination, consent bootstrap, geometry and catchall contracts remain retained; missing category/public producer is a blocking prerequisite.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 111 | await expect(banner).toBeVisible(); → Retain exact assertion semantics. |
| 112 | expect(await page.evaluate(() => localStorage.getItem('explorers-cookie-consent'))).toBeNull(); → Retain exact assertion semantics. |
| 113 | expect(visitor.guard.vendors).toEqual([]); → Retain exact assertion semantics. |
| 114 | expect(await page.evaluate(() => ({ scripts: [...document.scripts].filter(s => /googletagmanager\|clarity\.ms/.test(s.src)).length, configs: ((window as any).dataLayer ?? []).filter((e: any) => e[0] === 'config').length }))).toEqual({ scripts: 0, configs: 0 }); → Retain exact assertion semantics. |
| 123 | await expect(banner).toHaveCount(0); → Retain exact assertion semantics. |
| 125 | if (choice === 'close') expect(stored).toBeNull(); → Retain exact assertion semantics. |
| 126 | else expect(JSON.parse(stored!)).toMatchObject({ essential: true, analytics: choice === 'accept' \|\| choice === 'custom-on', marketing: choice === 'accept' \|\| choice === 'custom-off' }); → Retain exact assertion semantics. |
| 130 | expect(await page.evaluate(() => localStorage.getItem('explorers-cookie-consent'))).toBe(stored); → Retain exact assertion semantics. |
| 131 | if (choice === 'close') await expect(banner).toBeVisible(); else await expect(banner).toHaveCount(0); → Retain exact assertion semantics. |
| 133 | await expect(page.getByRole('link', { name: 'Profile', exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 134 | await expect(banner).toHaveCount(0); → Retain exact assertion semantics. |
| 135 | if (!enabled) expect(visitor.guard.vendors).toEqual([]); → Retain exact assertion semantics. |

### 'last list Draft and Delete preserve category settings/pins, private items stay filtered'

Canonical equivalent / retained invariant: Retain per-list publication/privacy/delete behavior independently from saved category preferences and pins. Confirmed empty complete native sets produce no-content without preference writes; unsupported emptiness is unknown without fabricated count. Future all-eight content-positive behavior remains required.

Exact fixture contract change: Books/Movies/Games complete active owner collections replace navigation eligibility GraphQL only. Native per-list command and remaining category content adapters retain their original contracts. No empty refresh causes an account PATCH.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 151 | await expect(guest.page.getByText('Public books', { exact: true }).first()).toBeVisible(); → Retain exact assertion semantics. |
| 152 | await expect(guest.page.getByText('Private fixture list', { exact: true })).toHaveCount(0); → Retain exact assertion semantics. |
| 156 | await expect(card.getByText('Draft', { exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 157 | expect(state.writes.map(r => r.name)).toEqual([PATCH ${publicCollectionPath}]); → Retain exact assertion semantics. |
| 158 | await owner.page.reload(); await expect(card.getByText('Draft', { exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 159 | await guest.page.reload(); await expect(guest.page.getByText('Public books', { exact: true })).toHaveCount(0); → Retain exact assertion semantics. |
| 164 | await expect(owner.page).toHaveURL(${baseURL}/recommendations/books); → Retain exact assertion semantics. |
| 165 | expect(state.writes.map(r => r.name)).toEqual([PATCH ${publicCollectionPath}, DELETE ${publicCollectionPath}]); → Retain exact assertion semantics. |
| 169 | await expect(owner.page.getByText('Build your library', { exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 170 | expect(state.lists.bookLists).toEqual([]); expect(state.writes.map(r => r.name)).toEqual([PATCH ${publicCollectionPath}, DELETE ${publicCollectionPath}, DELETE ${privateCollectionPath}]); → Retain exact assertion semantics. |
| 171 | expect({ public_books: state.account.public_books, pins: state.account.pinned_nav_tabs }).toEqual(before); → Retain exact assertion semantics. |
| 172 | await settings(owner.page, true); await expect(owner.page.getByRole('checkbox', { name: 'Books Tab', exact: true })).toBeChecked(); → Retain exact assertion semantics. |
| 173 | await expect(owner.page.getByRole('checkbox', { name: 'Pin Books Tab' })).toBeChecked(); → Retain exact assertion semantics. |

### 'all eight empty list responses never mutate category publication or saved pins'

Canonical equivalent / retained invariant: Retain per-list publication/privacy/delete behavior independently from saved category preferences and pins. Confirmed empty complete native sets produce no-content without preference writes; unsupported emptiness is unknown without fabricated count. Future all-eight content-positive behavior remains required.

Exact fixture contract change: Books/Movies/Games complete active owner collections replace navigation eligibility GraphQL only. Native per-list command and remaining category content adapters retain their original contracts. No empty refresh causes an account PATCH.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 195 | const start = owner.guard.errors.length; await owner.page.goto(/recommendations/${category.route}); await expect(owner.page.getByText(taglines[index], { exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 198 | await owner.page.getByText('Settings', { exact: true }).first().click(); await owner.page.goBack(); await expect(owner.page.getByText(taglines[index], { exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 204 | expect(Object.values(invalid).every(values => Array.isArray(values) && values.length === 0)).toBe(true); → Retain exact assertion semantics. |
| 205 | await settings(owner.page); expect(state.writes).toEqual([]); expect(state.account).toEqual(before); → Retain exact assertion semantics. |

### 'direct dashboard/public/share never mount consent; landing delayed banner cancels on navigation'

Canonical equivalent / retained invariant: Retain every original public-shell/content/layout/accessibility/consent/route/network-containment assertion listed below with identical intended outcome. Canonical navigation conversion grants no waiver of public content parity, successful retry, filtered privacy or accessibility.

Exact fixture contract change: Navigation account authority only changes to cookie get-session/GET /me/PATCH /account revision DTO. Unrelated public gateway, list detail pagination, consent bootstrap, geometry and catchall contracts remain retained; missing category/public producer is a blocking prerequisite.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 215 | await expect(visitor.page.getByTestId('cookie-consent-positioner')).toHaveCount(0); → Retain exact assertion semantics. |
| 216 | expect(await visitor.page.evaluate(() => localStorage.getItem('explorers-cookie-consent'))).toBeNull(); expect(visitor.guard.vendors).toEqual([]); → Retain exact assertion semantics. |
| 219 | await landing.page.waitForTimeout(2300); await expect(landing.page.getByTestId('cookie-consent-positioner')).toHaveCount(0); expect(landing.guard.vendors).toEqual([]); → Retain exact assertion semantics. |

### 'consent storage denial keeps actual bootstrap and explicit Accept fail closed'

Canonical equivalent / retained invariant: Retain every original public-shell/content/layout/accessibility/consent/route/network-containment assertion listed below with identical intended outcome. Canonical navigation conversion grants no waiver of public content parity, successful retry, filtered privacy or accessibility.

Exact fixture contract change: Navigation account authority only changes to cookie get-session/GET /me/PATCH /account revision DTO. Unrelated public gateway, list detail pagination, consent bootstrap, geometry and catchall contracts remain retained; missing category/public producer is a blocking prerequisite.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 232 | await expect(visitor.page.getByTestId('cookie-consent-positioner')).toHaveCount(0); expect(visitor.guard.vendors).toEqual([]); → Retain exact assertion semantics. |
| 233 | await visitor.page.reload(); await expect(visitor.page.getByTestId('cookie-consent-positioner')).toBeVisible(); expect(visitor.guard.vendors).toEqual([]); → Retain exact assertion semantics. |
| 234 | expect(await visitor.page.evaluate(() => [...document.scripts].filter(s => /googletagmanager\|clarity\.ms/.test(s.src)).length)).toBe(0); → Retain exact assertion semantics. |

### 'catchall deliberately denies unknown external HTTP and WebSocket without forwarding'

Canonical equivalent / retained invariant: Retain every original public-shell/content/layout/accessibility/consent/route/network-containment assertion listed below with identical intended outcome. Canonical navigation conversion grants no waiver of public content parity, successful retry, filtered privacy or accessibility.

Exact fixture contract change: Navigation account authority only changes to cookie get-session/GET /me/PATCH /account revision DTO. Unrelated public gateway, list detail pagination, consent bootstrap, geometry and catchall contracts remain retained; missing category/public producer is a blocking prerequisite.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 241 | await visitor.page.goto(/${fixtureUser.username}); await expect(visitor.page.getByRole('link', { name: 'Profile', exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 248 | expect(visitor.guard.denied).toEqual([ → Retain exact assertion semantics. |
| 254 | expect(visitor.guard.errors).toEqual(['Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector']); → Retain exact assertion semantics. |

### 'offline/online and Music outage preserve unrelated pins until explicit fresh owner action'

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 266 | await expect(owner.page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible(); expect(state.writes).toEqual([]); → Retain exact assertion semantics. |
| 267 | expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_music', 'public_books']); → Retain exact assertion semantics. |
| 268 | await owner.context.setOffline(false); await expect(pin).toBeEnabled(); expect(state.writes).toEqual([]); → Retain exact assertion semantics. |
| 271 | expect(state.writes.at(-1)?.variables.data).toEqual({ pinned_nav_tabs: ['public_profile', 'public_music', 'public_books', 'public_games'] }); → Navigation observations become canonical account UUID, cookie owner recognition, expectedRevision/category DTO patch; intended state and zero/unrelated-write assertions retained. |
| 272 | expect(state.account.public_music).toBe('Yes'); expect(state.mode).toBe('public'); → Retain exact assertion semantics. |

### 'ordinary stale loaded account rereads latest pins and route/account change blocks pending intent'

Canonical equivalent / retained invariant: Retain profile-first mandatory placement, five-slot bound, safe hidden saved unpin, latest-read merging, repeated-activation deduplication, unknown/error honesty, explicit retry and stale origin rejection as applicable to every enumerated assertion. Future category successful new pins require delivered producers; safe cleanup does not.

Exact fixture contract change: Revision PATCH /account replaces UpdateTabVisibility. Each competing transaction performs fresh canonical GET /me and retains unrelated rows; external revision mismatch yields 409. Profile read/content fault injection targets canonical routes, never GraphQL credentials. Generation invalidation blocks late intents.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Native Books/Movies/Games qualify current eligibility; unsupported category positive successes remain blocked on category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 282 | expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_books', 'public_apps', 'public_games']); → Retain exact assertion semantics. |
| 285 | const books = owner.page.getByRole('checkbox', { name: 'Books Tab', exact: true }); await submitPinnedCategoryUnpublish(owner.page, books, 'Books Tab'); await expect(books).toBeDisabled(); → Retain exact assertion semantics. |
| 287 | await expect(owner.page.getByRole('checkbox').first()).toBeEnabled(); expect(state.writes).toHaveLength(writes); expect(state.account.public_books).toBe('Yes'); → Retain exact assertion semantics. |
| 288 | state.account.documentId = 'browser-account'; await owner.page.reload(); await expect(owner.page.getByRole('checkbox').first()).toBeChecked(); expect(state.writes).toHaveLength(writes); → Retain exact assertion semantics. |

## music-publish-controls.spec.ts

### `Music pin hint checking and outage preserve the saved pin at ${width}px`

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 16 | await expect(pin).toBeChecked(); → Retain exact assertion semantics. |
| 17 | await expect.soft(row).toContainText('Checking Music publication…'); → Retain exact assertion semantics. |
| 18 | await expect.soft(row).not.toContainText('Visibility off'); → Retain exact assertion semantics. |
| 19 | expect(state.writes).toEqual([]); → Retain exact assertion semantics. |
| 21 | await expect(row).toContainText('Music publication was not confirmed. Refresh or retry the previous action.'); → Retain exact assertion semantics. |
| 22 | await expect(row).not.toContainText('Visibility off'); await expect(pin).toBeChecked(); → Retain exact assertion semantics. |
| 23 | expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_music', 'public_books']); expect(state.writes).toEqual([]); → Retain exact assertion semantics. |
| 24 | expect(await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); → Retain exact assertion semantics. |
| 26 | expect(state.writes.map(write => write.variables.data)).toEqual([{ pinned_nav_tabs: ['public_profile', 'public_books'] }]); → Navigation observations become canonical account UUID, cookie owner recognition, expectedRevision/category DTO patch; intended state and zero/unrelated-write assertions retained. |
| 27 | expect(state.account.public_music).toBe('Yes'); expect(state.apiCalls.filter(call => call.path === '/api/music/publication')).toEqual([]); → Retain exact assertion semantics. |

### `Music pin hint ${profile}/${mode} is truthful without changing placement`

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 43 | await expect(owner.page.getByRole('switch', { name: 'Music public visibility' })).toBeEnabled(); → Retain exact assertion semantics. |
| 45 | if (hint) await expect(row).toContainText(hint); → Retain exact assertion semantics. |
| 46 | else await expect(row).toHaveText('♫Music Tab'); → Retain exact assertion semantics. |
| 47 | await expect(row).not.toContainText('Visibility off'); await expect(pin).toBeChecked({ checked: pinned }); → Retain exact assertion semantics. |
| 48 | expect(state.account.pinned_nav_tabs).toEqual(pins); expect(state.writes).toEqual([]); → Retain exact assertion semantics. |
| 51 | expect(state.writes.map(write => write.variables.data)).toEqual([{ pinned_nav_tabs: ['public_profile', 'public_books'] }]); → Navigation observations become canonical account UUID, cookie owner recognition, expectedRevision/category DTO patch; intended state and zero/unrelated-write assertions retained. |
| 52 | expect(state.account.public_music).toBe('No'); → Retain exact assertion semantics. |
| 54 | expect(state.apiCalls.filter(call => call.path === '/api/music/publication')).toEqual([]); → Retain exact assertion semantics. |

### `matrix ${profile}/${mode}/${auto ? 'Auto' : 'Manual'}/${pin ? 'saved' : 'absent'} is truthful and read-only`

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 70 | await expect(control).toHaveCount(1); await expect(control).toBeEnabled(); → Retain exact assertion semantics. |
| 71 | await expect(control).toBeChecked({ checked: profile === 'Yes' && mode === 'public' }); → Retain exact assertion semantics. |
| 73 | await expect(owner.page.getByText(expected === 'attention' ? 'Music sharing needs attention. Review or make it private.' : Music is ${expected}., { exact: true })).toHaveCount(1); → Retain exact assertion semantics. |
| 74 | expect(state.writes).toEqual([]); → Retain exact assertion semantics. |

### 'Settings On → reload/Pin → anonymous friendly/share → header Off revokes open guest and old link'

Canonical equivalent / retained invariant: Retain explicit Music On with account preference then publication command, confirmed reload and explicit Pin, anonymous friendly/share visibility with private playlists filtered, and header Off revocation of the open guest and old share link. Off removes only Music saved placement; guest controls and playlists remain unchanged. Successful public Music and revocation assertions require Epic6.1/6.3 and remain blocked until delivered.

Exact fixture contract change: Convert owner preference reads/writes to cookie GET /me and exact revision/full-nine-row PATCH while preserving publication command ordering. Keep Music verifier, friendly/share descriptor, anonymous guest access, revocation and playlist filtering contracts. Replace legacy writer observations only; never replace the required guest success with unavailable.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 84 | await control.click(); await expect(control).toBeChecked(); await expect(control).toBeEnabled(); → Retain exact assertion semantics. |
| 85 | expect(state.writes.map(r => r.name)).toEqual(['UpdateTabVisibility', '/api/music/publication']); → Navigation observations become canonical account UUID, cookie owner recognition, expectedRevision/category DTO patch; intended state and zero/unrelated-write assertions retained. |
| 86 | expect(state.writes[0].variables.data).toEqual({ public_music: 'Yes' }); → Navigation observations become canonical account UUID, cookie owner recognition, expectedRevision/category DTO patch; intended state and zero/unrelated-write assertions retained. |
| 87 | await owner.page.reload(); await settings(owner.page, true); await expect(control).toBeChecked(); → Retain exact assertion semantics. |
| 91 | await expect(guest.page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 92 | await expect(guest.page.getByText('Private owner playlist')).toHaveCount(0); → Retain exact assertion semantics. |
| 94 | await expect(sharePage.getByRole('heading', { name: 'Music', exact: true })).toBeVisible(); await expect(sharePage.getByText('Private owner playlist')).toHaveCount(0); await sharePage.close(); → Retain exact assertion semantics. |
| 96 | await expect(control).toHaveCount(1); await expect(control).toBeEnabled(); await control.click(); → Retain exact assertion semantics. |
| 97 | await expect(control).not.toBeChecked(); await expect(control).toBeEnabled(); → Retain exact assertion semantics. |
| 99 | await expect(guest.page).toHaveURL(${baseURL}/${fixtureUser.username}); → Retain exact assertion semantics. |
| 101 | await expect(guest.page.getByRole('heading', { name: 'Music page unavailable' })).toBeVisible(); → Retain exact assertion semantics. |
| 102 | await expect(guest.page.getByRole('button', { name: 'Retry' })).toHaveCount(0); → Retain exact assertion semantics. |
| 104 | await expect(owner.page.getByRole('checkbox', { name: 'Pin Music Tab' })).not.toBeChecked(); → Retain exact assertion semantics. |
| 105 | expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_books']); → Retain exact assertion semantics. |
| 106 | expect(state.guestControls).toEqual(beforePermissions); expect(state.playlists).toEqual(beforeLists); → Retain exact assertion semantics. |

### 'Auto + saved Music → header Off → Manual → Settings On never restores removed pin'

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 115 | await expect(control).toBeChecked(); await control.click(); await expect(control).toBeEnabled(); await expect(control).not.toBeChecked(); → Retain exact assertion semantics. |
| 116 | expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_books', 'public_games']); → Retain exact assertion semantics. |
| 119 | await expect(owner.page.getByRole('checkbox', { name: 'Pin Music Tab' })).not.toBeChecked(); → Retain exact assertion semantics. |
| 120 | await control.click(); await expect(control).toBeChecked(); await expect(control).toBeEnabled(); → Retain exact assertion semantics. |
| 121 | expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_books', 'public_games']); → Retain exact assertion semantics. |
| 122 | await guest.page.goto(/${fixtureUser.username}/music); await expect(guest.page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 123 | await control.click(); await expect(control).not.toBeChecked(); await expect(control).toBeEnabled(); → Retain exact assertion semantics. |
| 124 | await owner.page.goto('/recommendations/music'); await expect(control).not.toBeChecked(); → Retain exact assertion semantics. |
| 125 | await control.click(); await expect(control).toBeChecked(); await expect(control).toBeEnabled(); → Retain exact assertion semantics. |
| 126 | expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_books', 'public_games']); → Retain exact assertion semantics. |

### `${profile}+${mode} Make private recovery never publishes first`

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 136 | await expect(owner.page.getByText('Music is private.', { exact: true })).toHaveCount(1); → Retain exact assertion semantics. |
| 137 | expect(state.apiCalls.filter(r => r.path === '/api/music/publication').map(r => r.body)).toEqual([{ mode: 'private' }]); → Retain exact assertion semantics. |
| 138 | expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_books']); → Retain exact assertion semantics. |
| 139 | expect(state.writes.filter(r => r.name === 'UpdateTabVisibility').map(r => r.variables.data)).toEqual([{ public_music: 'No', pinned_nav_tabs: ['public_profile', 'public_books'] }]); → Navigation observations become canonical account UUID, cookie owner recognition, expectedRevision/category DTO patch; intended state and zero/unrelated-write assertions retained. |

### `Music ${fault} requires explicit same-key recovery or separate fresh confirmation`

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 153 | await expect(control).toBeEnabled(); await control.click(); await expect(control).toBeDisabled(); → Retain exact assertion semantics. |
| 155 | await expect(recovery).toBeEnabled(); → Retain exact assertion semantics. |
| 157 | const count = commands().length; await owner.page.waitForTimeout(250); expect(commands()).toHaveLength(count); → Retain exact assertion semantics. |
| 160 | if (fault === 'expired replay') { await owner.page.getByRole('button', { name: 'Refresh Music status' }).click(); await expect(control).toBeDisabled(); } → Retain exact assertion semantics. |
| 161 | await recovery.click(); await expect(control).toBeChecked(); await expect(control).toBeEnabled(); → Retain exact assertion semantics. |
| 162 | if (firstKey) expect(commands().at(-1)?.key === firstKey).toBe(fault !== 'expired replay'); → Retain exact assertion semantics. |
| 163 | expect(commands().every(r => Object.keys(r.body).join(',') === 'mode')).toBe(true); → Retain exact assertion semantics. |

### `friendly ${status} retains route and recovers with the intended retry policy`

Canonical equivalent / retained invariant: Retain every original public-shell/content/layout/accessibility/consent/route/network-containment assertion listed below with identical intended outcome. Canonical navigation conversion grants no waiver of public content parity, successful retry, filtered privacy or accessibility.

Exact fixture contract change: Navigation account authority only changes to cookie get-session/GET /me/PATCH /account revision DTO. Unrelated public gateway, list detail pagination, consent bootstrap, geometry and catchall contracts remain retained; missing category/public producer is a blocking prerequisite.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 175 | await expect(guest.page).toHaveURL(${baseURL}/${fixtureUser.username}/music?utm_source=browser); → Retain exact assertion semantics. |
| 178 | await expect(retry).toBeVisible(); → Retain exact assertion semantics. |
| 179 | await expect(guest.page.getByRole('heading', { name: 'Too many requests. Try again in 1 seconds.' })).toBeVisible(); → Retain exact assertion semantics. |
| 180 | await expect(retry).toBeEnabled(); await retry.click(); → Retain exact assertion semantics. |
| 182 | await expect(guest.page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 183 | expect(state.writes).toEqual([]); → Retain exact assertion semantics. |

### `geometry ${width}/${theme}: Settings and complete/compact Music, keyboard and touch`

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 196 | await expect(control).toHaveCount(1); await expect(control).toBeEnabled(); await control.scrollIntoViewIfNeeded(); → Retain exact assertion semantics. |
| 197 | const box = await control.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44); → Retain exact assertion semantics. |
| 198 | expect(await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); → Retain exact assertion semantics. |
| 199 | expect(await owner.page.locator('html').evaluate(el => el.classList.contains('dashboard-theme-dark'))).toBe(theme === 'dark'); → Retain exact assertion semantics. |
| 201 | await expect(status).toContainText('Music is private.'); if (surface !== 'Settings') await expect(status).toBeVisible(); → Retain exact assertion semantics. |
| 202 | await expect(owner.page.getByText('Music publication', { exact: true })).toHaveCount(0); → Retain exact assertion semantics. |
| 203 | await control.focus(); await expect(control).toBeFocused(); await control.press('Space'); await expect(control).toBeChecked(); await expect(control).toBeEnabled(); → Retain exact assertion semantics. |
| 205 | await expect(control).not.toBeChecked(); await expect(control).toBeEnabled(); → Retain exact assertion semantics. |
| 208 | expect(state.writes.filter(r => r.name === '/api/music/publication')).toHaveLength(6); → Retain exact assertion semantics. |

### 'authoritative friendly fallback replaces history, preserves only safe UTM and drops capability fragment'

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 216 | await guest.page.goto(/${fixtureUser.username}/books); await expect(guest.page.getByRole('link', { name: 'Profile', exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 218 | await expect(guest.page).toHaveURL(${baseURL}/${fixtureUser.username}?utm_source=browser&utm_medium=qa); → Retain exact assertion semantics. |
| 219 | await guest.page.goBack(); await expect(guest.page).toHaveURL(${baseURL}/${fixtureUser.username}/books); → Retain exact assertion semantics. |
| 220 | expect(state.writes).toEqual([]); → Retain exact assertion semantics. |

### `unknown/invalid username ${username} keeps normal 404`

Canonical equivalent / retained invariant: Retain every original public-shell/content/layout/accessibility/consent/route/network-containment assertion listed below with identical intended outcome. Canonical navigation conversion grants no waiver of public content parity, successful retry, filtered privacy or accessibility.

Exact fixture contract change: Navigation account authority only changes to cookie get-session/GET /me/PATCH /account revision DTO. Unrelated public gateway, list detail pagination, consent bootstrap, geometry and catchall contracts remain retained; missing category/public producer is a blocking prerequisite.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 229 | await expect(guest.page.getByText(/page not found\|user not found\|404/i).first()).toBeVisible(); → Retain exact assertion semantics. |
| 230 | await expect(guest.page).not.toHaveURL(${baseURL}/${fixtureUser.username}); → Retain exact assertion semantics. |

### 'friendly pending descriptor never redirects; failed account read Retry performs a fresh account read'

Canonical equivalent / retained invariant: A pending Music public descriptor retains the friendly URL and withholds the Music heading until resolved. A failed public profile/account gateway read displays Retry; explicit Retry performs a fresh read, restores Music and causes zero writes. This is an anonymous public read/recovery case, not owner publication authorization.

Exact fixture contract change: Keep the held Music public-profile descriptor and both PublicProfileData failures on their public adapters; do not retarget these guest faults to owner GET /me. Any owner navigation authority uses canonical cookies independently. Public/Music successful recovery remains required on the public integration producers.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 242 | await guest.page.waitForTimeout(250); await expect(guest.page).toHaveURL(${baseURL}/${fixtureUser.username}/music); → Retain exact assertion semantics. |
| 243 | await expect(guest.page.getByRole('heading', { name: 'Music', exact: true })).toHaveCount(0); → Retain exact assertion semantics. |
| 244 | release(); await expect(guest.page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 249 | const retry = guest.page.getByRole('button', { name: 'Retry', exact: true }); await expect(retry).toBeVisible(); → Retain exact assertion semantics. |
| 251 | await expect(guest.page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible(); expect(state.reads.length).toBeGreaterThan(reads); expect(state.writes).toEqual([]); → Retain exact assertion semantics. |

### 'same-key Private replay cannot clear account after another device restored Public'

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 261 | const retry = owner.page.getByRole('button', { name: 'Retry previous action' }); await expect(retry).toBeEnabled(); → Retain exact assertion semantics. |
| 264 | await retry.click(); await expect(owner.page.getByRole('button', { name: 'Confirm new private action' })).toBeEnabled(); → Retain exact assertion semantics. |
| 265 | expect(state.writes.filter(r => r.name === 'UpdateTabVisibility')).toEqual([]); → Navigation observations become canonical account UUID, cookie owner recognition, expectedRevision/category DTO patch; intended state and zero/unrelated-write assertions retained. |
| 266 | expect(state.apiCalls.filter(r => r.path === '/api/music/publication').map(r => r.key)).toEqual([key, key]); → Retain exact assertion semantics. |
| 267 | expect(state.mode).toBe('public'); expect(state.account.pinned_nav_tabs).toContain('public_music'); → Retain exact assertion semantics. |

### 'session storage denial retains in-memory stable retry without automatic writes'

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 280 | await settings(owner.page); expect(state.writes).toEqual([]); state.faults.set('/api/music/publication', [{ kind: 'lost' }]); → Retain exact assertion semantics. |
| 282 | await owner.page.getByRole('button', { name: 'Retry previous action' }).click(); await expect(control).toBeChecked(); await expect(control).toBeEnabled(); → Retain exact assertion semantics. |
| 283 | const keys = state.apiCalls.filter(r => r.path === '/api/music/publication').map(r => r.key); expect(keys).toHaveLength(2); expect(keys[1]).toBe(keys[0]); → Retain exact assertion semantics. |
| 284 | await owner.page.reload(); await settings(owner.page); await expect(control).toBeChecked(); expect(state.apiCalls.filter(r => r.path === '/api/music/publication')).toHaveLength(2); → Retain exact assertion semantics. |

### 'cold mobile Music and breakpoint remount during pending read cannot leak an old write'

Canonical equivalent / retained invariant: Cold mobile Music has one enabled control and zero writes. Holding all account reads during an explicit publication intent and replacing the layout invalidates that origin: releasing reads cannot issue a stale write. Returning to mobile and reloading retain one control and zero writes.

Exact fixture contract change: Retarget CategoryNavigationAccount held reads to canonical GET /me with verified cookie identity and account UUID; preserve the multi-read gate and breakpoint timings. Generation/origin checks apply before any PATCH or Music command; no positive publication success is asserted by this guard case.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 293 | await expect(control).toHaveCount(1); await expect(control).toBeEnabled(); expect(state.writes).toEqual([]); → Retain exact assertion semantics. |
| 297 | await control.tap(); await expect(control).toBeDisabled(); → Retain exact assertion semantics. |
| 298 | await owner.page.setViewportSize({ width: 1280, height: 900 }); await expect(owner.page.locator('.dashboard-content')).toBeVisible(); → Retain exact assertion semantics. |
| 299 | state.faults.delete('CategoryNavigationAccount'); release(); await expect(control).toHaveCount(1); await owner.page.waitForTimeout(300); expect(state.writes).toEqual([]); → Retain exact assertion semantics. |
| 300 | await owner.page.setViewportSize({ width: 375, height: 900 }); await expect(control).toHaveCount(1); → Retain exact assertion semantics. |
| 301 | await owner.page.reload(); await expect(control).toHaveCount(1); expect(state.writes).toEqual([]); → Retain exact assertion semantics. |

### `Music ${condition} is disabled without blocking ordinary Settings`

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 313 | await settings(owner.page); const control = owner.page.getByRole('switch', { name: 'Music public visibility' }); await expect(control).toBeDisabled(); → Retain exact assertion semantics. |
| 314 | const status = owner.page.locator([id="${await control.getAttribute('aria-describedby')}"]); await expect(status).toContainText(/not confirmed\|not ready/); await expect(status).toBeVisible(); → Retain exact assertion semantics. |
| 318 | await expect(confirm).toBeVisible(); await confirm.click(); → Retain exact assertion semantics. |
| 319 | await expect(books).not.toBeChecked(); → Retain exact assertion semantics. |
| 320 | expect(state.writes.map(r => r.name)).toEqual(['UpdateTabVisibility']); → Navigation observations become canonical account UUID, cookie owner recognition, expectedRevision/category DTO patch; intended state and zero/unrelated-write assertions retained. |
| 321 | expect(state.account.public_books).toBe('No'); expect(state.account.public_music).toBe('No'); → Retain exact assertion semantics. |

### 'two owner tabs observe verified final Music On and Off without automatic commands'

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 331 | await expect(secondSwitch).toBeEnabled(); await firstSwitch.click(); await expect(firstSwitch).toBeChecked(); await expect(firstSwitch).toBeEnabled(); → Retain exact assertion semantics. |
| 332 | await expect(secondSwitch).toBeChecked(); await expect(secondSwitch).toBeEnabled(); await secondSwitch.click(); → Retain exact assertion semantics. |
| 333 | await expect(secondSwitch).not.toBeChecked(); await expect(secondSwitch).toBeEnabled(); await expect(firstSwitch).not.toBeChecked(); → Retain exact assertion semantics. |
| 334 | expect(state.apiCalls.filter(r => r.path === '/api/music/publication').map(r => r.body.mode)).toEqual(['public', 'private']); → Retain exact assertion semantics. |

### 'delayed cross-device old Public can win backend ordering and must surface conflict'

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 345 | await expect(otherDevice.page.getByText('Music is private.', { exact: true })).toHaveCount(1); expect(state.mode).toBe('private'); → Retain exact assertion semantics. |
| 346 | release(); await expect(first.page.getByRole('button', { name: 'Confirm new public action' })).toBeEnabled(); → Retain exact assertion semantics. |
| 347 | expect(state.mode).toBe('public'); expect(state.account.public_music).toBe('No'); → Retain exact assertion semantics. |
| 348 | expect(state.apiCalls.filter(r => r.path === '/api/music/publication').map(r => r.body.mode)).toEqual(['public', 'private']); → Retain exact assertion semantics. |
| 349 | await first.page.waitForTimeout(250); expect(state.apiCalls.filter(r => r.path === '/api/music/publication')).toHaveLength(2); → Retain exact assertion semantics. |

### 'pending account read across A→B→A and logout never authorizes a stale publication'

Canonical equivalent / retained invariant: Hold the pre-publication account read, replace A with B and then return to A through fresh verified identities/generations; release of the old read must authorize neither account preference nor Music publication writes. Reload is read-only, logout reaches login, clears local authority/legacy qrtoken and leaves the complete write inventory empty. Returning to the same account UUID does not resurrect the earlier generation.

Exact fixture contract change: Move CategoryNavigationAccount fault injection to canonical GET /me. Replace documentId-only swaps with consistent cookie get-session auth identity, canonical account UUID and generation transitions for A, B and fresh A. Preserve held-read timing, zero writes, logout and local token removal; PATCH expectedRevision cannot legitimize stale intent. Music credential/publication protocol stays separate; no successful Music publication is asserted in this guard case.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 357 | await owner.page.getByRole('switch', { name: 'Music public visibility' }).click(); await expect(owner.page.getByRole('switch', { name: 'Music public visibility' })).toBeDisabled(); → Retain exact assertion semantics. |
| 359 | expect(state.writes).toEqual([]); → Retain exact assertion semantics. |
| 360 | state.account.documentId = 'browser-account'; await owner.page.reload(); await settings(owner.page); expect(state.writes).toEqual([]); → Retain exact assertion semantics. |
| 362 | await owner.page.getByRole('button', { name: 'Logout', exact: true }).click(); await expect(owner.page).toHaveURL(/\/login$/); → Retain exact assertion semantics. |
| 363 | expect(state.writes).toEqual([]); expect(await owner.page.evaluate(() => localStorage.getItem('qrtoken'))).toBeNull(); → Retain exact assertion semantics. |

### 'Unlisted sharing is explicit, dialog closure drops capability and old link is refused after Off'

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 374 | const link = dialog.getByRole('textbox', { name: 'Music share link' }); await expect(link).toBeVisible(); → Retain exact assertion semantics. |
| 375 | const shareUrl = await link.inputValue(); expect(new URL(shareUrl).hash.startsWith('#access=')).toBe(true); → Retain exact assertion semantics. |
| 376 | expect(state.account.pinned_nav_tabs).toEqual(['public_profile', 'public_books']); expect(state.account.public_music).toBe('No'); → Retain exact assertion semantics. |
| 377 | await guest.page.goto(shareUrl); await expect(guest.page.getByRole('heading', { name: 'Music', exact: true })).toBeVisible(); → Retain exact assertion semantics. |
| 378 | await expect(guest.page.getByText('Private owner playlist')).toHaveCount(0); → Retain exact assertion semantics. |
| 380 | await owner.page.getByRole('button', { name: 'Open playlist and sharing menu', exact: true }).click(); await owner.page.getByRole('menuitem', { name: 'Sharing settings', exact: true }).click(); await expect(link).toHaveCount(0); → Retain exact assertion semantics. |
| 383 | await guest.page.reload(); await expect(guest.page.getByRole('heading', { name: 'Music page unavailable' })).toBeVisible(); await expect(guest.page.getByRole('button', { name: 'Retry' })).toHaveCount(0); → Retain exact assertion semantics. |

### '320px error/pending controls remain visible, keyboard-recoverable, and RTL Music has no overflow'

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 392 | const alert = owner.page.getByRole('alert').filter({ hasText: 'Music publication was not confirmed' }); await expect(alert).toBeVisible(); await alert.focus(); await expect(alert).toBeFocused(); → Retain exact assertion semantics. |
| 393 | const retry = owner.page.getByRole('button', { name: 'Retry previous action' }); const box = await retry.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); → Retain exact assertion semantics. |
| 394 | expect(await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); → Retain exact assertion semantics. |
| 395 | await retry.focus(); await retry.press('Enter'); await expect(control).toBeChecked(); await expect(control).toBeEnabled(); → Retain exact assertion semantics. |
| 398 | await owner.page.goto('/recommendations/music'); await expect(owner.page.locator('html')).toHaveAttribute('dir', 'rtl'); → Retain exact assertion semantics. |
| 400 | await expect(rtlControl).toHaveCount(1); await expect(rtlControl).toBeEnabled(); → Retain exact assertion semantics. |
| 401 | expect(await owner.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); → Retain exact assertion semantics. |

### 'navigating away from a pending Unlisted dialog discards the capability outcome'

Canonical equivalent / retained invariant: Retain the complete original Music assertion matrix: publication truth versus account preference, read-only saved placement, explicit verifier, retry/replay identity, fresh confirmation, guest revocation and capability lifetime where asserted. All successful publication/public-integration assertions remain required; Epic6.1/6.3 canonical principal/public producers must deliver them. Ordinary Settings remains usable with Music unavailable.

Exact fixture contract change: Only navigation account preference reads/writes become canonical cookie GET /me and revision PATCH /account. Music credential/enrollment/publication/replay/guest protocols remain untouched. Auth user and account UUID scope must match actual verified canonical identity.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 412 | await owner.page.getByRole('button', { name: 'Save sharing', exact: true }).click(); await expect(owner.page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled(); → Retain exact assertion semantics. |
| 416 | await expect(owner.page.getByRole('textbox', { name: 'Music share link' })).toHaveCount(0); → Retain exact assertion semantics. |
| 417 | expect(state.apiCalls.filter(r => r.path === '/api/music/publication')).toHaveLength(1); → Retain exact assertion semantics. |
| 418 | expect(await owner.page.evaluate(() => [...Array(sessionStorage.length)].map((_, i) => sessionStorage.getItem(sessionStorage.key(i)!)).some(value => value?.includes('capability')))).toBe(false); → Retain exact assertion semantics. |

### 'admitted account mutation settles across mobile→desktop replacement before the next explicit pin'

Canonical equivalent / retained invariant: An admitted Books hide mutation survives mobile-to-desktop component replacement and holds the shared writer queue until its reply settles. Games pin remains disabled; attempted Space during settlement adds no write. After settlement, one new explicit Games pin merges the latest account rows: Books remains hidden/unpinned, Apps remains pinned, Profile remains first, Games is added. Exactly two ordered account mutations occur and zero Music publication commands occur.

Exact fixture contract change: Hold the canonical PATCH /account response after admission, preserving backend state and expectedRevision progression. Replace the two legacy variables.data checks with exact complete nine-row DTO patches and revisions; retain untouched Apps/display/public rows and final Books visibility. Supply complete public-and-published native Games eligibility. This case needs no Music publication producer; stored Apps placement is preserved without granting new Apps eligibility.

Fixture contract: canonical session/account/native complete owner responses and rejection of navigation GraphQL; preserve Music credentials/publication protocol and unrelated public adapters. Future prerequisite: Epic6.1/6.3 for full Music publication/public authority; ordinary unsupported successes additionally require category producers.

| Source line | Retained assertion / canonical equivalent |
| --- | --- |
| 430 | await expect(confirm).toBeVisible(); await confirm.click(); → Retain exact assertion semantics. |
| 432 | await owner.page.setViewportSize({ width: 1280, height: 900 }); await expect(owner.page.locator('.dashboard-content')).toBeVisible(); → Retain exact assertion semantics. |
| 434 | const pin = owner.page.getByRole('checkbox', { name: 'Pin Games Tab' }); await expect(pin).toBeDisabled(); await pin.press('Space'); → Retain exact assertion semantics. |
| 435 | await owner.page.waitForTimeout(250); expect(state.writes).toHaveLength(1); → Retain exact assertion semantics. |
| 436 | release(); await expect(pin).toBeEnabled(); await toggle(pin, true); await expect(pin).toBeEnabled(); → Retain exact assertion semantics. |
| 437 | expect(state.writes.map(r => r.variables.data)).toEqual([ → Navigation observations become canonical account UUID, cookie owner recognition, expectedRevision/category DTO patch; intended state and zero/unrelated-write assertions retained. |
| 442 | await expect(books).not.toBeChecked(); → Retain exact assertion semantics. |
| 443 | expect(state.apiCalls.filter(r => r.path === '/api/music/publication')).toEqual([]); → Retain exact assertion semantics. |

## Settings Music unit assertion scope amendment

Controller authorized Settings.music-publishing.test.tsx and musicPublishHarness.tsx canonical scope correction and ten navigation-writer assertion migrations. Credential/publication/verifier/no-write assertions retained verbatim. Every former variables.data expectation now checks the exact full nine-category request plus expectedRevision, preserving untouched display/public/pin rows.

| Original case | Before navigation expectation | Canonical equivalent |
| --- | --- | --- |
| outage saved-pin removal | pins Profile,Books only | revision1; full9 public rows unchanged, Music unpinned, Books pin0 |
| mismatched and hidden saved | same pins; Music No retained | revision1; full9 rows, Music false, Books pin0 |
| Make private recovery | Music No and remove Music saved pin | revision1; full9 Music false, Books pin0 |
| publishes from Settings and Music | Yes then No; cleanup only second write | revisions1 then2; full9 Yes retaining Music pin0/Books pin1 then No with Books pin0 |
| ordinary usable unenrolled/disabled/outage | Books No, only Books pin removed | revision1; full9 Books false/Music false; Music stored pin0 retained |
| public Music verifier before pin | Profile,Books,Music | revision1; full9 public flags preserved; Books pin0/Music pin1 |

Contained browser positive future Music cases are still required; unit scope/guard passes do not qualify Epic6.1/6.3 principal or public integration.

## Execution amendment: four Category B failure cases

The original read/write/lost/verification failure titles retain every assertion. Fault keys now target GET /api/explorers/v1/me and PATCH /api/explorers/v1/account. Verification fails the third owner read (transaction read, commit revision reread, post-write verification). The contained fixture records attempts separately from whether state committed, preserves state on write failure and commits once on response loss. Supplemental route8 and browser4 passed locally; exact-commit hosted and remaining family coverage are open. Detailed first failures and receipt limitations: .superpowers/sdd/epic-01/navigation-fault-reconciliation.md. Canonical Music descriptor alias recognition is fixture scope correction only, not canonical Music producer delivery.

## Execution amendment: canonical Category B payloads and persistence

Legacy documentId/data write assertions now require expectedRevision and all nine category rows, preserving untouched fields and display order; BEFORE-command snapshots establish expected revision. Original titles and future producer positives retained. Guest negative persistence check permits key absence or only exact inert {state:{},version:0}, while qrtoken must remain null; any credential/user/account/proof/authority field fails. This follows store partialize()=>({}) and requires final independent review. Books full sequence and four failure cases locally pass; Movies/Games snapshot fixture gaps and other cases remain open. See .superpowers/sdd/epic-01/category-b-preference-reconciliation.md for exact provenance and failure history.
