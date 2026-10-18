# Launch User Communication Plan — Start Fresh

**Decision (settled 2026-10-18, backbone D1):** explorers.earth relaunches on the new backend with
an empty database. Existing users begin from zero, nothing is imported from Strapi, and old profile
links stop working until their owners come back.

**Goal of this plan:** every existing user hears about it in advance, can save anything they care
about, can get their own handle back, and **no printed QR code gets taken over by a stranger.**

---

## Why this is more than messaging: printed QR codes

explorers.earth is a QR-sharing product. Its QR codes encode the user's handle in the URL:

- list QR codes go to `host/{username}/places/{recommendationListName}` (`LinksAndQR.tsx:67`);
- the share modal downloads a QR code of the profile URL (`ShareModal.tsx`).

People download these and print them — on menus, posters, cards, shop windows. Printed codes can't
be updated. In the new stack the URL shape is the same, `/<handle>`, so after cutover a printed
code can end up in one of three states:

| What happens | Where the printed code lands |
|---|---|
| Nobody claims the handle | a 404 |
| **The original owner** signs up again and picks the same handle | their new profile — the code works again |
| **A stranger** claims the handle first | **the stranger's profile.** Every code the original user printed now advertises someone else |

The third row is impersonation through the user's own printed material, and nothing in the new
stack prevents it today. The only handle protection is a fixed set of route words in
`tunes/server/application/profiles.ts:9` (`api`, `auth`, `login` and so on). So **old handles must
be held for their original owners from the moment the new stack accepts sign-ups.** That makes
Workstream A launch-blocking.

---

## Step 0 — Count the real users first

The backbone's D1 originally said *"only test accounts exist."* If that holds, this plan shrinks to
the handle hold plus a site notice. If real people signed up, especially people who printed QR
codes, all of it matters. One read-only count against **production Strapi** settles it, and it sizes
everything below.

Count, excluding team, test and fixture accounts:

1. user accounts with a verified email;
2. accounts with a public profile (`public_profile = "Yes"`);
3. accounts with at least one published recommendation;
4. accounts that have ever downloaded a QR code, if Strapi or analytics records that.

**Owner action:** this needs read access to production Strapi, which only the owner holds. Run it
from the Strapi admin panel or a read-only query; do not paste credentials anywhere. Record only the
four numbers.

| Result | What to run |
|---|---|
| Effectively zero real users | Workstream A anyway (cheap, and it protects the few). Skip email; use the site notice only |
| A handful | A, plus one personal email from the founder — no tooling needed |
| More than a handful | A and B in full, with an email tool |

---

## What actually changes for an existing user

These are the facts every message must agree with. **Do not promise anything that isn't built.**

| Topic | The truth at launch |
|---|---|
| Content | Recommendations, lists, profile details and photos are **not** carried over |
| Signing in | Google sign-in only. Email-and-password sign-in is gone |
| Their handle | Held for them for a fixed period. They get it back by signing in with Google **using the same email address** as their old account |
| Printed QR codes | A profile QR code works again once they reclaim the handle. A list QR code also needs the list recreated — see the caveat below |
| Their old data | Kept as an encrypted backup for a fixed period so we can answer export or deletion requests, then deleted |

**Caveat to verify before writing copy:** list QR codes also encode the list's name. Check how list
slugs are generated in the new stack. If they derive from the list name, recreating a list with the
same name restores its QR code, and the message can say so. If not, it can't.

**Edge case to plan support for:** someone who used email-and-password on Strapi with a non-Google
address can't satisfy "sign in with Google using the same email." They need a support path: email
the owner, prove ownership of the old account's address, and the owner releases the hold manually.

---

## Workstream A — Launch-blocking engineering

These run inside P2 (Task 9 Step 1a) and **must be done before the new stack opens to sign-ups.**

### A1. Export the minimal user list from Strapi — before cutover

