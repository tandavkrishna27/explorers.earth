# Task 2 report: Explorer critical coverage boundary tests

Date: 2026-08-29

Branch: `codex/profile-settings-tabs-rebase-20260828`

Scope: test-only code changes to `explorers-earth/src/features/music/__tests__/publicMusicClient.test.ts`, plus this evidence report

## Outcome

The Explorer critical coverage lane now passes at 100% statements, branches, functions, and lines, both per file and in aggregate. The repair adds behavioral boundary tests; it does not change `publicMusicClient.ts` or any other production file, and it performs no live service calls or writes.

## Initial RED and authoritative V8 audit

Command:

```text
npm run test:music-critical-coverage
```

Result: exit 1. All 16 test files and all 369 tests passed, but the coverage threshold failed.

| Scope | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| Aggregate | 96.99% (871/898) | 95.65% (770/805) | 100% (192/192) | 99.31% (726/731) |
| `publicMusicClient.ts` | 86.08% | 79.16% | 100% | 96.59% |

The text reporter listed uncovered lines `55, 99, 165-166, 243`. A second run with the same V8 lane plus `--coverage.reporter=json` established the exact uncovered locations from `coverage-final.json`.

Uncovered statements (27):

```text
55:4-55:null
99:4-99:null
153:58-153:null
154:31-154:null
155:31-155:null
165:4-165:null
166:4-166:null
227:61-227:null
233:62-233:null
234:35-234:null
235:24-235:null
238:55-238:138
238:138-238:163
240:31-240:116
240:116-240:143
243:8-243:null
271:45-271:null
276:59-276:null
283:29-283:111
283:111-283:205
287:59-287:null
294:29-294:111
294:111-294:205
298:111-298:null
300:30-300:null
305:29-305:111
305:111-305:205
```

Uncovered branch arms (35):

```text
3[0] if 54:2-56:null
5[1] binary-expr 79:35-79:59
5[2] binary-expr 79:59-79:null
18[0] if 98:2-100:null
22[0] if 153:2-153:null
24[0] if 154:2-154:null
25[0] if 155:2-155:null
27[0] if 160:2-160:null
28[0] if 161:2-161:null
29[0] cond-expr 165:140-165:149
29[1] cond-expr 165:149-165:198
30[0] binary-expr 165:73-165:99
30[1] binary-expr 165:99-165:140
31[0] cond-expr 165:178-165:191
31[1] cond-expr 165:191-165:198
32[0] cond-expr 172:69-172:77
33[1] binary-expr 172:18-172:69
41[0] if 191:2-191:null
48[0] if 227:6-227:null
49[1] cond-expr 230:34-230:null
50[0] if 233:6-233:null
52[0] if 234:6-234:null
53[0] if 235:6-235:null
54[0] if 240:8-240:null
67[0] if 271:13-271:null
68[0] if 276:6-276:null
71[0] cond-expr 280:119-280:132
72[0] if 283:6-283:null
73[0] if 287:6-287:null
76[0] cond-expr 291:121-291:134
77[0] if 294:6-294:null
78[0] if 298:6-298:null
80[0] if 300:6-300:null
81[0] if 305:6-305:null
82[1] binary-expr 311:65-311:null
```

## RED to GREEN progression

| Checkpoint | Focused result | Exact critical result | `publicMusicClient.ts` S/B/F/L | Aggregate S/B/F/L |
|---|---:|---:|---:|---:|
| Initial RED | Existing tests green | 369/369 tests; threshold RED | 86.08 / 79.16 / 100 / 96.59 | 96.99 / 95.65 / 100 / 99.31 |
| Resource invariants and resource telemetry | 65/65 | 377/377 tests; threshold RED | 87.62 / 82.14 / 100 / 97.95 | 97.32 / 96.27 / 100 / 99.58 |
| Descriptor guards and telemetry | 75/75 | 387/387 tests; threshold RED | 92.26 / 86.90 / 100 / 98.63 | 98.32 / 97.26 / 100 / 99.72 |
| Request matrices | 100/100 | 412/412 tests; branch threshold RED | 100 / 99.40 / 100 / 100 | 100 / 99.87 / 100 / 100 |
| Module-base matrix | 102/102 | 414/414 tests; GREEN | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |

The first focused run of the resource batch had one expected fixture-design failure: the nominally empty protected queue fixture still exposed `currentlyPlaying` while both queue and playback permissions were false. The production parser correctly rejected it. The fixture was narrowed by setting `currentlyPlaying` to `null`, after which the batch passed. This did not reveal or authorize a production change.

## Behavioral matrices added

- Playlist envelope total/truncation inconsistencies, invalid history status/timestamp states, and canonical empty protected queue/history/playlist envelopes.
- Request endpoint HTTP mapping for 400, 403, 404, 409, 413, 429, and 503; valid and invalid request IDs; retry values capped at 300 seconds or defaulted safely for negative/non-finite inputs.
- Oversized, invalid-UTF8, malformed-JSON, and missing request bodies, with exact safe `size`, `encoding`, or `json` observability reasons.
- Search, video URL, request-song, slug, idempotency, canonical-song, and strict response-schema guards, all asserting public error codes and pre-network rejection where applicable.
- Descriptor input, status, retry, request-ID, JSON, and schema guards.
- Signal and no-signal request construction, plus configured and packaged-default module base URLs.
- Operational events are asserted through the real observability adapter and checked to exclude hostile response data, capability-shaped values, authority tokens, and service-base values.

