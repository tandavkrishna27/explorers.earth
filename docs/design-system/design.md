# Internal Design Handbook — explorers.earth

**Version:** 1.0 (Master Standard)  
**Status:** 🔬 Authoritative Reference  

---

## 1. Philosophy

The core design philosophy of explorers.earth is **"One Brand, Two Expressions."**

Our platform serves two distinct user spaces: a public landing page for discovery, and an internal dashboard for recommendation management. Instead of applying a single generic layout across both, we maintain a cohesive brand feel while optimizing each surface for its specific context.

*   **Public Discovery Surface:** Editorial, soft, human, and spacious. Focuses on storytelling, curation, and smooth discovery workflows.
*   **Internal Dashboard Surface:** Functional, compact, and content-rich. Designed for high efficiency, speed, density, and clear status tracking.

---

## 2. Product Identity

explorers.earth is a collective recommendation platform. It acts as a trusted catalog of places, books, movies, games, and recommendations.

Our identity is inspired by premium travel and lifestyle journals (e.g. Airbnb). It feels human and curated rather than cold, corporate, or overly technical.

---

## 3. Design Principles

*   **Standardize, Don't Recreate:** Establish consistent reusable layout tokens rather than coding ad-hoc styles.
*   **Minimize Visual Noise:** Avoid unnecessary lines, boxes, and borders. Use white space and background shading to separate sections instead.
*   **Interactive Affordance:** Interactive controls must respond dynamically to user pointer inputs (hover, click, tap).
*   **Content-First:** Prioritize high-quality media images and clear typography headers.

---

## 4. UX Principles

*   **Immediate Feedback:** Inform the user immediately during background API mutations (using button spinners or optimistic updates).
*   **Prevent Data Loss:** Always warn users if they navigate away from forms with unsaved changes.
*   **Clear Error Resolution:** Never show unformatted code stacks. Keep error messages user-friendly and actionable.
*   **Accessible by Default:** Ensure focus outlines are visible, layouts are screen-reader compatible, and text contrast is sufficient.

---

## 5. Brand Personality

*   **Curated & Personal:** Emphasizes human recommendations over algorithm-generated feeds.
*   **Grounded & Trustworthy:** Uses forest-green brand anchors to evoke nature and stability.
*   **Aspirational:** Features high-quality images and editorial layouts that inspire exploration.

---

## 6. Visual Language

Our visual language transitions between two distinct themes:

*   **Light Editorial Expression:** Uses off-white backgrounds, warm beige blocks, and soft-blue primary action colors.
*   **Dark Evergreen Expression:** Scoped inside the dashboard. Uses deep green (`#2E4032`) and charcoal (`#0F1419`) tones to keep focus on media content.

---

## 7. Colors

### 7.1 Primitive Palette
*   **Evergreen 900 (Brand Anchor):** `#1B3B1A`
*   **Evergreen 700 (Dashboard BG):** `#2E4032`
*   **Blue 500 (Interactive CTA):** `#3B82F6` (standard action blue)
*   **Blue 600 (Hover CTA):** `#2563EB`
*   **Neutral 50 (Soft Off-white):** `#F9F9F6`
*   **Neutral 950 (Near Black):** `#0F1419`

### 7.2 Semantic Mapping
*   **`--dash-bg`:** `#2E4032` (Light dashboard) / `#0F1419` (Dark dashboard)
*   **`--dash-sidebar-bg`:** `#223126` (Light dashboard) / `#1A1F2E` (Dark dashboard)
*   **`--dash-accent`:** `#3B82F6` (Light dashboard) / `#60A5FA` (Dark dashboard)
*   **`--public-bg-primary`:** `#F9F9F6` (Light page background)
*   **`--public-cta`:** `#3B82F6` (Public primary button)

---

## 8. Typography

We use Poppins as our primary typeface, supported by standard system fallbacks.

*   **Primary Font Face:** `'Poppins', system-ui, sans-serif`
*   **Secondary Font Face (Fallback):** `'Inter', system-ui, sans-serif`

### Type Scale
*   **Heading 1:** 30px / font-weight: 700 (Hero elements)
*   **Heading 2:** 20px / font-weight: 700 (Section headers, modals)
*   **Body Text:** 14px / font-weight: 400 (Paragraph blocks, settings)
*   **Subtext:** 12px / font-weight: 400 (Captions, tag lists)

---

## 9. Spacing

We use a standard 4px spacing unit to keep elements aligned consistently.

*   `--space-1`: 4px (Tag list items, badges)
*   `--space-2`: 8px (Inner label-to-input gap)
*   `--space-4`: 16px (Standard grid gaps, card margins)
*   `--space-6`: 24px (Page layout gaps, section margins)

---

## 10. Layout

### 10.1 Breakpoints
*   `sm`: 640px (Mobile viewports, stacked fields)
*   `md`: 768px (Sidebar hinge point - switches to bottom navigation below this width)
*   `lg`: 1024px (Wide desktop grids)

