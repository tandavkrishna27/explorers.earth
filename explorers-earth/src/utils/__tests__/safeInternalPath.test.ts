import { describe, expect, it } from 'vitest';
import { safeInternalPath } from '../safeInternalPath';

const ORIGIN = 'https://app.example';

describe('safeInternalPath', () => {
  const rejected: Array<[string, string | null | undefined]> = [
    ['backslash after slash', '/\\evil.example'],
    ['backslash anywhere', '/ok\\x'],
    ['encoded backslash', '/%5Cevil.example'],
    ['encoded slash pair', '/%2F%2Fevil.example'],
    ['leading tab then //', '\t//evil.example'],
    ['tab inside', '/\t/evil.example'],
    ['newline inside', '/ok\n/x'],
    ['space', '/ok x'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['protocol relative', '//evil.example'],
    ['slash backslash slash', '/\\/evil.example'],
    ['absolute url', 'https://evil.example'],
    ['relative path', 'terms'],
    ['empty', ''],
    ['null', null],
    ['undefined', undefined],
  ];
  it.each(rejected)('rejects %s', (_n, v) => {
    expect(safeInternalPath(v, ORIGIN)).toBeNull();
  });

  it.each([
    ['/ok?x#y', '/ok?x#y'],
    ['/register', '/register'],
    ['/a/b?c=d', '/a/b?c=d'],
    ['/', '/'],
  ])('accepts %s', (v, out) => {
    expect(safeInternalPath(v, ORIGIN)).toBe(out);
  });
});
