# Better Auth 1.7.6 recovery and delegated-authority qualification

**Result:** the account-recovery hook design is supported by concrete package seams, with an important refinement: a fresh Google authorization round trip is not proof that Google demanded a new password or MFA. A durable OAuth consent row exists, but a universal native `grantId` attached to every token does not. The delegated binding needs an explicit consent/issuance design and live revocation checks rather than assuming that field exists.

This is source qualification, not a completed live login/recovery/MCP test. No application code, deployed configuration or real credentials were used. npm packages were downloaded and extracted only beneath `C:/Users/TK/AppData/Local/Temp/explorers-auth-recovery-qualification`.

## Exact packages inspected

| npm package | Version | Tarball SHA-256 |
|---|---|---|
| better-auth | 1.7.6 | `DF94B955C3E6F64DFC095D52BA0F6F344814D55385DE0F50669111586A603E99` |
| @better-auth/core | 1.7.6 | `E77E869A604083ABF292BA9045F5182BD25CC2E57697E8FC1E3965651613F908` |
| @better-auth/oauth-provider | 1.7.6 | `AC4E6C420B785673FA069D83BF778ACCE56971571946139332C1553DAAB0CE3F` |

Evidence below uses paths relative to each extracted package root. The package/version and hashes make the bundled-file line references reproducible; latest online documentation is supplementary.

## 1. Recovery can use an actual OAuth callback hook

| Source evidence | Verified behavior |
|---|---|
| `better-auth/dist/api/state/oauth.mjs`, exported through `dist/api/index.mjs:220` | `addOAuthServerContext` and `getOAuthState` are exported. Server context can be added during a before hook and recovered after redirect; source explicitly distinguishes it from untrusted client `additionalData`. |
| `better-auth/dist/api/routes/sign-in.mjs` | Social sign-in accepts callback URLs, additional authorization parameters and additionalData; the latter is caller input and must not grant recovery authority. |
| `better-auth/dist/api/routes/callback.mjs` | Callback parses stored state, exchanges authorization code, resolves provider account identity, invokes `handleOAuthUserInfo`, sets session cookie and redirects. Linking is a separate branch. |
| `better-auth/dist/oauth2/link-account.mjs:322` | Successful identity resolution creates a new session. Recovery cannot assume the callback produces no normal session automatically. |
| `better-auth/dist/cookies/index.mjs:166–179` | `setSessionCookie` stores the session and sets `ctx.context.newSession`. |
| `better-auth/dist/api/dispatch.mjs:231–245` | APIError/redirect response is captured and after hooks are executed; response headers can be replaced before final response. |
| `better-auth/dist/plugins/two-factor/index.mjs:287–289` | Existing library code demonstrates deleting newly created session cookies, deleting the session through the context adapter and setting newSession to null in an after hook before issuing a purpose-specific challenge. This establishes a real lifecycle pattern, not a guessed API. |
| `better-auth/dist/cookies/index.mjs:241,350` | `deleteSessionCookie` is exported; cleanup also removes prior Set-Cookie entries so an earlier valid cookie is not left in raw response headers. |

**Qualified implementation direction:** keep suspension/deletion state at the Explorers application layer. Do not use a Better Auth admin-ban mechanism for recoverable account suspension, since blocking provider authentication itself would prevent recovery.

1. A CSRF/origin-checked recovery start records server-trusted recovery intent and issuance time in OAuth serverContext, plus a random intent identifier tied to the browser flow. It does not trust a user/account ID from additionalData.
2. Initiate Google's code flow through the supported social endpoint and require this newly completed callback, not an arbitrary existing session. After the callback, require newSession and match the verified existing provider identity to the retained initial account binding. An unknown identity must not receive a recovery proof or recover another account by matching email.
3. Keep normal account provisioning separate from raw library user/session creation. For recovery and inactive identities, skip `ensureInitialAccount`; the existing binding is mandatory. A terminally deleted binding never recovers. Disable implicit account linking rather than treating an email match as the expected provider subject (`link-account.mjs` explicitly supports `accountLinking.disableImplicitLinking`).
4. In the callback after hook, remove the temporary normal session/cookies, clear newSession, and issue the application's random five-minute HttpOnly recovery cookie while persisting only its hash and bindings. Follow the actual cookie-cleanup pattern; clearing only browser localStorage is insufficient. Any failure must leave no recovery credential and no usable normal session. Even before cleanup, all app Actor routes must reject the inactive account.
5. The application consumes its proof and transitions account revision atomically. Proof replay, mismatch, expiry and terminal deletion fail. The proof is never an Actor or content/Music credential. Establish a fresh normal session after successful recovery through the separately tested supported auth path; do not resurrect the temporary session removed by the callback hook.

These are supported adapter building blocks, not proof that the whole application transaction is already implemented. Hooks using the context internal adapter are version-sensitive and require pinned regression coverage. Keep HTTP cookie cache from bypassing canonical account/session checks.

## 2. Define “fresh” accurately