Production Strapi is the only place the list of existing users lives, and P6 retires it. Export
once, with only these fields: `handle`, `email`, the account's public-profile flag, and whether it
had any published content.

Handling rules, all non-negotiable:

- **Never commit it.** Not to the repo, not to a gist, not to a PR description.
- Encrypt it at rest. Limit access to the owner. Write down where it is stored.
- Delete it when the hold window ends (A2), and record the date it was deleted.

### A2. Hold old handles in the new stack

A new table, a check at handle claim, and a one-shot loader.

```sql
-- illustrative; the real migration follows the chain rules in the P3 plan
CREATE TABLE legacy_handle_holds (
  handle_key   text PRIMARY KEY,        -- lower-cased handle, same normalisation as creator_accounts.handle_key
  email_sha256 text NOT NULL,           -- sha256 of the lower-cased, trimmed email; never the email itself
  held_until   timestamptz NOT NULL
);
```

At handle claim — `tunes/server/application/profiles.ts:30`, beside the existing `reserved` check —
if a hold exists for the handle and `held_until` is in the future, allow the claim **only** when the
sha256 of the signed-in user's **verified Google email** equals `email_sha256`. Otherwise answer
`Handle is unavailable`, exactly like a reserved word, so the response doesn't reveal whose handle it
was.

Store a **hash** of the email, not the email. The new database then never holds the old user list in
readable form, and the plain export can be deleted on schedule.

Tests, written first:

- the same verified email claims the held handle;
- a different Google account is refused;
- after `held_until`, anyone can claim it;
- an unverified email can't match, even if the address is identical;
- the frontend handle-availability check gives the same answer as the server. The backbone records
  an existing "reserved-handle three-way divergence" defect, so check every place handle
  availability is decided, not just the server.

Load the holds with a one-shot script run on the `migrate` service, the same pattern as the P2
taxonomy apply. It needs a chain bump; the migration number is assigned at merge, and P3's two
migrations renumber after it.

### A3. What a held-but-unclaimed handle shows (owner decision)

Until it is reclaimed, a held handle's public URL can show either:

- **a plain 404**, the same as a handle that never existed — reveals nothing; or
- **a short "this explorer is moving to the new explorers.earth" page** — kinder to someone who
  scans an old QR code, but it reveals that the handle was once in use. That handle was public
  before, so the disclosure is small.

Recommended: the friendly page. It turns a dead QR code into an explanation.

---

## Workstream B — The messages

### Channels

**Email.** The new stack **has no email sender.** The only code that sends mail is legacy
(`server/services/email-service.ts`, `server/auth.ts`, `server/services/reactivation-service.ts`),
and P3 deletes it. The new stack does have an unsubscribe-token mechanism and a suppression list
(`tunes/server/application/emailSuppression.ts`, decision D2 of 2026-10-08), but nothing that sends.
So these emails go out from outside the app:

| Option | When it fits |
|---|---|
| An email marketing tool (Brevo, Mailchimp or similar) with the exported list | More than a handful of users. It handles unsubscribe, bounces and bulk-sender rules for you. **Recommended** |
| Personal email from the founder | A handful of users |
| A one-off script through a transactional provider (SES or Resend) | Only if a tool is ruled out. You own unsubscribe and bounce handling yourself |

Every bulk message needs a **one-click unsubscribe**. After cutover, copy any unsubscribes into the
new stack's suppression list, so the "we're live" and reminder emails respect them.

**A notice on the current site.** A banner on the live Strapi-era site reaches active visitors.
That needs a deploy of the current frontend, and how it is deployed today is unknown — the
`explorers.yml` workflow is disabled. **Owner action:** confirm how the current site deploys. If
there's no safe path, skip the banner and rely on email.

**Anywhere else the product has an audience** — social accounts, a blog, partner venues.

### Timeline (T = cutover day)

