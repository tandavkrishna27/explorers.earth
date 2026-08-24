# Profile and Settings Information Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-tab Profile editor with Profile, Gallery, and Appearance while moving private account fields into Settings without changing stored data or save behavior.

**Architecture:** Extract the existing field-group definitions and full initial-value mapper into shared Profile modules. Profile and Settings will compose the same `ProfileForm`, `profileDataQuery`, and `useUpdateProfile` pipeline with different visible field groups, so a save cannot silently clear hidden data.

**Tech Stack:** React 18, TypeScript, Formik, Apollo Client, Vitest, Testing Library, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-20-profile-settings-information-architecture-design.md`

## Global Constraints

- Profile has exactly three tabs: Profile, Gallery, Appearance.
- No GraphQL schema, field name, or mutation contract changes.
- Every current Profile and Account data point remains reachable.
- Settings Account owns username and account type; Settings Billing owns the detailed billing address.
- Hidden profile values are preserved on every partial-section save.
- Existing user changes in the dirty worktree must not be reset or overwritten.

---

### Task 1: Shared field destinations and complete initial values

**Files:**
- Create: `explorers-earth/src/features/Profile/config/profileFormSections.tsx`
- Create: `explorers-earth/src/features/Profile/config/profileInitialValues.ts`
- Test: `explorers-earth/src/features/Profile/config/__tests__/profileFormSections.test.tsx`
- Test: `explorers-earth/src/features/Profile/config/__tests__/profileInitialValues.test.ts`
- Modify: `explorers-earth/src/pages/Profile.tsx`

**Interfaces:**
- Produces: `getProfileFields(t)`, `getGalleryFields(t)`, `getAppearanceFields(t)`, `getAccountSettingsFields(t)`, and `getBillingAddressFields(t)` returning `FormSection[]`.
- Produces: `buildProfileInitialValues(input): KeyValuePair` and `getAccountTypeKey(storedValue, t): string`.

- [ ] **Step 1: Write failing destination tests** asserting the literal field-name lists for all five groups and proving their union equals the complete pre-move field set.
- [ ] **Step 2: Run `npm test -- src/features/Profile/config/__tests__/profileFormSections.test.tsx`** and verify it fails because the shared module does not exist.
- [ ] **Step 3: Implement the shared field functions** by moving the existing JSX/icon definitions without changing names, labels, types, required flags, or options.
- [ ] **Step 4: Run the destination test** and verify it passes.
- [ ] **Step 5: Write failing initial-value tests** with a complete account fixture containing social links, feed, theme, business address, and billing components; assert literal mapped values and preservation of unknown `social_media` members.
- [ ] **Step 6: Run `npm test -- src/features/Profile/config/__tests__/profileInitialValues.test.ts`** and verify the missing mapper fails.
- [ ] **Step 7: Move the current Profile initial-value mapping into `buildProfileInitialValues`** without changing fallbacks or stored shapes.
- [ ] **Step 8: Run both Task 1 tests** and verify they pass.

### Task 2: Three semantic Profile tabs

**Files:**
- Modify: `explorers-earth/src/pages/Profile.tsx`
- Modify: `explorers-earth/src/pages/__tests__/Profile.save.test.tsx`

**Interfaces:**
- Consumes: Task 1 field-group and initial-value functions.
- Produces: active tab key union `profile | gallery | appearance` and one mounted `ProfileForm` for the active group.

- [ ] **Step 1: Add a failing Profile test** that renders the real page shell, asserts exactly three tab roles named Profile, Gallery, and Appearance, clicks each tab, and checks the active `ProfileForm` receives the correct literal field names.
- [ ] **Step 2: Run `npm test -- src/pages/__tests__/Profile.save.test.tsx`** and verify the test fails because the old Public Profile and Account switcher is still rendered.
- [ ] **Step 3: Replace the switcher with semantic three-tab markup** using stable IDs, `aria-controls`, `aria-labelledby`, selected state, and Left/Right/Home/End handling.
- [ ] **Step 4: Keep the existing header, image uploads, preview, dirty-state callbacks, save registration, walkthrough, and mutation orchestration unchanged.**
- [ ] **Step 5: Run the Profile test** and verify all save-orchestration tests and the new tab test pass.

### Task 3: Reusable moved Account/Billing editor

**Files:**
- Create: `explorers-earth/src/features/Settings/components/ProfileAccountSettings.tsx`
- Test: `explorers-earth/src/features/Settings/components/__tests__/ProfileAccountSettings.test.tsx`

**Interfaces:**
- Consumes: `profileDataQuery`, `buildProfileInitialValues`, Task 1 field groups, `ProfileForm`, `useUpdateProfile`, `useReverseGeocoding`, and `UsernameChangeConfirmationModal`.
- Produces: `<ProfileAccountSettings section="account" | "billing" />`.

- [ ] **Step 1: Write a failing Account-mode test** asserting username/account type render through the real field-group contract and the full hidden social/feed/theme values reach `useUpdateProfile` on save.
- [ ] **Step 2: Write a failing Billing-mode test** asserting all six detailed address fields render and mapped geolocation values reach the same save pipeline.
- [ ] **Step 3: Write a failing username test** proving a changed valid username waits for confirmation and cancellation performs no mutation.
- [ ] **Step 4: Run the targeted test** and verify failures are caused by the missing component.
- [ ] **Step 5: Implement the component** with the existing loading/error treatment, username cooldown/validation, confirmation modal, success/error toasts, address mapping, and complete initial values.
- [ ] **Step 6: Run the targeted test** and verify Account, Billing, preservation, and username-confirmation cases pass.

### Task 4: Place moved forms in Settings

**Files:**
- Modify: `explorers-earth/src/features/Settings/Settings.tsx`
- Test: `explorers-earth/src/features/Settings/__tests__/Settings.profile-account-placement.test.tsx`

**Interfaces:**
- Consumes: `<ProfileAccountSettings section="account" | "billing" />`.
- Preserves: all existing password, language, visibility, pinning, integrations, danger-zone, usage, plan, and subscription controls.

- [ ] **Step 1: Write a failing placement test** that asserts Account mode is inside Settings Account, Billing mode is inside Settings Billing, and neither moved editor appears in the opposite tab.
- [ ] **Step 2: Run the targeted Settings test** and verify it fails before integration.
- [ ] **Step 3: Add Account mode above Quick Access** and Billing mode above the existing `BillingTab`, leaving current controls and handlers unchanged.
- [ ] **Step 4: Add semantic Settings tab roles and keyboard selection** without altering the two-tab taxonomy.
- [ ] **Step 5: Run the Settings placement test** and verify it passes.

### Task 5: Verification and browser QA

**Files:**
- Modify only if verification exposes a regression in the files above.

**Interfaces:**
- Verifies the user-visible feature and the existing save contract.

- [ ] **Step 1: Run the four targeted test files** and verify clean output.
- [ ] **Step 2: Run `npx tsc -b`** and resolve only errors caused by this feature.
- [ ] **Step 3: Run the relevant existing Profile/Settings tests** and verify no regression.
- [ ] **Step 4: In Chrome, test Profile → Profile/Gallery/Appearance at desktop and mobile widths.**
- [ ] **Step 5: In Chrome, edit and save Account type, then edit and save a billing-address field; reload each page and verify persistence.**
- [ ] **Step 6: Verify the public page still renders the unchanged public display name, location, social data, gallery, and selected appearance.**
- [ ] **Step 7: Review `git diff` to confirm no unrelated user changes were overwritten.**
