import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isReservedHandle } from '../../../../tunes/shared/explorersReservedHandles';
import { HANDLE_RULE_CASES } from '../../../../tunes/shared/explorersHandleRuleCases';
import { validateUsername } from '../../utils/usernameValidation';

const routesDir = resolve(__dirname, '..');
// PublicRoutes.tsx hangs everything under `:username/*`, so none of its paths are top-level.
const files = ['AppRoutes.tsx', 'AuthRoutes.tsx', 'ProtectedRoutes.tsx'];

function topLevelSegments(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of files) {
    const src = readFileSync(resolve(routesDir, file), 'utf8');
    for (const m of src.matchAll(/<Route[^>]*?\spath="([^"]*)"/g)) {
      const first = m[1].replace(/^\//, '').split('/')[0];
      if (!first || first === '*' || first.startsWith(':')) continue;
      found.set(first.toLowerCase(), file);
    }
  }
  return found;
}

describe('reserved handles vs SPA routes', () => {
  it('finds the route definitions it is meant to guard', () => {
    const segs = topLevelSegments();
    for (const s of ['login', 'about', 'terms', 'hub', 'analytics', 'onboarding', 'reset-password']) expect(segs.has(s)).toBe(true);
  });

  it('reserves every top-level route segment (a gap makes that profile unreachable)', () => {
    const gaps = [...topLevelSegments()].filter(([seg]) => /^[a-z][a-z0-9-]{2,29}$/.test(seg) && !isReservedHandle(seg));
    expect(gaps).toEqual([]);
  });

  it('the SPA validator refuses every top-level route segment', () => {
    for (const [seg] of topLevelSegments()) expect(validateUsername(seg).isValid).toBe(false);
  });
});

describe('SPA and server agree on handle rules', () => {
  it.each(HANDLE_RULE_CASES)('%s -> valid=%s', (input, ok) => {
    expect(validateUsername(input).isValid).toBe(ok);
  });
});
