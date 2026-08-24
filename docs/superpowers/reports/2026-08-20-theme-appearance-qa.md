# Theme & Appearance QA Report

**Current status:** LOCAL IMPLEMENTATION AND NO-WRITE QA PASS — authenticated live publishing is pending separate action-time approval.

**Pending live target:** `tk2727` (not written during the current implementation run)

**Dashboard:** `http://localhost:5173/profile`

**Public route:** `http://localhost:5173/tk2727`

## Current Implementation Evidence

### Deterministic code, unit, and build gate

| Check | Current result |
|---|---|
| Focused unit files | `10/10` PASS |
| Focused tests | `144/144` PASS |
| Complete frontend unit suite | `118/118` files and `867/867` tests PASS |
| TypeScript | `npx tsc -b` PASS |
| Production build | PASS; `5,284` modules transformed |
| Main production JavaScript chunk | `6,653.17 kB` uncompressed |
| Landing i18n | `47/47` language catalogs PASS |

The focused unit gate covers normalization, all `9!` category-order permutations, Dashboard layout/order/First-view controls, lossless nested JSON merges, direct/deferred/cancelled/failed/retried save outcomes, semantic cards and category routes, progressive recommendation states, and public tab resolution.

### No-write browser matrix

| Surface | Current result |
|---|---|
| Six public presets × three recommendation layouts × two viewports | `36/36` compositions PASS |
| Public state suite | Loading, true empty, partial failure, data+error, all-error/retry, and rapid retry lock PASS |
| Responsive widths | `320`, `375`, `639`, `640`, `767`, `768`, `1024`, and `1440` px PASS |
| Content resilience | 64-character title, 30% expanded copy, zero/one/many/`500+` counts, missing image, broken image PASS |
| Accessibility | Semantic tabs/links, roving focus, Home/End/arrow/activation behavior, ≥44px rendered targets, primary text ≥4.5:1, focus ≥3:1, RTL, 200% text zoom, and reduced motion PASS |
| Privacy/query boundary | Explicitly disabled categories issued no category query PASS |
| Dashboard appearance | New controls rendered in both light and dark Dashboard modes PASS |
| Malformed legacy data | Invalid theme values and malformed Business JSON fell back without crashing PASS |

The intercepted browser suite made zero authenticated requests and zero profile mutations. Screenshots, video, trace, HAR, headers, and tokens were not persisted.

### Current pairwise live-write dry run

The deterministic generator now spans all values of six factors: preset (`6`), accent (`6`), wallpaper (`4`), First view (`12`, including distinct Places), recommendations layout (`3`), and representative order shape (`4`).

| Metric | Current result |
|---|---|
| Generated matrix | `72` deterministic rows |
| Value coverage | Every value PASS |
| Cross-factor pair coverage | Every pair PASS |
| Required layout/order/preferred witnesses | PASS |
| Matrix publishes if approved | `72` |
| Controlled sentinel setup | `1` publish |
| Normal exact restore | `1` publish |
| Optional emergency cleanup | At most `1` publish, only after normal restore failure |
| Estimated normal run | `12` minutes |

The live test is gated on all three explicit values: `E2E_PROFILE_USERNAME`, `E2E_PROFILE_STORAGE_STATE`, and `E2E_PROFILE_LIVE_WRITES=1`. Its no-credential gate was exercised and skipped without navigation. The cleanup guard was separately forced through normal-restore failure and proved one emergency restore, post-restore verification, and original-error propagation.

## Historical Pre-Fix Live Batch (Preserved Evidence)

The remainder of this report records the earlier 66-row live batch that found the hardcoded landing-tab defect. It predates the current implementation and is retained as before-fix evidence; statements below saying the defect remained were accurate for that older run, not for the current local code.

### Historical Coverage Design

- Literal Cartesian matrix: `6 × 6 × 4 × 11 = 1,584` unique combinations.
- Pairwise alternative: 66 rows covering all 260 value pairs across the four dimensions.
- The two scopes are intentionally separate; pairwise coverage is not reported as exhaustive.

## Build and Test-Surface Checks

- `npm run build`: PASS.
- Modules transformed: 5,279.
- Main production JavaScript chunk: 6,630.78 kB uncompressed.
- Fresh Vite development loads kept `#root` empty while more than 10,000 module requests were processed. The production bundle was served on the same `localhost:5173` origin so the authenticated browser session could be preserved for QA.
- The build generator touched `public/sitemap.xml`; only the generated unstaged line-ending delta was removed, preserving the user's pre-existing staged content.

## Authoritative Saved Baseline

The Dashboard was loaded from a clean production-bundle document before these values were read. No unsaved pre-reload state was used.

| Dimension | Saved Dashboard value |
|---|---|
| Preset | `cinematic-dark` |
| Accent | `#10B981` |
| Wallpaper | `banner-top` |
| Landing | `all-recommendations` |

## Public Baseline

