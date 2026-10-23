# WP5 before/after measurements (OWN-17, OWN-19)

Date: 2026-10-23. Machine: owner's Windows 11 workstation.

## How it was measured

- **Browser cases** use `explorers-earth/e2e/perf/save-latency.spec.ts`. It runs inside the owned Movies fixture. The fixture script is hash-pinned by the seal tests in `scripts/replatform-e2e.test.mjs`, so its `--focus perf` option is not committed. To reproduce, apply it locally with `git apply explorers-earth/e2e/perf/movies-fixture-perf-focus.diff.txt`, then run `cd tunes && npx tsx scripts/movies-browser-fixture.ts --ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15 --focus perf`, then `git checkout tunes/scripts/movies-browser-fixture.ts`. That fixture provides a disposable PG15, the real API, a production build of the SPA, a seeded owner and a fake TMDB.
- Chromium CDP adds **185 ms latency** to every request, which matches the live round trip.
- Each side ran 3 times. "Before" is a worktree of `origin/main` @ `ee939904` with only the harness files copied in. "After" is this branch.
- **Server cases** come from integration tests on a real Postgres 15 (`movie-media-import.integration.test.ts`, `recommendation-media-batch.integration.test.ts`).
- **The Places case is counted from the code and unit tests, not timed in a browser.** No Places fixture lane can be booted locally with a seeded owner.

## Results

| Case | Before | After | Target (phase plan) |
|---|---|---|---|
| Provider movie add: Save click → list page (185 ms RTT) | 1416 / 1455 / 1406 ms, **median 1416** | 429 / 423 / 439 ms, **median 429** | ≤ 1.5 s: **met** |
| List page reached before the image import finished | no, 0/3 | yes, 3/3 | navigation before import |
| Movie image copy, 12 slots, fake fetch 185 ms per image (server) | 3418 ms, peak 1 fetch in flight | 1196–1602 ms, peak 3 | ~3× faster: **~2.1–2.9×** |
| Receipt progress writes per 12-slot import | 84 (7 per image) | 16 (1 per image + 1 per batch) | one write per image |
| Home: `GET /me` per load (185 ms RTT) | 3 / 3 / 4 | 1 / 1 / 1 | one `/me`: **met** |
| Home: time to network idle | 13305 / 13215 / 13456 ms | 13383 / 13357 / 13439 ms | −~600 ms: **not met** (see note) |
| Place add with 3 photos: owner-view reloads (each 1 + N + 1 GETs) | 5 | 1 | no reload until the end: **met** |
| Place add with 3 photos: requests that run in sequence | 3 uploads + create + attach GET + PATCH | 3 uploads in parallel, then create | — |
| Recommendation media write, 10 media | 11 statements, median 12.5 ms | 2 statements, median 2.35 ms | batched: **met** |

### Notes

- **Home wall time did not improve in this harness.** Time to network idle (~13.3 s) is dominated by about 144 other requests from the fixture's heavily seeded second owner's content, so the two `/me` round trips saved are lost in the noise. The live chain from the root-cause doc was get-session → `/me` ×3 in sequence → snapshots. There, the removed `/me` reads were on the critical path, so the live re-measure (WP12 step 7) is the real test of the −600 ms target.
- **The after movie add makes 8 requests instead of 5, on purpose.** The list page's own reads now start while the import is still running.
- **The places "after" count assumes uploads succeed.** A failed upload now stops before the create, so nothing is created, and a retry uploads only the missing photos.

## Raw lines

Before (`origin/main` ee939904):

```
{"case":"movie-add","saveToListMs":1416,"saveToImportDoneMs":1221,"listBeforeImport":false,"requests":5}
{"case":"home","networkIdleMs":13305,"me":3,"requests":146}
{"case":"movie-add","saveToListMs":1455,"saveToImportDoneMs":1260,"listBeforeImport":false,"requests":5}
{"case":"home","networkIdleMs":13215,"me":3,"requests":146}
{"case":"movie-add","saveToListMs":1406,"saveToImportDoneMs":1206,"listBeforeImport":false,"requests":5}
{"case":"home","networkIdleMs":13456,"me":4,"requests":147}
```

After (this branch):

```
{"case":"movie-add","saveToListMs":429,"saveToImportDoneMs":1056,"listBeforeImport":true,"requests":8}
{"case":"home","networkIdleMs":13383,"me":1,"requests":144}
{"case":"movie-add","saveToListMs":423,"saveToImportDoneMs":1046,"listBeforeImport":true,"requests":8}
{"case":"home","networkIdleMs":13357,"me":1,"requests":144}
{"case":"movie-add","saveToListMs":439,"saveToImportDoneMs":1046,"listBeforeImport":true,"requests":8}
{"case":"home","networkIdleMs":13439,"me":1,"requests":144}
```

Live baseline (root-cause doc, 2026-10-22): Home ≈ 1.4 s of sequential requests before content (get-session 226 ms → `/me` 233 → 209 → 432 ms → snapshots); movie provider add 3–10 s perceived; place add with k photos = (k+1) owner reloads plus PATCH + GET to attach.
