# explorers.earth Production QA Report - Three Remaining Categories

Date: 2026-07-09
Environment: Production (`https://explorers.earth`)
Browser: Logged-in in-app browser
Scope: Places, Guides, Music

## Summary

Status: Production QA pass complete; Music frontend auth fix deployed, but live sync still blocked

| Category | Result | Notes |
| --- | --- | --- |
| Places | Partial / blocked at submit | Page, form, empty validation, and autocomplete keyboard selection work. Final submit showed no loading, validation, or navigation after coordinate, DOM-node, and Enter submit attempts. |
| Guides | Partial / blocked in wizard | Page and step 1 work. Step 2 category/budget controls work, but month/category picker state is unstable and the wizard did not reach step 3 in this run. |
| Music | Blocked after deploy | Page shows `Could not connect to Local Tunes` and `Failed to sync user with database`; no create controls are available. A frontend auth-client bug was fixed and deployed, but production still returns the same sync failure. |

## Places

Route tested: `https://explorers.earth/recommendations/places`

Passed:

- Correct route hydrates and shows existing `Hyderabad` and `Singapore` place lists.
- `/places` itself returns 404, but the app navigation uses `/recommendations/places`.
- `Add Location` opens the modal form.
- Empty submit shows `List Name is Required` and `Url name is Required`.
- Manual typing no longer leaves the field empty; previous misleading validation bug remains fixed.
- Google autocomplete suggestions are created for `Bengaluru`, and keyboard selection updates the input to a real place value.

Blocked:

- Final `Add Location` submit did not show loading, inline validation, toast text, or navigation after repeated attempts.
- Manage/edit/share checks could not be reached for the new QA place because creation did not complete.

Console:

- Repeated Google Maps legacy Autocomplete warnings.
- Apollo cache warning for `usersPermissionsUser` missing IDs/custom merge function.
- No white screen or fatal JavaScript error observed.

## Guides

Route tested: `https://explorers.earth/guides` and `https://explorers.earth/guides/new`

Passed:

- Guides page hydrates and shows an existing guide card.
- `Create Guide` opens `/guides/new`.
- Empty Step 1 validation shows `Please select a guide type`.
- Selecting `Itinerary` and choosing a real `Leh 194101` autocomplete location advances to Step 2.
- Budget dropdown opens and supports selecting `Budget`.
- Category dropdown opens and supports selecting categories; validation shows minimum count until at least four are selected.

Blocked:

- Month picker selection was unstable during the run: a selected month appeared, then later cleared while interacting with category controls.
- The wizard did not reach the final creation step in this run, so guide creation/detail/manage could not be verified.

Console:

- Same Apollo cache warning and Google Maps Autocomplete warnings as Places.
- No white screen or fatal JavaScript error observed.

## Music

Route tested: `https://explorers.earth/music`

Blocked:

- Page hydrates but shows `Could not connect to Local Tunes`.
- Secondary message: `Failed to sync user with database`.
- No create/list/item controls are available while the sync fails.

Frontend root cause fixed:

- `syncLocalTunesUser` used raw `axios.post` for `/api/auth/sync`, bypassing the configured `localTunesClient` interceptor that attaches the persisted explorers JWT and `X-Username` header.

Fix/deploy status:

- Patched in `explorers-earth/src/services/localTunesService.ts`.
- Added regression test `explorers-earth/src/services/__tests__/localTunesService.sync.test.ts`.
- PR #81 was merged and deployed successfully.
- Post-deploy clean load used new production bundle `index-FjxRHQ5L.js`.
- Production `/music` still shows `Could not connect to Local Tunes` and `Failed to sync user with database`.

Remaining assessment:

- The browser confirms the deployed frontend bundle is current, so the remaining Music blocker is not stale frontend code.
- The next investigation should inspect the Local Tunes `/api/auth/sync` backend logs and response for this Strapi user/JWT. The visible frontend error is the backend/app-level message, not a white screen.

## Issues

1. Music sync still fails after authenticated frontend client fix.
   - Severity: High
   - Status: Frontend fix deployed; backend/sync investigation still required
   - Evidence: Production `/music` is blocked before create controls on fresh deployed bundle `index-FjxRHQ5L.js`.

2. Places final add-location submit has no observable result.
   - Severity: Medium
   - Status: Needs deeper frontend/form investigation
   - Evidence: Valid-looking form remains open after coordinate click, DOM-node click, and Enter submission attempts.

3. Guides Step 2 picker state is unstable.
   - Severity: Medium
   - Status: Needs deeper wizard/component investigation
   - Evidence: Month selection appeared then cleared during category interaction; wizard did not progress to final creation step.