| Assertion | Actual |
|---|---|
| `--bg-page` | `#090D16` |
| `--bg-card` | `#111827` |
| `--border-card` | `rgba(255, 255, 255, 0.1)` |
| `--text-primary` | `#FFFFFF` |
| `--text-secondary` | `#9CA3AF` |
| `--accent-color` | `#10B981` |
| `--nav-bg` | `rgba(42, 42, 42, 0.9)` |
| Cover image count | `1` |
| Full-wallpaper image count | `0` |
| Ambient-gradient layer | absent |
| Selected public tab | `Recommendations` |
| Rendered panel | Places/recommendations content |

Dashboard and public baseline agree for preset tokens, accent, wallpaper, and the default landing behavior.

## Pre-Run Defect Evidence

`explorers-earth/src/features/PublicHome/components/PublicProfile.tsx:275` initializes the public tab to `"recommendations"`. The public component does not read `theme_settings.landingTab`, so the live run is expected to reproduce landing-selection failures. Assertions will retain the specified expected behavior instead of accepting the current implementation.

## Live Batch Results

Approved scope: 66 pairwise Save & Publish operations plus one baseline restore publish.

| Metric | Result |
|---|---|
| Pairwise rows attempted | `66/66` |
| Pairwise rows published | `66/66` |
| Cross-setting pairs represented by the matrix | `260/260` |
| Restore publishes | `1/1` |
| Detailed per-row result objects retained | `60/66` |
| Retained preset-token checks | `60/60` PASS |
| Retained accent checks | `60/60` PASS |
| Retained wallpaper checks | `60/60` PASS |
| Non-default landing checks | `0/60` PASS |
| Final restore public check | PASS |

No preset, accent, or wallpaper mismatch was observed anywhere in the completed run. The browser runner reset after the first group and discarded six early in-memory result objects, so only 60 of the 66 rows retain complete machine-readable assertion records. Those six publishes are included in the publish count but are not silently counted as retained visual passes.

Seven transient browser-control failures occurred before Save was clicked. Each was marked as a pre-save error and retried; they did not create extra publishes.

### Landing behavior by saved value

| Saved `landingTab` | Live rows | Backend persisted | Public page on load |
|---|---:|---|---|
| `all-recommendations` | 6 | yes | Recommendations where conclusively retained; this is also the hardcoded default |
| `music` | 6 | yes | Recommendations in all six checks |
| `guides` | 6 | yes | Recommendations in all six checks |
| `movies` | 6 | yes | Recommendations in all six checks |
| `books` | 6 | yes | Recommendations in all six checks |
| `games` | 6 | yes | Recommendations in all six checks |
| `apps` | 6 | yes | Recommendations in all six checks |
| `products` | 6 | yes | Recommendations in all six checks |
| `people` | 6 | yes | Recommendations in all six checks |
| `gallery` | 6 | yes | Recommendations in all six checks |
| `business` | 6 | yes | Recommendations in all six checks |

The backend was queried anonymously after each non-default six-row group and returned the expected final `landingTab` value. Gallery and Business are real tabs on this public profile, so their failures prove the landing setting is ignored during public-page initialization rather than merely referring to unavailable content.

## Defect: Public page ignores the saved landing choice

**Severity:** High for the Theme & Appearance feature; every non-default landing choice is ineffective on this account.

**Smallest reproducer:**

1. Open `/profile` and expand Theme & Appearance.
2. Select `Business Details` as the landing page.
3. Click Save & Publish.
4. Confirm the backend stores `landingTab: "business"`.
5. Reload `/tk2727`.

Expected: Business Details has `aria-selected="true"` and its panel is rendered.

Actual: Recommendations has `aria-selected="true"` and the recommendations panel is rendered.

Root-cause evidence: `explorers-earth/src/features/PublicHome/components/PublicProfile.tsx:275` initializes `activeTab` to `"recommendations"`; the component never maps `theme_settings.landingTab` into that state. The default Recommendation result is therefore not evidence that the saved default was consumed.

## Evidence Limitations

- This was the approved 66-row pairwise option, not the literal 1,584-publish Cartesian run.
- The planned local 1,584-state test fixture was not created or run during this live QA pass.
- Six early per-row result objects were lost during a browser-control reset. Three default-landing rows were separately observed passing, two completed their checks before their booleans were lost, and one immediate default-landing result was inconclusive because the public bundle had not mounted before timeout.
- Dashboard controls were re-read before every publish. A clean Dashboard reload was performed for the final restore, not after every test row. Backend group checkpoints and refreshed public rendering supplied persistence evidence during the batch.

## Restore Status

The following baseline was restored with the 67th and final Save & Publish operation:

```json
{
  "preset": "cinematic-dark",
  "accentColor": "#10B981",
  "wallpaperMode": "banner-top",
  "landingTab": "all-recommendations"
}
```

Final proof:

| Surface | Verified value |
|---|---|
| Dashboard after clean reload | Cinematic Dark / Emerald / Banner Top / Recommendations |
| Backend | `cinematic-dark` / `#10B981` / `banner-top` / `all-recommendations` |
| Public CSS and wallpaper | Baseline tokens restored; cover present; no full wallpaper or ambient layer |
| Public selected tab | Recommendations |

No product source fix was made during this QA run; the defect remains isolated and reproducible for a separate implementation pass.
