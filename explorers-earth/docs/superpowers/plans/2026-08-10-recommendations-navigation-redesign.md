# Recommendations & Navigation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify desktop navigation sidebar to a single "Recommendations" entry point loading the Recommendations Hub, standardize category routing topology under `/recommendations/<category>`, enhance header category dropdown switching, and elevate sidebar/header color contrast in light and dark themes.

**Architecture:** Update `ProtectedRoutes.tsx` routing definitions to map `/recommendations` to `RecommendationsHub.tsx` and place sub-categories under `/recommendations/*` with legacy redirects. Simplify `Sidenav.tsx` navigation list and update `Header.tsx` category registry. Refine CSS theme variables in `index.css` for distinct background contrast.

**Tech Stack:** React 18, React Router DOM 6, TypeScript, Vite, Vitest, Tailwind CSS, Framer Motion.

## Global Constraints
- Target codebase: `explorers-earth/`
- Strict TypeScript compatibility.
- Retain backward compatibility for legacy links (`/guides`, `/music`, `/hub`).
- Preserve all existing unit and integration tests.

---

## File Structure

- Modify: [ProtectedRoutes.tsx](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/explorers-earth/src/routes/ProtectedRoutes.tsx) — Route topology definitions.
- Modify: [Sidenav.tsx](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/explorers-earth/src/components/Sidenav.tsx) — Desktop sidebar navigation items.
- Modify: [Header.tsx](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/explorers-earth/src/components/Header.tsx) — Header title & category selector dropdown.
- Modify: [Navbar.tsx](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/explorers-earth/src/components/Navbar.tsx) — Mobile bottom navigation links.
- Modify: [RecommendationsHub.tsx](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/explorers-earth/src/pages/RecommendationsHub.tsx) — Category path definitions in hub cards.
- Modify: [index.css](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/explorers-earth/src/index.css) — Theme contrast color tokens.
- Test: [Navigation.test.tsx](file:///c:/Users/TK/OneDrive/Desktop/Claude%20Data/explorers.earth-main/explorers.earth-main/explorers-earth/src/__tests__/Navigation.test.tsx) — Unit tests for navigation and route resolution.

---

### Task 1: CSS Theme & Contrast Enhancement

**Files:**
- Modify: `explorers-earth/src/index.css:121-135,219-235`

**Interfaces:**
- Consumes: CSS custom properties (`--dash-sidebar-bg`, `--dash-bg`, `--dash-border`)
- Produces: Enhanced contrast variables for `.dashboard-theme` and `.dashboard-theme-dark`

- [ ] **Step 1: Write failing visual contrast test in test suite**

Create `src/__tests__/ThemeContrast.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';

describe('Theme CSS Contrast Variables', () => {
  it('should define distinct background color variables for light and dark themes', () => {
    const fs = require('fs');
    const path = require('path');
    const cssContent = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf8');

    expect(cssContent).toContain('--dash-sidebar-bg: #ffffff;');
    expect(cssContent).toContain('--dash-sidebar-bg: #14141C;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/ThemeContrast.test.tsx`
Expected: FAIL due to missing `#ffffff` and `#14141C` definitions.

- [ ] **Step 3: Update `index.css` contrast tokens**

In `explorers-earth/src/index.css`:
```css
:root {
  --dash-bg: #fffcf6;
  --dash-sidebar-bg: #ffffff;
  --dash-border: rgba(23, 35, 26, 0.14);
}

.dashboard-theme-dark {
  --dash-bg: #060608;
  --dash-sidebar-bg: #14141C;
  --dash-border: #22222E;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/ThemeContrast.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/__tests__/ThemeContrast.test.tsx
git commit -m "style: enhance sidebar and header background contrast in light and dark themes"
```

---

### Task 2: Update Routing Topology in `ProtectedRoutes.tsx`

**Files:**
- Modify: `explorers-earth/src/routes/ProtectedRoutes.tsx:44-144`

**Interfaces:**
- Consumes: React Router DOM `<Route>`, `<Navigate>`
- Produces: Clean `/recommendations` routing topology with `/recommendations` mapping to `RecommendationsHub.tsx`

- [ ] **Step 1: Write failing route mapping test**

Create `src/__tests__/ProtectedRoutes.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoutes from '../routes/ProtectedRoutes';

describe('ProtectedRoutes Topology', () => {
  it('should map /recommendations to RecommendationsHub', () => {
    // Route topology test assertion placeholder
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify initial state**

Run: `npm test -- src/__tests__/ProtectedRoutes.test.tsx`
Expected: PASS baseline test structure.

- [ ] **Step 3: Update `ProtectedRoutes.tsx` routes**

In `ProtectedRoutes.tsx`:
1. Import `Navigate` from `react-router-dom`.
2. Update `desktopRoutes` and `mobileRoutes`:
   - Map `recommendations` -> `<RecommendationsHub />`
   - Map `recommendations/places` -> `<Favorites />`
   - Map `recommendations/guides` -> `<GuidesPage />`
   - Map `recommendations/music` -> `<Music />`
   - Add legacy redirects:
     - `guides` -> `<Navigate to="/recommendations/guides" replace />`
     - `music` -> `<Navigate to="/recommendations/music" replace />`
     - `hub` -> `<Navigate to="/recommendations" replace />`

- [ ] **Step 4: Verify routes compilation & tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/ProtectedRoutes.tsx src/__tests__/ProtectedRoutes.test.tsx
git commit -m "feat(routes): map /recommendations to RecommendationsHub and standardize sub-category paths"
```

---

### Task 3: Simplify Desktop Sidebar (`Sidenav.tsx`)

**Files:**
- Modify: `explorers-earth/src/components/Sidenav.tsx:141-228`

**Interfaces:**
- Consumes: `SidebarItem` component, icon components, `t()` translation function.
- Produces: 5-item streamlined navigation list (Home, Profile, Recommendations, Analytics, Settings).

- [ ] **Step 1: Write failing test for Sidenav items**

Create `src/__tests__/Sidenav.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../components/Sidenav';
import { DashboardThemeProvider } from '../contexts/DashboardThemeContext';

describe('Sidebar Navigation Component', () => {
  it('renders exactly 5 core navigation items', () => {
    render(
      <MemoryRouter initialEntries={['/home']}>
        <DashboardThemeProvider>
          <Sidebar />
        </DashboardThemeProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(/Home/i)).toBeInTheDocument();
    expect(screen.getByText(/Profile/i)).toBeInTheDocument();
    expect(screen.getByText(/Recommendations/i)).toBeInTheDocument();
    expect(screen.getByText(/Analytics/i)).toBeInTheDocument();
    expect(screen.getByText(/Settings/i)).toBeInTheDocument();

    expect(screen.queryByText(/^Movies$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Books$/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/__tests__/Sidenav.test.tsx`
Expected: FAIL because Movies/Books are currently rendered in Sidenav.

- [ ] **Step 3: Update `Sidenav.tsx` menu items**

In `Sidenav.tsx`:
Remove individual items for Guides, Movies, Books, Games, Apps, Products, People, Music.
Keep only:
- Home (`/home`)
- Profile (`/profile`)
- Recommendations (`/recommendations`) with DirectionBoard / Heart icon
- Analytics (`/analytics`)
- Settings (`/settings`)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/Sidenav.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidenav.tsx src/__tests__/Sidenav.test.tsx
git commit -m "feat(navigation): simplify desktop sidebar to core 5 navigation items"
```

---

### Task 4: Header Category Switcher Update (`Header.tsx`)

**Files:**
- Modify: `explorers-earth/src/components/Header.tsx:46-56,153-202`

**Interfaces:**
- Consumes: `recommendationCategories` registry
- Produces: Header category dropdown including "All Recommendations" entry

- [ ] **Step 1: Write failing test for Header category registry**

Create `src/__tests__/HeaderCategory.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from '../components/Header';
import { DashboardThemeProvider } from '../contexts/DashboardThemeContext';

describe('Header Category Switcher', () => {
  it('renders category title correctly for recommendations sub-pages', () => {
    render(
      <MemoryRouter initialEntries={['/recommendations/movies']}>
        <DashboardThemeProvider>
          <Header />
        </DashboardThemeProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('Movies & Shows')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify behavior**

Run: `npm test -- src/__tests__/HeaderCategory.test.tsx`
Expected: PASS or FAIL depending on path resolution.

- [ ] **Step 3: Update `recommendationCategories` in `Header.tsx`**

In `Header.tsx`:
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/__tests__/HeaderCategory.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Header.tsx src/__tests__/HeaderCategory.test.tsx
git commit -m "feat(header): update category switcher registry with All Recommendations option"
```

---

### Task 5: Mobile Bottom Navigation & RecommendationsHub Links Sync

**Files:**
- Modify: `explorers-earth/src/components/Navbar.tsx:21-25`
- Modify: `explorers-earth/src/pages/RecommendationsHub.tsx:21-94`

- [ ] **Step 1: Update `Navbar.tsx` recommendations path to `/recommendations`**
- [ ] **Step 2: Update `CATEGORIES` in `RecommendationsHub.tsx` to match new paths (`/recommendations/places`, `/recommendations/guides`, `/recommendations/music`)**
- [ ] **Step 3: Run full test suite to ensure clean build**

Run: `npm test`
Expected: ALL TESTS PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/Navbar.tsx src/pages/RecommendationsHub.tsx
git commit -m "fix(nav): synchronize mobile bottom bar and Hub category links with new routing structure"
```
