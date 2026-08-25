# Autoplan restore point: responsive profile editor polish

Date: 2026-08-20
Branch: `codex/profile-settings-tabs`

The user approved a visual refinement of the existing three-tab profile editor.
The implementation must retain all current fields, save behavior, hidden payload
preservation, Settings account/billing moves, and public-profile behavior.

Approved scope:

- Keep exactly three profile-editor tabs: Profile, Gallery, Appearance.
- Change the tab switcher to centered icon-only controls with accessible names,
  visible focus, tooltips, and complete tab keyboard behavior.
- Remove the nested outer form card plus inner accordion-card treatment from the
  Profile page. Profile sections become divider-based accordions.
- Gallery becomes a direct media workspace rather than an accordion inside a card.
- Appearance becomes four ordered areas: Theme style, Public landing,
  Recommendations layout, Category order + live preview.
- Category order supports mouse and touch drag from a visible handle, plus the
  existing keyboard-operable Up/Down fallback and live-region announcements.
- Responsive behavior is intentional at 320/375, 640/768, and 1024+ widths.
- Do not add a fourth profile tab, change the saved wire format, add an API, or add
  a drag-and-drop package.

Approved visual reference:
`C:\Users\TK\.gstack\projects\explorers-earth\designs\responsive-profile-editor-20260820\approved-profile-editor.png`

Resume by reading:

- `docs/superpowers/specs/2026-08-20-responsive-profile-editor-polish-design.md`
- `docs/superpowers/plans/2026-08-20-responsive-profile-editor-polish-plan.md`

