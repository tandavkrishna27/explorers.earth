import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// P5-8. Modules nothing can reach. Each one kept compiling, kept its tests green and kept
// pointing at a backend that no longer exists, so a reader could not tell it was dead.
const src = resolve(__dirname, '..');
const repository = resolve(src, '../..');

describe('retired dark code', () => {
  it.each([
    // AuthRoutes redirects /register, /forgot-password, /reset-password, /reset-link-sent
    // and /email-confirmed to /login; Google is the only sign-in (owner decision).
    'pages/Register.tsx', 'pages/ForgotPassword.tsx', 'pages/ResetPassword.tsx',
    'pages/ResetLinkSent.tsx', 'pages/EmailConfirmed.tsx',
    // A developer debug page for the retired /api/instagram server surface.
    'pages/Instagram.tsx',
    // Rendered by Recommendations, but nothing ever opened it.
    'features/Favorites/components/InstagramPostImport.tsx',
  ])('%s is gone', (path) => {
    expect(existsSync(resolve(src, path))).toBe(false);
  });

  it('routes no /instagram page', () => {
    expect(readFileSync(resolve(src, 'routes/ProtectedRoutes.tsx'), 'utf8')).not.toMatch(/path="instagram"/);
  });

  it('keeps no schema-push script that bypasses the migration chain', () => {
    // tunes/scripts/migrate-db.js ran `drizzle-kit push --accept-data-loss`, referenced by
    // no package script; run once it would leave "schema drift after <id>" behind.
    expect(existsSync(resolve(repository, 'tunes/scripts/migrate-db.js'))).toBe(false);
  });
});
