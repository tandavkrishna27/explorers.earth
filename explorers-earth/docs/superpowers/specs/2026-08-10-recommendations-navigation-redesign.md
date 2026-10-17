# Recommendations & Sidebar Navigation Redesign Spec

**Date:** 2026-08-10
**Status:** Approved
**Target App:** `explorers-earth` (Frontend SPA)

---

## 1. Overview & Objectives

This specification defines the restructuring of the navigation sidebar, routing topology, header category dropdown, and theme styling for `explorers-earth`.

### Core Goals:
1. **Sidebar Simplification**: Replace 9 redundant recommendation category links in the left desktop sidebar (`Sidenav.tsx`) with a single **Recommendations** link pointing to `/recommendations`.
2. **Unified Recommendations Hub**: Map `/recommendations` to render `<RecommendationsHub />` (the landing page with interactive category cards for Places, Music, Movies & Shows, Books, Games, Apps & Tools, Products, People, and Guides).
3. **Route Consistency**: Standardize all recommendation sub-categories under `/recommendations/<category>`, establishing clean single sources of truth while preserving backwards-compatible redirects for legacy URLs (`/guides`, `/music`).
4. **Header Category Switcher**: Enhance `Header.tsx` so that when users are inside any category (e.g. `/recommendations/movies`), a header dropdown title allows instant category switching or jumping back to "All Recommendations Hub".
5. **Theme & Contrast Elevation**: Improve `--dash-sidebar-bg` contrast in both light and dark themes in `index.css` so the sidebar and top header clearly stand out from the page background canvas (`--dash-bg`).

---

## 2. Detailed Technical Requirements

### A. Routing Topology (`ProtectedRoutes.tsx`)

| URL Path | Component Rendered | Purpose / Behavior |
|---|---|---|
| `/recommendations` | `RecommendationsHub.tsx` | Main Recommendations Hub with category cards grid |
| `/recommendations/places` | `Favorites.tsx` | Places recommendations page |
| `/recommendations/guides` | `GuidesPage.tsx` | Travel guides page |
| `/recommendations/music` | `Music.tsx` | Music playlists page |
| `/recommendations/movies` | `MoviesHome.tsx` | Movies & Shows page |
| `/recommendations/books` | `BooksHome.tsx` | Books page |
| `/recommendations/games` | `GamesHome.tsx` | Games page |
| `/recommendations/apps` | `AppsHome.tsx` | Apps & Tools page |
| `/recommendations/products` | `ProductsHome.tsx` | Products page |
| `/recommendations/people` | `PeopleHome.tsx` | People page |
| `/guides` | Redirect (`Navigate to="/recommendations/guides" replace />`) | Legacy backward compatibility |
| `/music` | Redirect (`Navigate to="/recommendations/music" replace />`) | Legacy backward compatibility |
| `/hub` | Redirect (`Navigate to="/recommendations" replace />`) | Legacy mobile hub redirect |

### B. Sidebar Items (`Sidenav.tsx`)
Desktop sidebar contains exactly 5 main navigation items:
1. **Home** (`/home`) — `Home` Icon
2. **Profile** (`/profile`) — `Profile` Icon
3. **Recommendations** (`/recommendations`) — `DirectionBoard` or `Heart` Icon
4. **Analytics** (`/analytics`) — `Analytics` Icon
5. **Settings** (`/settings`) — `SettingsIcon` Icon

*Note:* All sub-category items (Places, Movies, Books, Games, Apps, Products, People, Music, Guides) are removed from the main sidebar navigation list.

### C. Header Category Navigation (`Header.tsx`)
1. Define updated category registry in `Header.tsx`:
   ```ts
   const recommendationCategories = [
     { id: 'hub', name: 'All Recommendations', path: '/recommendations' },
     { id: 'places', name: 'Places', path: '/recommendations/places' },
     { id: 'guides', name: 'Guides', path: '/recommendations/guides' },
     { id: 'music', name: 'Music', path: '/recommendations/music' },
     { id: 'movies', name: 'Movies & Shows', path: '/recommendations/movies' },
     { id: 'books', name: 'Books', path: '/recommendations/books' },
     { id: 'games', name: 'Games', path: '/recommendations/games' },
     { id: 'apps', name: 'Apps & Tools', path: '/recommendations/apps' },
     { id: 'products', name: 'Products', path: '/recommendations/products' },
     { id: 'people', name: 'People', path: '/recommendations/people' },
   ];
   ```
2. When current path starts with `/recommendations`, display the active category name with dropdown indicator.
3. Selecting "All Recommendations" navigates to `/recommendations` (The Hub).

### D. CSS Theme & Contrast Enhancement (`index.css`)
1. **Light Mode (`:root`)**:
   - `--dash-bg`: `#fffcf6`
   - `--dash-sidebar-bg`: `#ffffff` (Pure crisp white with clean subtle borders)
   - `--dash-border`: `rgba(23, 35, 26, 0.14)`
2. **Dark Mode (`.dashboard-theme-dark`)**:
   - `--dash-bg`: `#060608`
   - `--dash-sidebar-bg`: `#14141C` (Elevated slate charcoal tone)
   - `--dash-border`: `#22222E`

---

## 3. Verification Plan

1. **Automated Unit & Integration Tests**:
   - Run Vitest suite for routes and sidebar rendering (`npm test` inside `explorers-earth`).
   - Verify category list matching and path resolution.
2. **E2E Browser Verification**:
   - Test navigation from `/home` -> `/recommendations` (Hub).
   - Test clicking category cards on `/recommendations` navigating to Places, Guides, Music, Movies, etc.
   - Test header category dropdown selection and redirects (`/guides` -> `/recommendations/guides`, `/music` -> `/recommendations/music`).
   - Verify visual sidebar and header contrast in Light and Dark mode.
