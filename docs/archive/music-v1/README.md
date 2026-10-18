# Music v1 archive

## What Music was

Music (the `tunes/` app, embedded in explorers.earth as the Music dashboard) was
a real-time venue playlist product. A venue owner managed saved playlists, a live
queue and play history, and a YouTube-backed player. The owner then shared the
venue as `private`, `unlisted` (a link carrying a secret guest capability) or
`public`. Guests opened the share link (`/music/share/<publicSlug>`, often from a
QR code), watched the now-playing state live and requested songs. Owner and
guests were kept in sync over Socket.IO. Ownership started as a projection of a
verified Strapi Explorer/Account (`docs/architecture/music-identity.md`). Under
ADR-006 to ADR-008 it moved to the canonical account: one venue `users` row per
account through `account_music_identity`, with the canonical account ID as the
Music credential subject. Entitlement, publication, content and lifecycle were
modelled as independent axes, served by an Express + PostgreSQL backend with
append-only SQL migrations.

## Where the code is

The product was removed from `main`. The code is preserved at the git tag
**`music-v1-final`** (commit `6a00fd83`).

```bash
git fetch --tags
git show music-v1-final --stat          # confirm the tag resolves
git switch --detach music-v1-final      # browse the tree read-only
# or keep your checkout and use a separate worktree:
git worktree add ../music-v1 music-v1-final
```

Every source path cited in this archive refers to the tree at that tag.

## Files in this archive

| File | Contents |
|---|---|
| [share-key-format.md](share-key-format.md) | The `tunes-share-v1-<ms>-<uuidv4>` publication idempotency key: structure, validation window, domain-separated hashes, the AES-256-GCM encrypted replay response and its keyring, operation lifecycle, versioning. It is not a signed token. |
| [socket-ticket-and-guest-capability.md](socket-ticket-and-guest-capability.md) | The Music credential (HS256 token, claims, `MUSIC_TOKEN_*` config, ADR-008 subject kinds), the 60-second Socket.IO handshake ticket (not single-use), the guest capability (256-bit random, SHA-256 hash at rest, `#access=` fragment link, revocation), and a Socket.IO server summary. |
| [adr/005-music-identity-migration-deployment-authority.md](adr/005-music-identity-migration-deployment-authority.md) | ADR-005, verbatim copy |
| [adr/006-canonical-music-identity-supersedes-strapi-proof.md](adr/006-canonical-music-identity-supersedes-strapi-proof.md) | ADR-006, verbatim copy |
| [adr/007-music-venue-profile-owned-by-canonical-account.md](adr/007-music-venue-profile-owned-by-canonical-account.md) | ADR-007, verbatim copy |
| [adr/008-canonical-account-is-the-music-credential-subject.md](adr/008-canonical-account-is-the-music-credential-subject.md) | ADR-008, verbatim copy |
| schema/music-ddl-0056.sql | Flat DDL of every Music database object at migration 0056 (generated with pg_dump from a database migrated to 0056_explorers_app_enrichment_jobs) |

The ADRs are also kept in `docs/adr/`. Because they are verbatim copies, relative
links in them that point outside `docs/adr/` (for example
`../replatform-audit/...`) do not resolve from this directory. Follow them at the
tag instead.
