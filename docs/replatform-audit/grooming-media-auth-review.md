# Final grooming: uploads, public images and Google login

Read-only review, 30 September 2026. No application files, secrets, cloud settings or deployed objects were changed. Source baseline: Explorers `79ef17d0b88c7e11b49d618fc7c888a513f29fa8`; Strapi `50b6c6e180de4a1290b0c0a3c8450ac5947566d5`.

## What “the S3 part” means here

S3 upload/storage is necessary backend scope, not an optional later feature. There are separate questions: where files are stored, how the browser uploads them, which URLs appear in rendered pages, and who may retrieve their bytes. A request to include S3 in the plan does **not** automatically require hiding the S3 hostname. Likewise a branded media URL does not by itself enforce privacy.

## Verified current behavior

| Evidence | Established fact | Not established |
|---|---|---|
| [Strapi upload provider source](https://github.com/MeteoriteLabs/localqr-strapi-v2/blob/50b6c6e180de4a1290b0c0a3c8450ac5947566d5/config/plugins.ts) | `aws-s3`; optional `CDN_URL`/`CDN_ROOT_PATH`; server credentials through AWS environment references; region/bucket configuration; ACL defaults `public-read`; signed URL expiry defaults 900 seconds | Effective environment values, actual bucket ACL/policy/public-access-block, object ownership setting, CDN distribution, working permissions or deployed provider version |
| `explorers-earth/src/features/Books/components/dashboard/AddBookPage.tsx:25` | Browser sends multipart `files` and `path` to Strapi `/upload`, with bearer token; uses returned first file URL | Direct browser-to-S3 upload is not this path; naming the helper “S3” does not establish direct transfer |
| `explorers-earth/src/features/Favorites/hooks/useAddRecommendation.ts:328` | Some upload paths also send numeric `refId`, Strapi `ref` and relation field information | Those caller-supplied relation values are not a safe ownership model for the new API |
| `explorers-earth/src/utils/uploadPathGenerator.ts` | Browser generates username-based paths and timestamp/random filenames | Sanitized paths do not prove authorization; username must not become canonical storage ownership |
| `explorers-earth/src/hooks/useFileUpload.ts` | Validates file selection and reports valid files | This hook does **not** perform network upload; editing it alone misses the upload integration |
| `explorers-earth/src/utils/fileValidation.ts:27` | Shared selection defaults: 5 MiB image and 10 MiB video, with per-caller overrides | Effective accepted media/limits for every screen still require the baseline matrix; browser validation cannot replace server byte/MIME checks |
| `tunes/server/publicProfile/strapiPublicProfileGateway.ts` | Public read selects return media URL fields from Strapi | Public profile proxying does not imply proxying image bytes |
| `explorers-earth/src/features/PublicHome/components/publicPlaceMedia.ts` | `/uploads/` resolves against Strapi origin; absolute Strapi-origin and recognized Amazon S3-host URLs pass through; other hosts are rejected | A new custom CDN hostname is **not** automatically supported—currently this helper falls back rather than showing it |
| `explorers-earth/src/features/PublicHome/components/PlaceDetails/Details/MediaGallery.tsx` | Media URL becomes the image/video source | Browser sees and requests that URL; no universal media-byte gateway is demonstrated |

Provider photos such as Google Books/TMDB/Google Places images are a separate class from account-uploaded bytes. Current Books code attempts some reuploads and falls back to provider URLs. Preserve the observed behavior only where provider terms and endpoint access permit; do not silently claim every external image is S3-owned or revocable by Explorers.

Other active upload callers include Profile `FeedFields.tsx`, `pages/Home.tsx`, `pages/ClaimAccount.tsx`, Favorites hooks, category `Add*Page.tsx` files and guide services. Grooming must map every retained caller; a shared replacement helper is appropriate, but a single-hook change is insufficient.

## Recommended first-release storage/delivery contract

1. **Retain S3 object storage; replace Strapi's upload API.** Authenticated multipart `POST /api/explorers/v1/media` goes to the unified backend. The server verifies account, allowed purpose/type/size and actual file content before streaming to S3. No AWS credential or arbitrary bucket/key choice reaches the browser. Reuse existing available credentials only after checking scope; separate QA/prod buckets or enforce disjoint prefixes and policies.
2. **Keep S3 private.** Store canonical object key, account owner, type/size/hash, processing status and attachment references in PostgreSQL. Keys use server-owned account/media IDs, never display handles. Do not carry the legacy `public-read` default into the new design. Bucket policy/ownership mode determines whether ACL options should be omitted; verify instead of blindly sending ACLs.
3. **Expose media IDs and application URLs.** Return a stable same-origin `/api/explorers/v1/media/:id/content` URL for uploaded media in existing view models. This is a proposed application route, not a claim that it exists today. The handler checks current attachment visibility or current owner session and streams the correct derivative; supports conditional/range requests where needed for videos. It must never accept an arbitrary source URL to proxy.
4. **Start with visibility-correct delivery before optimizing CDN.** For account-private media and claim evidence, send `Cache-Control: private, no-store`, do not expose anonymous URLs, and do not put responses in a shared cache. For uploaded media that can become private, initially use the same authorization-checked byte path with `Cache-Control: no-store`; public users can still load images without login when the parent is public. This avoids promising immediate revocation while retaining a cached bearer URL.
5. **CDN is a performance option, not required for first Books acceptance.** If enabling it, use private S3 origin access control and explicit viewer authorization, or a reviewed public-derivative policy with a defined cache/revocation window. A CloudFront origin access control protects the S3 origin but does not by itself restrict viewers. Signed URLs/cookies provide time-limited viewer access; they remain usable within their validity window. [AWS access controls](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-overview.html), [signed URL behavior](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-urls.html).
6. **Do not claim retracting downloaded content.** Turning a resource private must prevent subsequent authorized delivery and invalidate public API representations. It cannot erase bytes someone already saved. If a CDN is introduced, acceptance must measure and report the actual stale-access window, not say revocation is instantaneous.
7. **Deletion is transactional state plus retryable storage work.** Detach from the account-owned content, mark pending deletion and block delivery in one DB transaction; delete object/derivatives through an idempotent job. Retry storage failures; garbage-collect abandoned uploads after a specified grace period. Reference counts prevent deleting still-used media. Account deletion includes its private evidence and objects. New keys on replacement avoid old/new image cache collisions.

This preserves the UI while making privacy enforceable. It may use more backend bandwidth initially; the first QA load check should measure it. Do not introduce a CDN rollout as a prerequisite unless capacity tests show it is needed. If the user explicitly wants branded CDN URLs rather than application URLs, that is a delivery preference we can accommodate; no such preference is assumed here.

## Changes required in the ticket detail

| Ticket | Concrete grooming correction |
|---|---|
| 2.3 base media/profile | Own S3 adapter/configuration, media DB state, upload and byte-delivery routes, profile/background attachment and replacement; include real storage smoke. The backend plan currently names a URL but does not pin its delivery/cache contract—use the proposed contract above. |
| 3.2 media/catalog extension | Extend all recommendation upload paths and provider metadata handling; do not duplicate 2.3 storage infrastructure. Pin shared file limits against every actual caller override; add video/range behavior tests if retained baseline uses it. |
| 4.x/5.x category adapters | Replace each Strapi upload helper and numeric relation attachment. Update URL view-model mappings and `publicPlaceMedia.ts` to accept the new controlled same-origin route; explicitly test any configured CDN host rather than allowing every remote URL. |
| 5.4 claims | Claim evidence always private, owner-authorized; never part of public profile/media projection. A pending claim does not confer verified ownership. |
| 7.1 public parity | Direct byte fetch after profile/category/list hide must fail; nested profile visibility alone is insufficient. Test already-known image URLs, owner preview and anonymous denial separately. |
| 8.4/8.5 deployment/recovery | Verify S3 IAM/bucket/CORS only if cross-origin delivery requires it, environment isolation, TLS/CSP, backups/versioning/restore strategy, object deletion retries and configuration inventory. No credentials baked into images. |

Required media acceptance: valid photo and retained video; wrong-owner attach/delete; MIME spoof; limit boundary; failed upload with no attached orphan; failed content save with delayed cleanup; retry duplicates; private/claim URL guessing; publish/hide/delete while browser has old URL; missing object fallback; alternate owner/browser session; QA/prod separation; byte range correctness; uploaded object and DB restore consistency. CDN-specific tests are conditional on introducing a CDN, not silently skipped requirements.

## Secret-name inventory from parallel review

The parent review inspected GitHub secret **names**, not values. The Explorers repository lists `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION`, but not `AWS_BUCKET`. The Strapi repository lists `AWS_ACCESS_KEY_ID`, `AWS_ACCESS_SECRET`, `AWS_BUCKET` and `AWS_REGION`. The differing secret-key names need an explicit mapping in the unified deployment; do not silently assume the Strapi provider name matches the AWS SDK convention. A bucket may instead be host configuration, but that was not verified.

No Google OAuth client-ID/client-secret names were found in either inspected repository secret list or the inspected Tunes production environment list. This does **not** establish that credentials do not exist: Strapi may hold provider configuration in its database, and host/organization configuration was not proved. The next verification step is to locate the authorized existing configuration or obtain access to configure a client, not ask for secrets in chat.

## Google login dependencies before implementation acceptance

Current `Login.tsx` navigates to Strapi `/connect/google`. `GoogleAuthRedirect.tsx` reads the old frontend callback token, conditionally exchanges a Google-looking token, calls `/api/users/me`, and stores `qrtoken`. None of that proves the Google Cloud project is accessible to this task or configured for Better Auth. Existing server secrets may be sufficient, but presence is not verification.

Better Auth's documented Google code-flow setup needs a Web application OAuth client ID and client secret, plus a matching backend callback. With the planned default auth mount, the callback path is `/api/auth/callback/google`; its public base URL must be explicit. The frontend landing page after login is a different URL. [Better Auth Google setup](https://better-auth.com/docs/authentication/google).

| Dependency | Required verification | Owner/action |
|---|---|---|
| Google Cloud project access | Existing project's administrator/access mechanism and OAuth client can be inspected/updated | Use available access; ask only if that specific access is missing |
| Client ID/secret | Web application client; server-only runtime secret; determine whether existing client may be reused | Never request secret pasted in chat; use existing secret delivery |
| Environment callbacks | Exact local public origin/port, actual QA hostname and production origin plus `/api/auth/callback/google` | Pin after Epic 1 routing. Do not invent the QA DNS name. Register exact URI; old Strapi callback is not equivalent |
| Better Auth base URL | Explicit environment URL, trusted origins, proxy HTTPS awareness and correct secure cookies | Avoid constructing callback from an untrusted request Host |
| Consent/Google audience | App branding/support/domain configuration; test users and publishing status applicable to the selected project | Verify live Console state; do not promise public login from a configured secret alone |
| Scopes | Only identity needs: OpenID/profile/email; no Drive/Gmail/YouTube account access or offline-refresh dependency for ordinary sign-in | Provider API keys for Maps/Books/YouTube are separate configuration |
| Session secret and persistence | Better Auth application secret per environment and working auth DB tables | Independent of Google client secret |
| Real verification | Sign in, deny consent, repeat callback, expired state, logout, other account, suspended account, reverse proxy and cookie behavior | Automated protocol tests plus real local/QA Google smoke; CI fixture cannot prove Console setup |

Google's web-server OAuth flow requires the redirect URI to match registered configuration and has separate project/consent settings. Treat Google configuration access as an external prerequisite, not a source-code deliverable. [Google web-server OAuth documentation](https://developers.google.com/identity/protocols/oauth2/web-server).

Use separate production and nonproduction OAuth clients where practical to isolate callback mistakes and secret rotation. Google client IDs are identifiers rather than passwords; client secrets must stay server-side. Existing client credentials can be reused if their project/configuration is suitable—new credentials are not automatically necessary. Do not store or echo their values in audit artifacts.

## Readiness conclusion

The overall plan includes uploads and Google login, but previously lacked precise media-byte delivery/cache behavior and understated how many upload callers need replacing. The current Strapi source establishes S3/CDN configuration capability; it does not establish an active CDN or private object protection. Adopt or explicitly revise the proposed media contract during final grooming, then carry it into 2.3/3.2/5.4/7.1/8.4 tests. Google credentials may already exist; callback/consent/client access still needs verification before real-login acceptance. None of these findings requires redesigning the frontend.