### 10.2 Navigation Offset
The main content area margins are sidebar-aware:
```css
.dashboard-content {
  margin-left: 256px;
  width: calc(100% - 256px);
}
body[data-sidebar-open="false"] .dashboard-content {
  margin-left: 64px;
  width: calc(100% - 64px);
}
```

---

## 11. Components

All components must build on top of our design tokens and foundations. 

*   **Primitives (Buttons, Inputs, Checkboxes):** Must map class colors dynamically and use standard ARIA tags.
*   **Composites (Cards, Modals, Dropdowns, Tabs, Accordions):** Must support theme overrides and follow unified layout rules.

For detailed element attributes, check the [HTML Reference Library](file:///D:/Project/explorers.earth/docs/design-system/04-html-reference-library.md).

---

## 12. Forms

*   **Layout:** Stack fields vertically using `flex flex-col` layouts.
*   **Gaps:** Use a standard 8px gap between labels and inputs, and 16px gaps between field groups.
*   **Autocomplete:** Form inputs must declare standard autocompletion tags (e.g. `autocomplete="username"`).

---

## 13. Tables

*   **Layout:** Use clean headers and hover-highlighted rows.
*   **Actions:** Place edit and delete buttons on the right side of the row.
*   **Interactive Drag and Drop:** Drag actions must use custom properties rather than rendering raw text.

---

## 14. Navigation

*   **Desktop Navigation:** Vertical collapsible sidebar.
*   **Mobile Navigation:** Sticky bottom tab bar.
*   **Header Hiding:** The dashboard header hides on scroll to save screen space, returning when the user scrolls up.

---

## 15. Empty States

Render empty states whenever list fetches return empty arrays:
*   Use a centered layout containing a muted icon, a short title, a description, and a clear next-step CTA button.

---

## 16. Error States

*   **Boundary Isolations:** Wrap page errors in isolated component panels.
*   **Messages:** Provide simple, user-friendly descriptions and a "Try Again" button instead of raw code stack traces.

---

## 17. Loading States

*   **Button Spinners:** Disable button interactions and show spinner SVGs during form saves.
*   **Skeletons:** Use shimmer card grids to represent loading states during initial page loads.
*   **Route Overlays:** Use `RouteLoader` overlays during major page-to-page transitions.

---

## 18. Motion

*   **Hover Transitions:** Standard transitions must complete in 160ms using a standard easing curve (`cubic-bezier(0.4, 0, 0.2, 1)`).
*   **Animations:** Use Framer Motion presets for page entry overlays and dropdown fades:
    *   Snappy Transitions: `stiffness: 200`, `damping: 18`.

---

## 19. Accessibility (A11y)

*   **Keyboard Focus:** Focus outlines must remain visible. Do not use `outline: none` without providing an alternative focus style.
*   **Markup Standards:** Interactive controls must use semantic HTML tags. Do not use `div` elements for button actions.
*   **Contrast Mappings:** Text labels must meet WCAG AA contrast standards (minimum ratio of 4.5:1).

---

## 20. Responsive Rules

*   **Stacked Layouts:** Stack form layouts and lists vertically on viewports under 640px.
*   **Hinge Gaps:** Re-render wide grids as single-column layouts on mobile viewports.

---

## 21. AI Agent Rules

*   **Token Standard compliance:** Check variables inside `01-design-tokens.md` before applying inline colors.
*   **Anti-pattern Checks:** Never query the active DOM (using `document.querySelector`) inside rendering functions.
*   **Accessibility Checks:** Ensure all custom components have standard ARIA attributes.

---

## 22. Contribution Process

*   **Design Proposal:** Submit proposed style updates to the Design Board.
*   **Token Drafting:** Update `01-design-tokens.md` before implementing changes in code.
*   **Visual Validation:** Verify rendering compliance using the HTML Reference Library.

---

## 23. Future Expansion

*   **Phase 1:** Unify buttons and remove duplicate components (e.g. accordion variants).
*   **Phase 2:** Refactor modal wrappers to share a common backdrop portal.
*   **Phase 3:** Extract nested layout spacing into standard CSS classes.

---

## 24. Reusable status and lifecycle guidance

When a capability has independent identity, entitlement, publication, content, and lifecycle states, do not collapse them into one connected/disconnected badge. Show only the state that determines the user's next action:

*   Healthy automatic identity projection is invisible.
*   Temporary checking/outage states preserve the current page and use a polite live region.
*   Suspended and pending-deletion states explain the authoritative recovery action without exposing internal service, token, or database language.
*   Pending deletion remains visible across reloads and tabs until completed or validly cancelled.
*   Private, unlisted, and public are explicit publication controls, not identity health.
*   Unknown entitlement may show nonblocking checking, while included core Music remains usable.

Use existing semantic colors, status components, dialogs, focus rules, reduced-motion behavior, and 320/375px responsive acceptance. Never use color alone, a toast alone, or optimistic disappearance to communicate an irreversible lifecycle boundary.
