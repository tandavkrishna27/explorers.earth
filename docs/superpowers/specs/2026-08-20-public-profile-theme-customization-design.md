# Public Profile Theme & Customization System - Design Specification

**Date:** 2026-08-20
**Status:** Draft / Pending User Review
**Target Applications:** `explorers-earth` (SPA Frontend) & Backend Data Model

---

## 1. Executive Summary

This design specification details the end-to-end architecture for introducing a **Public Profile Theme & Customization System** to `explorers.earth`.

The system connects two main surfaces:
1. **Public Profile Page (`explorers.earth/:username`)** rendered by [`PublicProfile.tsx`](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/explorers-earth/src/features/PublicHome/components/PublicProfile.tsx): Renders a dynamic, theme-responsive public page matching the user's selected preset, wallpaper mode, accent colors, and custom section layout without incurring any latency overhead.
2. **Dashboard Design Controls (`/profile`)** rendered by [`ProfileForm.tsx`](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/explorers-earth/src/features/Profile/components/ProfileForm.tsx): Provides an intuitive Linktree-inspired customization section with live interactive preview.

---

## 2. Key Objectives & Performance Requirements

- **Zero Latency Overhead**: The public profile page must resolve theme variables synchronously from GraphQL/Apollo cache without extra blocking network roundtrips.
- **Backward Compatibility**: Existing profiles default seamlessly to the **Cinematic Dark** preset with **Top Banner Cover** photo, ensuring 100% visual consistency for current users.
- **Theme Variety**: Provide 6 distinct theme presets (*Cinematic Dark*, *Glassmorphism Frost*, *Sunset Glow*, *Minimal Light*, *Emerald Nature*, *Neon Cyber*) with customizable accent colors.
- **Flexible Wallpaper Modes**: Support 4 wallpaper formats (Top Banner Cover, Full-Screen Wallpaper Image, Ambient Gradient Mesh, Solid Color).
- **Default Landing Tab & Visibility Controls**: Allow users to set which tab loads first (*All Recommendations/Places*, *Music*, *Guides*, *Movies*, *Books*, *Games*, *Apps*, *Products*, *People*, *Gallery*, *Business*) and toggle tab visibility.
- **Branded Footer Badge**: Render a clean `explorers.earth` footer branding badge at the bottom of every public profile.

---

## 3. Data Schema & Backend Integration

### 3.1 Strapi & GraphQL Data Model (`theme_settings`)
Theme preferences are stored in a structured JSON object (`theme_settings`) attached to the user's `Account` model in Strapi:

```json
{
  "preset": "cinematic-dark",
  "wallpaperMode": "banner-top",
  "wallpaperUrl": "",
  "accentColor": "#10B981",
  "landingTab": "all-recommendations",
  "visibleTabs": {
    "recommendations": true,
    "gallery": true,
    "business": true
  },
  "footerBranding": "enabled"
}
```

### 3.2 Strapi Setup Requirement
- **Is a new collection required?**
  **No new collection is required in Strapi.** We utilize a JSON attribute `theme_settings` inside the existing `Account` content-type. If the field is not yet defined in Strapi schema, the GraphQL query falls back gracefully to default theme values (`cinematic-dark`, `#10B981`, `banner-top`).

---

## 4. Frontend Architecture & Theme Engine

### 4.1 Theme Token System (`ThemeEngine`)
Instead of hardcoding Tailwind color classes (`bg-black`, `border-[hsl(var(--evergreen))]`), `PublicProfile.tsx` receives dynamic CSS custom properties based on `theme_settings`:

| CSS Variable | Cinematic Dark | Glassmorphism | Sunset Glow | Minimal Light |
| :--- | :--- | :--- | :--- | :--- |
| `--bg-page` | `#090D16` | `#0F172A` | `#1A0B2E` | `#F8FAFC` |
| `--bg-card` | `#111827` | `rgba(255,255,255,0.06)` | `#2D124D` | `#FFFFFF` |
| `--border-card` | `rgba(255,255,255,0.1)` | `rgba(255,255,255,0.2)` | `#3B1766` | `#E2E8F0` |
| `--text-primary` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#0F172A` |
| `--text-secondary` | `#9CA3AF` | `#94A3B8` | `#E9D5FF` | `#64748B` |
| `--backdrop-blur` | `none` | `blur(12px)` | `none` | `none` |

### 4.2 Wallpaper Renderer
- **`banner-top`**: Displays top cover photo with bottom gradient dimming overlay.
- **`full-wallpaper-image`**: Applies `wallpaperUrl` (or `bg_picture`) as a fixed full-screen background image (`bg-cover bg-center`) with dark overlay for readability.
- **`ambient-gradient`**: Applies CSS radial/linear ambient mesh gradient across the page.
- **`solid-color`**: Displays clean, solid background.

### 4.3 Navigation & Landing Tab Handler
When a visitor opens `explorers.earth/:username`, `PublicProfile.tsx` reads `theme_settings.landingTab` and initializes `activeTab`:
- If `landingTab` is set to a specific sub-route (e.g. `places`, `music`, `guides`), it routes directly to that view while preserving profile context.
- Default remains `all-recommendations`.

### 4.4 Branded Footer Component (`PublicProfileFooter.tsx`)
A reusable footer rendered at the bottom of `PublicProfile.tsx`:
- Rendered with `explorers.earth` logo badge, report button, and quick sign-up link.

---

## 5. Dashboard UI & Customization Panel (`/profile`)

Located in [`src/features/Profile/components/ProfileForm.tsx`](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/explorers-earth/src/features/Profile/components/ProfileForm.tsx):

1. **New Accordion Section**: **"Theme & Appearance"** added to the Public Profile tab.
2. **Preset Selector Grid**: Visual cards for preset selection.
3. **Wallpaper & Cover Control**: Radios for selecting top cover banner vs full wallpaper vs ambient gradient.
4. **Accent Color Swatches**: Interactive color circles for picking accent highlights.
5. **Default Landing Tab Selector**: Dropdown to select initial landing tab.
6. **Tab Visibility Toggles**: Checkboxes for toggling profile tabs.
7. **Live Preview Frame**: Responsive preview card that updates in real time as the user selects options.

---

## 6. Verification & Performance Validation Plan

1. **Zero-Latency Verification**:
   - Verify Apollo GraphQL query `getPublicProfileDataQuery` includes `theme_settings` in single network request.
   - Measure Page Load Time (LCP/FID) on `http://localhost:5173/:username` before and after theme engine integration.
2. **Visual Verification**:
   - Verify all 6 theme presets render correctly across desktop and mobile screens.
   - Verify full-screen wallpaper mode and top banner cover mode transition cleanly.
3. **Form & Persistence Verification**:
   - Save theme changes in Dashboard (`/profile`), reload `/:username` in incognito tab, confirm live updates persist.

---
