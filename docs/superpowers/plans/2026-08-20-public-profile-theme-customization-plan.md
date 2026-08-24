# Public Profile Theme & Customization System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dynamic theme presets (*Cinematic Dark*, *Glassmorphism*, *Sunset Glow*, *Minimal Light*, *Emerald Nature*, *Neon Cyber*), full-screen/top-banner wallpaper modes, text color contrast control, default landing tab selection, tab visibility toggles, and an `explorers.earth` footer branding badge to `explorers.earth/:username`, managed via a Linktree-inspired design control panel with live preview in Dashboard (`/profile`).

**Architecture:** A Theme Token Engine converts `theme_settings` into dynamic CSS custom properties applied synchronously on the public profile page. The GraphQL queries fall back to default values for backwards compatibility. A modular `ThemeAppearanceSection` component is added to `ProfileForm.tsx` with interactive live preview.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Apollo Client (GraphQL), Zustand, Lucide React / SVG Icons, Vitest / React Testing Library.

## Global Constraints

- Zero additional network requests or latency on `/:username` page load.
- Backward compatibility: existing profiles default to Cinematic Dark with Top Banner Cover.
- Functional React components only with strict TypeScript types.
- Follow existing codebase patterns in `explorers-earth`.

---

## File Structure & Responsibilities

- **New Files**:
  1. `explorers-earth/src/features/Profile/types/themeTypes.ts` - Data structures and TypeScript interfaces for theme presets, wallpaper modes, text color contrast, and CSS tokens.
  2. `explorers-earth/src/features/Profile/constants/themePresets.ts` - Theme preset configurations, palette constants, contrast helpers, and fallback default values.
  3. `explorers-earth/src/features/Profile/constants/__tests__/themePresets.test.ts` - Unit tests for theme preset resolution and contrast helpers.
  4. `explorers-earth/src/features/Profile/components/ThemeAppearanceSection.tsx` - Dashboard UI controls for selecting themes, wallpaper, accent colors, text colors, default landing tab, and rendering live preview.
  5. `explorers-earth/src/features/Profile/components/__tests__/ThemeAppearanceSection.test.tsx` - React component unit tests for Dashboard design controls.
  6. `explorers-earth/src/features/PublicHome/components/PublicProfileFooter.tsx` - Reusable footer branding badge component for `explorers.earth` public profiles.
  7. `explorers-earth/src/features/PublicHome/components/__tests__/PublicProfileFooter.test.tsx` - Unit tests for PublicProfileFooter component.
- **Modified Files**:
  1. `explorers-earth/src/features/Profile/api/query.ts:12-32` & `src/features/PublicHome/api/query.ts:420-452` - Update GraphQL queries to request `theme_settings`.
  2. `explorers-earth/src/features/Profile/components/ProfileForm.tsx` - Include `ThemeAppearanceSection` in the accordion form list.
  3. `explorers-earth/src/features/PublicHome/components/PublicProfile.tsx` - Inject dynamic theme tokens, handle wallpaper rendering modes, set initial landing tab, and attach `PublicProfileFooter`.

---

### Task 1: Create Theme Data Types & Theme Presets Engine with Unit Tests

**Files:**
- Create: `explorers-earth/src/features/Profile/types/themeTypes.ts`
- Create: `explorers-earth/src/features/Profile/constants/themePresets.ts`
- Create: `explorers-earth/src/features/Profile/constants/__tests__/themePresets.test.ts`

- [ ] **Step 1: Write failing unit test for theme presets**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write themeTypes.ts interface file**
- [ ] **Step 4: Write themePresets.ts constant & engine file**
- [ ] **Step 5: Run unit test to verify it passes**
- [ ] **Step 6: Commit Task 1**

---

### Task 2: Build Public Profile Footer Branding Component (PublicProfileFooter) with Tests

**Files:**
- Create: `explorers-earth/src/features/PublicHome/components/PublicProfileFooter.tsx`
- Create: `explorers-earth/src/features/PublicHome/components/__tests__/PublicProfileFooter.test.tsx`

- [ ] **Step 1: Write failing test for PublicProfileFooter**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Create PublicProfileFooter.tsx**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit Task 2**

---

### Task 3: Build Dashboard Theme & Appearance Section (ThemeAppearanceSection) with Tests

**Files:**
- Create: `explorers-earth/src/features/Profile/components/ThemeAppearanceSection.tsx`
- Create: `explorers-earth/src/features/Profile/components/__tests__/ThemeAppearanceSection.test.tsx`

- [ ] **Step 1: Write failing component test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write ThemeAppearanceSection.tsx component**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit Task 3**

---

### Task 4: Integrate Theme Controls into ProfileForm.tsx & Update Queries

**Files:**
- Modify: `explorers-earth/src/features/Profile/api/query.ts`
- Modify: `explorers-earth/src/features/PublicHome/api/query.ts`
- Modify: `explorers-earth/src/features/Profile/components/ProfileForm.tsx`

- [ ] **Step 1: Add theme_settings to GraphQL queries**
- [ ] **Step 2: Integrate ThemeAppearanceSection in ProfileForm.tsx**
- [ ] **Step 3: Commit Task 4**

---

### Task 5: Dynamic Theme Engine & Wallpaper Renderer in PublicProfile.tsx

**Files:**
- Modify: `explorers-earth/src/features/PublicHome/components/PublicProfile.tsx`

- [ ] **Step 1: Apply getThemeTokenStyles and dynamic wallpaper modes**
- [ ] **Step 2: Verify build and run full test suite**
- [ ] **Step 3: Commit Task 5**