| When | What | Who receives it |
|---|---|---|
| T−21 | Fix the date. Finalise copy. Set up the email tool. Run Step 0 | — |
| T−14 | **Email 1:** "explorers.earth is relaunching" and **banner on** | Everyone on the list |
| T−3 | **Email 2:** short reminder | Everyone not unsubscribed |
| T | Cutover. Banner off. Handle holds are live before sign-ups open | — |
| T+1 | **Email 3:** "We're live — reclaim your handle" | Everyone not unsubscribed |
| Hold expiry − 30 days | **Email 4:** "Your handle is released in 30 days" | Only holders who haven't reclaimed |

### Draft copy

Draft only. Fill the brackets and check every claim against the table in "What actually changes"
before sending.

**Email 1 — subject: explorers.earth is getting a fresh start on [date]**

> Hi [name],
>
> On [date] we're relaunching explorers.earth on a new, faster foundation.
>
> To do that we're starting fresh: your current recommendations, lists and profile **won't move
> over**. If there's anything you'd like to keep, save it before [date] — or reply to this email and
> we'll send you a copy of your data.
>
> **Your handle, @[handle], is held for you** until [hold end date]. To get it back, sign in to the
> new explorers.earth with Google using this email address, [email].
>
> If you've printed QR codes for your profile, they'll work again once you reclaim @[handle].
> [Only if verified: QR codes for a list work again once you recreate the list with the same name.]
>
> Thank you for being here early.
> [founder name]
>
> [one-click unsubscribe]

**Email 3 — subject: explorers.earth is live — your handle is waiting**

> Hi [name],
>
> The new explorers.earth is live. Sign in with Google using [email] and @[handle] is yours again.
>
> [Sign in →] [link]
>
> We'll hold @[handle] for you until [hold end date].
>
> [one-click unsubscribe]

**Banner on the current site:**

> explorers.earth relaunches on [date] with a fresh start — current content won't move over.
> Your handle is held for you. [Learn more]

---

## Workstream C — Data handling and legal

- **The old Strapi data after cutover.** Keep one encrypted backup for a fixed period so export and
  deletion requests can still be answered. Then delete it, and write down the date. Recommended
  period: 90 days. This ties into the backup plan (P5b).
- **Export requests.** No self-serve export exists anywhere in the codebase. Building one on the
  current stack means spending effort on code that's about to be deleted. Recommended: honour
  requests **by reply** during the retention window, from the backup.
- **Privacy policy.** An earlier audit found legal placeholder text shipping live. The policy must
  match this plan — what is deleted, what is kept, for how long, and how to ask for a copy — before
  Email 1 goes out.
- **Applicable law.** Notice, retention and deletion obligations depend on jurisdiction — for an
  India-based product, the Digital Personal Data Protection Act, 2023 is likely relevant. **Confirm
  the retention period and the notice wording with whoever handles legal.** This plan is not legal
  advice.

---

## Decisions the owner needs to make

| # | Decision | Recommendation |
|---|---|---|
| 1 | Cutover date | Fix it at T−21 so the notices have room |
| 2 | How long handles are held | 12 months — long enough for anyone with printed codes to notice |
| 3 | Email channel | A marketing tool, unless Step 0 finds only a handful of users |
| 4 | Data export | By reply, from the backup, during the retention window |
| 5 | Old-data retention | 90 days, then delete and record it |
| 6 | Banner on the current site | Only if there's a safe way to deploy it |
| 7 | What a held, unclaimed handle shows | The friendly "moving" page |

---

## How this fits the launch sequence

1. **Step 0** (owner, read-only) — sizes everything.
2. **A1 and A2** — inside P2, before sign-ups open (P2 Task 9 Step 1a). The handle hold is a code
   change with a migration and tests; it ships as its own PR.
3. **B: T−14 and T−3 emails, plus banner** — before cutover.
4. **Cutover** — P2 Tasks 10 and 11.
5. **B: T+1 email**, then the reminder before the hold expires.
6. **C: delete the backup and the export** at the end of their windows, and record the dates.
