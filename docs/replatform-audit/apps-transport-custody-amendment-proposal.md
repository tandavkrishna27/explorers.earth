# Proposed Apps transport custody amendment

Status: approved by the user on 2026-10-11; implementation and native qualification pending.

## Evidence

Native Apps at da090a6346cdc2d70867b174e202ad3e41fe84f9 passed all eight browser cases. Cleanup's 15-second deadline captured canonical-wait, zero wrapper handlers, 58 retained requests, zero handler frames, unknown false, uncertain true, and first reason request-aborted. Original runner exited 1. This proves the request-record retention blocker; it does not classify every retained request.

The frontend intentionally cancels requests during StrictMode effect replay, route changes, and owner-data invalidation. Removing those cancellation guards or weakening browser assertions would risk stale owner data. The existing custody design instead makes every request abort permanently disqualifying, including a read whose original handler has already settled.

## Proposed narrow rule

Allow retirement only for explicitly audited read-only Apps GET routes when every original invocation has returned, every original promise including its finalizer has settled, each callback frame has actually transitioned, the incoming request and outgoing response have positively closed, current registration attestation succeeds, and no unsafe or unknown cause exists for that record.

Keep a separate finite count of proved read transport cancellations. Do not manufacture finish events or complete input, discard callback frames, clear unsafe uncertainty, omit original work, or infer cancellation from a timer. Track all unsafe causes per record so a first benign transport event cannot hide a later handler failure.

POST, PATCH, PUT, DELETE, uploads, control, authentication, unclassified routes, detached or unknown work, registration changes, handler failures, foreign thenables, duplicate transitions, capacity refusals, and deadlines retain their current refusal behavior. Authentication remains excluded until its actual adapter and body-reader cancellation promises are separately audited.

This deliberately amends the existing permanent-abort rule. It cannot be described as satisfying that old rule unchanged. Only positive evidence under the approved amended rule may qualify cleanup.

## Implementation sequence after approval

1. Audit and explicitly classify exact Apps read routes. Add per-record terminal transport witnesses and all unsafe-cause tracking.
2. Implement retirement under the complete positive-evidence conjunction; retain original work and finite diagnostic counters.
3. Add real HTTP/Express regressions for disconnects, held promise finalizers, held parser callbacks, later failures, and refused mutating/upload/control/auth requests. Preserve all eight browser assertions.
4. Independently review the policy implementation and run fresh contract/type checks.
5. Run the exact clean replatform head natively. Require eight passing browser cases and positive cleanup; any unclassified or unsafe cancellation still blocks qualification.

Alternative: retain the current permanent-abort rule. Apps then remains blocked by the observed real UI cancellation behavior; increasing the timeout or waiting at final teardown cannot undo an earlier permanent latch.

## Implementation checkpoint
The fixed Apps composition now passes its private admission identity into custody. Exact admitted owner/public GET scopes earn WeakMap proof only after dataset binding and relationship checks; request method and original URL must still match. Both transport closes, all actual original promise/callback settlement, current registration attestation and absence of unsafe causes are required. Native IncomingMessage aborted ECONNRESET uses the original stream error identity and bounded descriptor proof; generic/forged resets and handler errors remain unsafe. Callback-error and response-error are retained; all unsafe latches stay sticky. Captured native Promise settlement prevents an overridden then method from manufacturing completion.

Apps-only session construction enables installed deferred GET refresh with cookie cache disabled; normal auth configuration stays unchanged. Installed runtime adapter-bound tests prove near-refresh GET0writes and expired GET0deletion, ordinary update/delete controls, signed-cookie/defaultGET behavior and held original finalizer. This supports the eight audited READ ONLY owner scopes. Authentication endpoints, /me, media GET/HEAD, control, uploads and mutations remain excluded.

Independent auth and custody reviews accepted after fixing callback-error forwarding and altered-promise settlement. Fresh root verification:10 focused contract suites740PASS; six selected runner testsPASS; tsconfig.music-c0 and scoped runner typechecks0. Native exact-head Apps qualification remains pending.
