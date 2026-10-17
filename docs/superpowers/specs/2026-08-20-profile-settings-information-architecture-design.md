# Profile and Settings Information Architecture Design

## Approved direction

The dashboard Profile page has exactly three tabs:

1. **Profile** — public display name, public location, bio, social/contact links, and business contact/location details.
2. **Gallery** — the existing feed photo/video editor.
3. **Appearance** — the existing theme, cover, first-view, recommendation layout, and recommendation-order controls.

There is no fourth Profile tab.

Settings keeps its existing two top-level tabs:

1. **Account** — username/profile URL, account type, password, language, integrations, visibility/navigation preferences, and danger-zone actions.
2. **Billing** — billing address followed by the existing usage, plan, and subscription controls.

## Data and behavior preservation

- This is an information-architecture move, not a schema or API migration.
- Existing GraphQL field names, mutation payloads, validation, username confirmation, geolocation/address mapping, toasts, loading states, and save behavior remain authoritative.
- Saving a subsection must submit the complete existing profile value set so fields hidden on that subsection are preserved.
- Profile picture and cover editing remain in the persistent Profile header.
- Public-profile rendering and all recommendation/theme settings remain unchanged by this move.
- The public display name remains on Profile; the private username/profile URL moves to Settings → Account.
- Detailed billing-address components move to Settings → Billing.

## Accessibility and responsive behavior

- Profile tabs use semantic `tablist`, `tab`, and `tabpanel` relationships.
- Tabs have visible selected states, keyboard focus, 44px minimum targets, and Left/Right/Home/End keyboard navigation.
- At mobile widths the three tabs remain legible without horizontal overflow.
- Settings Account and Billing retain their existing responsive layout.

## Verification

- Automated tests prove every pre-move field is present in exactly one destination group.
- Automated tests prove Profile exposes only Profile, Gallery, and Appearance.
- Automated tests prove Settings Account and Billing reuse the full value/save contract.
- TypeScript, targeted unit tests, and browser checks cover Account and Billing saves plus all three Profile tabs.