`@better-auth/core/dist/social-providers/google.mjs` builds the Google authorization URL with PKCE, standard identity scopes, `prompt` and allowed additional parameters. Its direct ID-token verifier checks issuer, audience, signature, nonce when supplied and a maximum token age of one hour. The inspected code does not enforce a five-minute Google `auth_time` policy for application recovery.

Therefore:

- A new, state-bound code callback proves a newly completed provider flow in this browser. It can be required and tested without accepting an old Explorers session.
- `prompt=select_account` selects an account; it is not a guarantee of fresh password/MFA entry. `prompt=consent` similarly is not proof of credential entry.
- Do not call the five-minute application recovery proof a Google reauthentication-age guarantee. Its expiry limits the application's recovery capability after the verified callback.
- If product policy later requires a newly entered Google credential/MFA within a strict interval, that is an additional provider capability/claim-validation decision and is not qualified here. The current Google-only recovery plan does not need to invent that requirement.

Real Google callback/consent configuration and behavior still require the single configured OAuth client in local/QA environments. Existing app credentials or simulated responses cannot prove those settings.

## 3. Native OAuth consent exists, but token grant identity needs refinement

Pinned provider evidence:

| File | Finding |
|---|---|
| `@better-auth/oauth-provider/dist/authorize-CLuqtSXQ.mjs:67–120` | Consent is found using clientId/userId and optional referenceId; acceptance updates the existing consent row or creates one. A consent row has its adapter-generated ID. |
| Same file, `oauthConsent` schema at 4080 | Columns include clientId, optional userId/referenceId, resources, requestedUserInfoClaims, scopes and timestamps. This is durable consent state. |
| Same file, token schemas at 3909/4003 | Refresh/access token rows contain client/user/reference/session IDs and authorizationCodeId; access tokens can reference refreshId. There is no `consentId` or universal `grantId` FK tying every token to an oauthConsent row. |
| `dist/introspect-CbYi2MJT.mjs:1457–1484` | Opaque access-token creation writes the identifiers above without a consent-row ID. |
| Same file, JWT introspection at 2263–2285 | JWT path verifies audience/client and optional session, then marks active; this path does not itself look up the current consent row. |
| `dist/authorize-CLuqtSXQ.mjs:2989–3010` | `deleteConsentEndpoint` verifies the session owner then deletes the consent row; it does not revoke all already-issued token rows in that function. |

**Consequences for the plan:** `delegated_grant_bindings.provider_grant_id` must not be described as a verified universal native grant field. For this package, the viable application concept is a **consent binding**, using the consent row ID plus exact verified client/user/resource context, with application generation/revocation state. Consent can be updated in place, so consent ID alone also does not freeze scopes or issuance generation.

Required adapter design before Epic 10:

1. Pick and document the exact native consent row used for a linked account; populate referenceId from server-validated account context if used. Never select it solely from a tool-supplied account ID.
2. Bind token issuance to the application binding generation through a supported custom-claim/token-record hook, or choose an opaque-token resolver that can prove the same relationship. Verify the exact extension API in a runnable issuance/refresh test; this inspection did not establish an immutable token→consent FK.
3. At every protected application request, validate token issuer/audience/client/scope plus active local binding, active matching consent, current membership/account state and permitted resource. Do not rely solely on successful JWT verification or the inspected JWT introspection response for consent revocation.
4. Disconnect must revoke local binding immediately and invoke supported native token revocation where available. Deleted consent must deny application access even while an old token remains cryptographically valid. Re-consent must not reactivate an old revoked token merely because user/client match again; use a new binding generation or a positively proved native issuance family.
5. Test scope reduction, consent deletion, refresh rotation, revoke-and-reconnect, multiple resources and concurrent consent/token issuance against real PostgreSQL and the pinned plugin. Consent has no expiry column; application expiry, token expiry and consent existence are distinct.

This is application authorization atop the existing OAuth provider, not a proposal to build OAuth ourselves. [Current provider documentation](https://better-auth.com/docs/plugins/oauth-provider) describes consent-management endpoints, while the pinned package inspection above establishes the missing token linkage and actual deletion behavior.

## Qualification status

| Gate | Result |
|---|---|
| Supported callback before/after hooks and trusted round-trip context | Source-qualified in 1.7.6 |
| Observe and discard temporary session before issuing recovery-only cookie | Source-qualified pattern; runnable application-specific negative tests still required |
| Recoverable app suspension independent from provider authentication | Compatible architectural choice; no admin-ban plugin used |
| Strict new Google password/MFA proof | Not established; not implied by fresh code round trip |
| Durable native consent record | Confirmed |
| Universal native grant ID available on every access/refresh token | Not present in inspected schema; previous assumption must be refined |
| Immediate consent revoke / reconnect safety from JWT validation alone | Not established; application binding and live consent checks required |
| Live Google/ChatGPT linking | Not run; requires actual configured environments and credentials |

No application implementation or database migration was performed. These findings close source-discovery uncertainty around recovery hooks, while exposing a specific delegated-authority contract that must be revised and tested rather than labelled complete.
