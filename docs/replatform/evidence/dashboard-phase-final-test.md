# Dashboard phase: final test round (WP12 / Wave 6)

Date: 2026-10-24. Plan: `docs/superpowers/plans/2026-10-23-dash-wave6.md`.

**Code under test: `c0dd8390` (main after #221, the last code merge before the deploy).**
Backend and integration lanes ran on `5808df08`. The only changes from there to `c0dd8390` are docs (#187, #188, #189) and #221, which is frontend-only (shared layout CSS + a geometry e2e). The orchestrator agreed the backend results stand. Every frontend lane was re-run on `c0dd8390`.

## Re-verify checklist (origin/main)

| Check | Result |
|---|---|
| Migration head | `0065`..`0071` present, `0071_explorers_samples` last |
| `x-migration-marker` | `0071_explorers_samples` |
| Freshness windows | `BACKUP_FRESHNESS_MS` 2 h, `DRILL_FRESHNESS_MS` 30 d, marker check at `platformRecoveryContract.ts:135` |
| Receipt marker on main | `0068_explorers_category_data_shape`. **Not the 0066 the plan expected.** The live head after the Wave 1/S2 deploy is 0068, so the drill must be at 0068 (orchestrator's call) |
| `explorers.yml` inputs | `confirm_cutover`, `image_digest` (unchanged) |
| `tunes.yml` | `publish_image`, `deploy_music`, job `publish-image` with `digest` output |
| Nightly lane set | browser-matrix 9, real-stack 8, apps-native (unchanged, 18 jobs) |
| `ci.yml` job names | unchanged |
| Taxonomy runbook path | `node dist/apply-reviewed-taxonomy.js` with `--env-file` |
| Curated catalogs | **4, not 5**: `books`, `games`, `apps`, `products` (`tunes/fixtures/taxonomy/reviewed-curated-20261023/`). The script accepts `places|people|books|games|apps|products`; there is no Movies catalog |
| Open package PRs | none (open: #113 Dependabot only) |

## Results per lane

| Lane | Where | Commit | Result | Duration |
|---|---|---|---|---|
| explorers-earth typecheck (`tsconfig.app.json`) | local | c0dd8390 | exit 0 | – |
| explorers-earth unit lane, serial (`--maxWorkers 1`) | local | c0dd8390 | 530/531 files, 5508/5509 tests. 1 fail = known `handleCooldown` en-GB locale test; it fails identically on 5808df08 (main) | 555 s |
| tunes typecheck (`shared/`, `server/`) | local | 5808df08 | 1 error, `server/services/youtube-playlist-import.ts:307`: pre-existing (file unchanged since March, no importers) | – |
| tunes unit (`server/test/`) | local | 5808df08 | 320/328 files, 6620 passed, 90 failed in 8 files = the known Windows baseline (shell/`whoami`/0600 tests: music-deploy-executable, explorers-production-env, music-local-state, music-cli-contract, 4 music config files). Green on Linux in CI (Backend validation 40085691759) | 138 s |
| tunes integration, argument-less (all `*.integration.test.ts`) | local PG15 C10 sidecar, port 55499 | 5808df08 | 73 passed + 7 env-gated skipped; 953 tests passed. 1 file (`music-runtime-role`) hit the Git Bash `whoami.exe` baseline; re-run alone from PowerShell: 28/28 pass | 538 s |
| test.yml selector drift | – | – | every 0065–0071 integration file is selected; the 22 unselected files are pre-phase and run in `tunes.yml` | – |
| Root script + frozen-seal tests (`node --test scripts/*.test.*`) | local | 5808df08 | 561 pass, 0 fail | 75 s |
| E2E Category A (contained-auth + category-navigation-a) | local, CI env | c0dd8390 | 6 + 19 passed | 3 min |
| E2E Category B (category-navigation-b + dashboard-layout) | local, CI env | c0dd8390 | 33 + 7 passed | 4.6 min |
| E2E Public shell | local, CI env | c0dd8390 | 11 passed | 2.4 min |
| E2E Music and account | local, CI env | c0dd8390 | 12 passed | 21 s |
| ci.yml / test.yml / tunes.yml / C0 on main | CI | c0dd8390 | all **success**: Explorers validation [40085691685](https://github.com/tandavkrishna27/explorers.earth/actions/runs/40085691685), Backend validation [40085691759](https://github.com/tandavkrishna27/explorers.earth/actions/runs/40085691759), API image [40085691748](https://github.com/tandavkrishna27/explorers.earth/actions/runs/40085691748), C0 [40085691721](https://github.com/tandavkrishna27/explorers.earth/actions/runs/40085691721) | – |
| Frontend E2E qualification (nightly), `lane=all` | CI | 5808df08 | **failure: 15 jobs red, 3 green** [40082968394](https://github.com/tandavkrishna27/explorers.earth/actions/runs/40082968394) | – |
| test.yml nightly (`lane=nightly`, load-chaos) | CI | c0dd8390 | dispatched [40087298163](https://github.com/tandavkrishna27/explorers.earth/actions/runs/40087298163); the last two scheduled runs (10-23, 10-24) failed `load-chaos` + `music-required` | – |

Local browser lanes ran with the ci.yml env. The default-config server moved to port 5193 because another session held 5173.

### Skipped-step check (plan Task 5 Step 3) on the c0dd8390 main runs

Every skip is by design. None hides a required step:
- Explorers validation: only "Upload screenshots/videos on failure" (runs on failure only).
- Backend validation: `load-chaos` job (runs only on `schedule` or `lane=nightly` dispatch; dispatched separately above).
- API image validation: `publish-image`, `release-preflight`, `deploy-production` and the image save/transfer steps (dispatch-only release path).
- Music C0: the per-OS matrix steps for the other OS.

### Nightly qualification: allowed-skip list against a real run

The plan's allowlist (the analytics/non-analytics step pair in real-stack) matched run 40082968394: no other step was skipped. The run is hollow-free but **red**:

| # | Root cause | Jobs | Class |
|---|---|---|---|
| 1 | Specs wait for a "New List" button / old pin label that the new list pages replaced | real-stack books, movies; general-pages | stale spec |
| 2 | Share payload now uses the owner title; hero chrome marker | public-theme-alignment, category-theme-alignment | stale spec (hero check needs a look) |
| 3 | no-strapi ROUTES table lacks the new `places/:listId`, `/add`, `/edit` routes | real-stack no-strapi | stale spec |
| 4 | Anonymous public profile makes 2 `/api` calls the fixture denies (`deniedAuthority=2`); editor tab names changed | profile-tabs, real-stack profile, remaining-contained-contracts | fixture vs. the known anonymous `get-session` call; tab names stale |
| 5 | Analytics `accountId` is a handle-shaped id; dashboard heading renamed | real-stack analytics, general-pages analytics | mixed, pre-dates WP7 |
| 6 | "Reactivate account" not shown in the deletion-recovery flow | real-stack lifecycle | **possible product defect**, red since 10-22 (pre-dates the dashboard phase; the 30-day grace change 5f3a020 gates that button) |
| 7 | Games fixture control endpoint 500 in `beforeEach` | real-stack games | fixture |
| 8 | `newCDPSession` on Firefox/WebKit | public-shell-cross-browser | test bug |
| 9 | Apps owned fixture refused (secret custody) | protected Apps manual | known custody blocker |

**This nightly has been red on every run since at least 10-18** (39094157323 … 40058933510), before most dashboard packages merged. That includes the run that preceded the last production deploy. None of the reds traces to #221 or to a dashboard data-path regression that the contained lanes or the integration suite missed. Fixing them is test-maintenance work across 9 root causes, out of scope for this round. I propose it as its own follow-up.

## Click-through at 1440 and 375 (c0dd8390)

Screens are in `docs/qa/wave6-final-2026-10-24/`, from the contained fixture (no real account):
- `home`, `hub`, `cat-<category>` for all 8 categories, `guide-new`, `list-people` at 1440 and 375. Soft checks on every page: no horizontal overflow, page container <= 720 px at desktop width, no error boundary, no page error. **All passed.**
- `1440-*` / `375-*` / `375-add-*`: the dashboard-layout lane geometry shots (container, pill and header clearance).
- `overflow-*`: #221's phone sweep of every list, populated list, sample list and add page at 375.

Compared with mocks v3/v4/v5:
- Category pages show the Top Picks hero card, the "New list" tile and the bottom "New list" button.
- The publish pill sits right of the header on phones and is centred in the 720 px container on desktop.
- The phone bottom nav is clear.

Limits, stated plainly:
- Direct list URLs are not seeded in the contained fixture ("List not found"), and the add routes there are the layout harness. Those pages are covered by the `overflow-*` sweep and the WP6–WP11 screenshot sets (`docs/qa/wp8-add-pages-2026-10-24`, `wp9-guides-2026-10-23`, `docs/superpowers/screenshots/wp11`), not by a fresh real-stack walk.
- Home's `content-summary` and analytics feed are not mocked by the fixture, so the Home stat tiles show "–" and "Unavailable". That is fixture data, not a defect.
- A live walk on the real stack is the post-deploy UAT (plan Task 12).

P2 cosmetic: on the 375 layout-harness People list, the list title and item titles render in a dark colour on the dark theme. This is the #221 harness page. Check it on the real list during live UAT.

## Defects and fix status

| Defect | Severity | Status |
|---|---|---|
| None found in the dashboard phase code by the local lanes, integration suite or click-through | – | – |
| Nightly red (9 root causes above) | blocks a "nightly green" claim, not the deploy | **open**, proposed follow-up (pre-existing) |
| Lifecycle: "Reactivate account" missing in the deletion-recovery flow (nightly #6) | possible P1, outside the dashboard phase | **open**. The owner checks it in LIFE-02/LIFE-04 live; if confirmed, a forward-fix |
| `youtube-playlist-import.ts:307` type error | none (dead file) | open, pre-existing |

No fix PR: no regression in the dashboard phase code was found, so nothing was fixed.

## Owner step 1: apply the curated category lists (on the host, after the deploy)

There are four catalogs (no Movies). For each: run a dry run first, read it, then apply.

```bash
C="sudo docker compose -f /opt/explorers/production.compose.yml --env-file /opt/explorers/production.env --env-file /opt/explorers/image.env"
for cat in books games apps products; do
  $C run --rm --no-deps migrate node dist/apply-reviewed-taxonomy.js --category "$cat" --dry-run
done
# only after each dry run reads as expected:
$C run --rm --no-deps migrate node dist/apply-reviewed-taxonomy.js --category books    --apply --reviewed-by "<owner name>"
$C run --rm --no-deps migrate node dist/apply-reviewed-taxonomy.js --category games    --apply --reviewed-by "<owner name>"
$C run --rm --no-deps migrate node dist/apply-reviewed-taxonomy.js --category apps     --apply --reviewed-by "<owner name>"
$C run --rm --no-deps migrate node dist/apply-reviewed-taxonomy.js --category products --apply --reviewed-by "<owner name>"
```

Expected dry run per category: `"observedCatalogVersion":0,"catalogVersion":1,"changed":true`, `"conflicts":[]`, `term:add` = books 26, games 20, apps 20, products 20. Apply prints `"mode":"apply"` and a `receiptId`; record each. A second apply prints `"changed":false`. **Stop that category** if `conflicts` is non-empty or `observedCatalogVersion` is not 0.

If People sectors were not applied on the live host before, `--category people --dry-run` shows `"changed":true`. Apply it the same way. `"changed":false` means it is already done.

## Owner step 2: owner-only UAT cases (UAT-08)

The scope says 55. The UAT board (`cases` with `status=blocked`) holds **53** today; 2 were resolved in the 2026-10 live UAT. Run them on https://explorers.earth after the deploy and mark each on the board.

| Case | Title | Needs |
|---|---|---|
| ANL-04 | Empty and error states | needs a new account with no data and devtools request blocking |
| ANL-X03 | World map shows fewer countries than the top-countries chart | needs seeded views from India, Germany and UK (only India traffic exists) |
| APP-03 | Enrichment panel | Enrichment source |
| AUTH-01 | Google sign-in, new user | Google OAuth |
| AUTH-02 | Google sign-in, returning complete user | Google OAuth |
| AUTH-05 | Logout | logging out ends the only test session and signing back in needs Google sign-in, which the agent may not do |
| AUTH-06 | Cross-tab logout | needs logout + Google re-sign-in |
| AUTH-07 | Server sign-out failure and retry | needs devtools request blocking, logout and Google re-sign-in |
| AUTH-08 | Account A to B to A in one browser | Google OAuth |
| AUTH-09 | Session error retry | needs a devtools response override that survives a reload (not available to the agent) |
| AUTH-X01 | Coming back after a long idle | needs a multi-hour idle period |
| GDE-X02 | Non-owner opening another owner's guide edit URL sees an empty wizard | needs a second owner account (Owner B) |
| I18N-03 | Locale follows the account | Google OAuth |
| I18N-X02 | Native-speaker check of key languages | Native speakers |
| LIFE-01 | Deactivate | owner to run (destructive account action) |
| LIFE-02 | Recover after deactivation | Google OAuth |
| LIFE-03 | Delete account | owner to run (destructive account action) |
| LIFE-04 | Cancel deletion via recovery | Google OAuth |
| LIFE-05 | Recovery edge cases | Google OAuth |
| LIFE-06 | Delete form validation | owner to run (inside the delete-account flow) |
| LIFE-X01 | Delete and deactivate flow clarity | owner to run (delete/deactivate flows) |
| LIFE-X02 | 30-day deletion grace | owner to run |
| MED-02 | Another owner cannot use your media | needs a second owner account |
| MKT-X02 | Legal pages have no placeholders | Owner's legal copy |
| MKT-X03 | Privacy page matches what the site does | Owner's legal copy |
| MOV-04 | Provider unavailable | needs the TMDB key removed or the provider blocked in production (server-side) |
| ONB-01 | Complete the three steps | Maps key for address autocomplete |
| ONB-02 | Handle validation rules | ab -> 400, 31-char -> 400, 1234/-abc/ab--c/ADMIN/admin/settings/profane word -> available:false |
| ONB-03 | Taken handle and availability outage | needs a new user in the wizard |
| ONB-04 | Required fields per step | needs a new user |
| ONB-05 | Reload and logout mid-wizard | needs a new user plus logout and Google re-sign-in |
| ONB-06 | Double-click finalize | needs a new user |
| ONB-07 | Incomplete user deep links | Partial: finished user (smoketest1021) opening /onboarding is sent to /home (pass) |
| ONB-08 | Image limits in onboarding | needs a new user |
| ONB-X01 | Onboarding drops the postal code | needs a fresh onboarding |
| ONB-X02 | Handle suggestions repeat the reserved word | suggestions only render in the new-user wizard |
| ONB-X03 | Google name and photo prefilled | A fresh Google account |
| PLC-X06 | Public Places landing crashes entirely when the map library fails | needs the Maps library to fail (dummy key) |
| PLC-X07 | Public per-list map page crashes when Maps key is rejected | needs a rejected Maps key |
| PRD-X01 | Specification rows overflow on mobile | a signed-in 390 px viewport cannot be produced in the agent's browser (see XC-01) |
| PRF-07 | Handle change | owner to run (handle change is a destructive account action) |
| PRF-X01 | First click on Save & Publish is lost after typing a handle | owner to run (exercises the handle-change flow) |
| PRF-X02 | Old handle is released immediately after a change | owner to run (needs a handle change) |
| PRF-X05 | Handle change keeps old links working | A second Google account |
| PROD-07 | Other browsers and devices | A real phone |
| PROD-08 | Health and nightly backup | Server access |
| PUB-07 | Same slug for two owners | needs a second owner account |
| SEC-01 | Another owner's edit pages | needs a second owner account |
| SEC-X02 | Foreign movie edit URL shows a blank page | needs a second owner account |
| SEC-X03 | Books edit URL for a missing or foreign book shows a blank page | needs a second owner account for the foreign-book half |
| XC-01 | Desktop to mobile resize | resizing the Claude in Chrome window did not change the page viewport (innerWidth stayed 1920 at window 760 px |
| XC-03 | Slow network | no network throttling available in Claude in Chrome |
| XC-X01 | Half-filled form is reset when the window crosses 768 px | same tooling limit as XC-01 (viewport did not cross 768 px) |

## Go / no-go

**GO for the deploy of `c0dd8390`, on these conditions** (the restore drill, image publish and deploy belong to the orchestrator):
1. Drill at the **live head 0068**: main's receipt already says 0068, not the plan's 0066. The orchestrator confirms the live marker before deciding whether the receipt is reusable or needs a re-drill (30-day window).
2. The test.yml nightly dispatch 40087298163 is reviewed. If `load-chaos` fails the same way as the 10-23/10-24 scheduled runs, it is pre-existing.
3. The owner checks LIFE-02/LIFE-04 (deletion recovery) on live right after the deploy.

Reasons:
- Every merge-gate lane is green on the final code: unit, integration, the four browser lanes, seal tests and main CI.
- The nightly red is long-standing test debt that already preceded the previous deploy, and none of it traces to the dashboard data paths.