Each matrix asserts consumer-visible behavior or the public boundary contract. No test was added solely to call a line, and network doubles are confined to the external `fetch` boundary.

## Final verification

| Command | Result |
|---|---|
| `npx vitest run src/features/music/__tests__/publicMusicClient.test.ts` | PASS: 1 file, 102 tests |
| `npm run test:music-critical-coverage` | PASS: 16 files, 414 tests; aggregate 898/898 statements, 805/805 branches, 192/192 functions, 731/731 lines |
| `npm run test:unit` | PASS: 190 files, 1,961 tests |
| `npm run lint` | PASS (exit 0): 0 errors, 1,377 existing warnings |
| `npx eslint src/features/music/__tests__/publicMusicClient.test.ts` | PASS: no findings |
| `npm run build` | PASS: landing checks, static generation, TypeScript, Vite, and HTTPS-only Music transport check |
| `git diff --check` | PASS |

The full unit run emits existing jsdom diagnostics for unimplemented canvas/scroll methods and the intentional `AppErrorBoundary` throw case. The production build emits existing bundle-size, CommonJS, and ineffective-dynamic-import warnings. None caused a failure or originated in the modified test.

Build verification regenerated sitemap dates. The generated `public/sitemap.xml` diff was inspected and restored, leaving no build artifact or production-file change in the task diff.

## Production changes and concerns

- Production code changes: none.
- Live services or writes: none; all transport behavior uses stubbed `fetch` responses.
- Product defects found: none. The only failed new assertion was the isolated fixture-design issue documented above.
- Residual concern: repository-wide lint/build/unit diagnostics remain noisy but are pre-existing and non-blocking; the modified test file is lint-clean.

## Independent review

Independent review of commit `5286b4a` returned two evidence-quality findings:

1. Secret-leak assertions covered observability but did not exhaustively inspect every error-visible and serializable surface.
2. Signal coverage did not behaviorally assert omitted-property absence and complete fetch init for discover, search, and video URL methods.

Both findings are addressed in fix round 1 below. Final approval remains subject to scoped re-review of the separate fix commit.

## Fix round 1: hostile error surfaces and fetch-init contracts

### Intentional RED

A test-only `PublicMusicError` surrogate preserved the expected `PUBLIC_UNAVAILABLE` code, name, and message while leaking `secret-surrogate-token` through `cause.responseBody` and an enumerable `diagnostic` field. The initial shallow helper checked only the primary fields, so this command failed as intended:

```text
npx vitest run src/features/music/__tests__/publicMusicClient.test.ts -t "rejects an error surrogate"
```

Result: exit 1, 1 failed and 102 skipped. Failure: `expected [Function] to throw an error`. This proved the pre-fix assertion could accept a leaking error shape.

### GREEN

The reusable test helper now captures actual rejections and checks:

- `PublicMusicError` identity and exact `name`, `message`, `code`, `requestId`, and `retryAfterSeconds`.
- Request-ID syntax and finite retry bounds from 0 through 300 seconds.
- Absence of `cause` and an exact own-enumerable field allowlist.
- Absence of every supplied hostile value across name, message, code, request ID, retry, cause, own enumerable fields, JSON-safe projection, and stack.

Every secret-bearing request status/body/schema case, descriptor parser/unsafe-ID case, and resource invalid-UTF8 case captures the real rejection and uses this helper while preserving exact observability assertions.

A six-row real-method table covers discover, search, and video URL fetch init with supplied and omitted signals. It asserts supplied signal identity, absence of the `signal` property when omitted, exact URL/headers/body, and absence of a signal marker from URL/body.

### Fix-round verification

| Command | Result |
|---|---|
| Targeted surrogate RED | Expected FAIL: shallow assertion accepted secondary-surface leak |
| Targeted surrogate GREEN | PASS: 1 test, 102 skipped |
| `npx vitest run src/features/music/__tests__/publicMusicClient.test.ts` | PASS: 1 file, 106 tests |
| `npm run test:music-critical-coverage` | PASS: 16 files, 418 tests; 100% aggregate/per-file statements, branches, functions, and lines |
| `npm run test:unit` | PASS: 190 files, 1,965 tests |
| `npx eslint src/features/music/__tests__/publicMusicClient.test.ts` | PASS: no findings |
| `npm run lint -- --quiet` | PASS: no errors |
| `npm run build` | PASS: landing checks, static generation, TypeScript, Vite, and HTTPS-only Music transport check |
| `git diff --check` | PASS |

No production file changed, no live service was contacted, and build-generated sitemap date churn was inspected and restored. Scoped re-review is pending on the separate fix commit.
