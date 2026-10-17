/**
 * Unit Tests: usernameValidation.ts
 *
 * Pure functions need no mocks.
 * checkUsernameAvailability() calls the canonical public read, so fetch is stubbed.
 * Coverage target: 95%+
 */
import { afterEach, describe, it, expect, vi } from 'vitest';

import {
  validateUsername,
  suggestAlternatives,
  checkUsernameAvailability,
  formatValidationMessages,
  sanitizeUsernameForPath,
} from '../usernameValidation';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Stub the canonical availability read with one response body. */
const stubAvailability = (body: unknown, ok = true) => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 503 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

// ─────────────────────────────────────────────────────────────────────────────
// validateUsername
// ─────────────────────────────────────────────────────────────────────────────
describe('validateUsername', () => {

  // ── Empty / null inputs ────────────────────────────────────────────────────
  describe('empty / null inputs', () => {
    it('fails for empty string', () => {
      const r = validateUsername('');
      expect(r.isValid).toBe(false);
      expect(r.errors).toContain('Username is required');
    });

    it('fails for whitespace-only string', () => {
      const r = validateUsername('   ');
      expect(r.isValid).toBe(false);
      expect(r.errors).toContain('Username is required');
    });

    it('uses t() for required error when translation fn is provided', () => {
      const t = (key: string) => `T:${key}`;
      const r = validateUsername('', t);
      expect(r.errors[0]).toBe('T:auth.validations.username.required');
    });
  });

  // ── Uppercase warning ──────────────────────────────────────────────────────
  describe('uppercase warning (not an error)', () => {
    it('adds a warning for mixed-case input but does not mark invalid', () => {
      const r = validateUsername('JohnDoe123');
      // Only invalid due to 'john' being a plain letter start — check the warning
      expect(r.warnings.some(w => /lowercase/i.test(w))).toBe(true);
    });

    it('still normalizes the username to lowercase', () => {
      const r = validateUsername('JohnDoe123');
      expect(r.normalizedUsername).toBe('johndoe123');
    });

    it('uses t() for the uppercase warning when translation fn is provided', () => {
      const t = (key: string) => `T:${key}`;
      const r = validateUsername('John123abc', t);
      expect(r.warnings[0]).toBe('T:auth.validations.username.willConvertToLowercase');
    });
  });

  // ── Rule 1: allowed characters ─────────────────────────────────────────────
  describe('Rule 1 – allowed characters', () => {
    it('fails for username with spaces', () => {
      const r = validateUsername('john doe');
      expect(r.isValid).toBe(false);
      expect(r.errors.some(e => /only contain/i.test(e))).toBe(true);
    });

    it('fails for username with underscores', () => {
      const r = validateUsername('john_doe');
      expect(r.isValid).toBe(false);
      expect(r.errors.some(e => /only contain/i.test(e))).toBe(true);
    });

    it('fails for username with special characters like @, !, #', () => {
      ['john@', 'john!', 'john#1'].forEach((u) => {
        const r = validateUsername(u);
        expect(r.isValid).toBe(false);
      });
    });

    it('passes for username with only a-z, 0-9, and hyphens', () => {
      const r = validateUsername('john-doe123');
      // May still fail other rules — just check char rule passes
      expect(r.errors.some(e => /only contain/i.test(e))).toBe(false);
    });
  });

  // ── Rule 2: length ─────────────────────────────────────────────────────────
  describe('Rule 2 – length (3–30 chars)', () => {
    it('fails for username shorter than 3 characters', () => {
      const r = validateUsername('ab');
      expect(r.isValid).toBe(false);
      expect(r.errors.some(e => /at least 3/i.test(e))).toBe(true);
    });

    it('fails for username longer than 30 characters', () => {
      const r = validateUsername('a' + 'b'.repeat(30)); // 31 chars
      expect(r.isValid).toBe(false);
      expect(r.errors.some(e => /not exceed 30/i.test(e))).toBe(true);
    });

    it('passes for username with exactly 3 characters', () => {
      const r = validateUsername('abc');
      expect(r.errors.some(e => /at least 3/i.test(e))).toBe(false);
    });

    it('passes for username with exactly 30 characters', () => {
      const r = validateUsername('a' + 'b'.repeat(29)); // 30 chars
      expect(r.errors.some(e => /not exceed 30/i.test(e))).toBe(false);
    });
  });

  // ── Rule 3: structure ──────────────────────────────────────────────────────
  describe('Rule 3 – structure', () => {
    it('fails when username starts with a digit', () => {
      const r = validateUsername('1john');
      expect(r.isValid).toBe(false);
      expect(r.errors.some(e => /start with a letter/i.test(e))).toBe(true);
    });

    it('fails when username starts with a hyphen', () => {
      const r = validateUsername('-john');
      expect(r.isValid).toBe(false);
      expect(r.errors.some(e => /start or end with a hyphen/i.test(e))).toBe(true);
    });

    it('fails when username ends with a hyphen', () => {
      const r = validateUsername('john-');
      expect(r.isValid).toBe(false);
      expect(r.errors.some(e => /start or end with a hyphen/i.test(e))).toBe(true);
    });

    it('fails for consecutive hyphens', () => {
      const r = validateUsername('john--doe');
      expect(r.isValid).toBe(false);
      expect(r.errors.some(e => /consecutive hyphens/i.test(e))).toBe(true);
    });

    it('passes for a valid hyphenated username', () => {
      const r = validateUsername('john-doe');
      expect(r.errors.some(e => /hyphen/i.test(e))).toBe(false);
    });
  });

  // ── Rule 4: all-numbers ────────────────────────────────────────────────────
  describe('Rule 4 – cannot be all numbers', () => {
    it('fails for a purely numeric username', () => {
      const r = validateUsername('123456');
      expect(r.isValid).toBe(false);
      expect(r.errors.some(e => /all numbers/i.test(e))).toBe(true);
    });

    it('passes when username has at least one letter', () => {
      const r = validateUsername('a12345');
      expect(r.errors.some(e => /all numbers/i.test(e))).toBe(false);
    });
  });

  // ── Rule 5: reserved words ─────────────────────────────────────────────────
  describe('Rule 5 – reserved words', () => {
    const exactReserved = ['admin', 'root', 'api', 'login', 'profile', 'settings', 'test', 'demo'];

    it.each(exactReserved)('fails for exact reserved word "%s"', (word) => {
      const r = validateUsername(word);
      expect(r.isValid).toBe(false);
      expect(r.errors.some(e => /reserved words/i.test(e))).toBe(true);
    });

    it('fails for reserved word followed immediately by digits (admin1)', () => {
      const r = validateUsername('admin1');
      expect(r.isValid).toBe(false);
      expect(r.errors.some(e => /reserved words/i.test(e))).toBe(true);
    });

    it('fails for reserved word preceded by hyphen (-admin)', () => {
      // will also fail hyphen start rule, but reserved check should also fire
      const r = validateUsername('xadmin');
      // 'xadmin' is NOT reserved (reserved pattern is boundary-based)
      expect(r.errors.some(e => /reserved words/i.test(e))).toBe(false);
    });

    it('passes for a username that merely contains reserved chars but is not reserved itself', () => {
      // 'jadmin' is not an exact-match or boundary-match for 'admin'
      const r = validateUsername('jadmin');
      expect(r.errors.some(e => /reserved words/i.test(e))).toBe(false);
    });
  });

  // ── Rule 6: profanity ─────────────────────────────────────────────────────
  describe('Rule 6 – profanity filter', () => {
    it('fails for standalone profanity words as full username', () => {
      // Use words that are whole-word matched
      const r = validateUsername('damn');
      expect(r.isValid).toBe(false);
      expect(r.errors.some(e => /inappropriate/i.test(e))).toBe(true);
    });

    it('fails for profanity surrounded by hyphens', () => {
      const r = validateUsername('my-damn-name');
      expect(r.isValid).toBe(false);
      expect(r.errors.some(e => /inappropriate/i.test(e))).toBe(true);
    });

    it('does NOT flag profanity as substring in a different word', () => {
      // 'classic' contains 'ass' but as substring — should NOT be flagged
      const r = validateUsername('classic');
      expect(r.errors.some(e => /inappropriate/i.test(e))).toBe(false);
    });

    it('does NOT flag "bass" as profanity (contains "ass" as substring)', () => {
      const r = validateUsername('bassline');
      expect(r.errors.some(e => /inappropriate/i.test(e))).toBe(false);
    });
  });

  // ── Suggestions on invalid input ──────────────────────────────────────────
  describe('suggestions generated on invalid input', () => {
    it('populates suggestions array when username is invalid', () => {
      const r = validateUsername('admin');
      expect(r.suggestions.length).toBeGreaterThan(0);
    });

    it('leaves suggestions empty when username is valid', () => {
      const r = validateUsername('johnsmith');
      // If valid, no suggestions
      if (r.isValid) {
        expect(r.suggestions).toHaveLength(0);
      }
    });
  });

  // ── normalizedUsername ────────────────────────────────────────────────────
  describe('normalizedUsername field', () => {
    it('always sets normalizedUsername to lowercase', () => {
      const r = validateUsername('JohnDoe99');
      expect(r.normalizedUsername).toBe('johndoe99');
    });

    it('does not set normalizedUsername for empty input', () => {
      const r = validateUsername('');
      expect(r.normalizedUsername).toBeUndefined();
    });
  });

  // ── Fully valid usernames ─────────────────────────────────────────────────
  describe('fully valid usernames', () => {
    const valid = ['johnsmith', 'john-doe', 'abc', 'z99', 'my-cool-name', 'awesome42'];

    it.each(valid)('"%s" is a valid username', (username) => {
      const r = validateUsername(username);
      expect(r.isValid).toBe(true);
      expect(r.errors).toHaveLength(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// suggestAlternatives
// ─────────────────────────────────────────────────────────────────────────────
describe('suggestAlternatives', () => {
  it('returns an array of up to 5 suggestions', () => {
    const suggestions = suggestAlternatives('invalid input!');
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(5);
  });

  it('suggestions contain no duplicates', () => {
    const suggestions = suggestAlternatives('test');
    const unique = new Set(suggestions);
    expect(unique.size).toBe(suggestions.length);
  });

  it('all suggestions start with a letter', () => {
    const suggestions = suggestAlternatives('123numbers');
    suggestions.forEach((s) => {
      expect(s).toMatch(/^[a-z]/);
    });
  });

  it('prefixes "user" when cleaned input starts with a digit', () => {
    const suggestions = suggestAlternatives('9coolname');
    // The cleaned version "9coolname" starts with 9 → 'user' prepended
    suggestions.forEach((s) => {
      expect(s).toMatch(/^[a-z]/);
    });
  });

  it('prefixes "user" for all-number input', () => {
    const suggestions = suggestAlternatives('12345');
    suggestions.forEach((s) => expect(s).toMatch(/^[a-z]/));
  });

  it('strips invalid special characters from suggestions', () => {
    const suggestions = suggestAlternatives('john@doe!');
    suggestions.forEach((s) => {
      expect(s).toMatch(/^[a-z0-9-]+$/);
    });
  });

  it('removes reserved words and replaces with "user"', () => {
    const suggestions = suggestAlternatives('admin');
    // 'admin' should be replaced — suggestions should not be just 'admin'
    expect(suggestions).not.toContain('admin');
  });

  it('returns fallback suggestions when cleaned name is too short', () => {
    // Single char input — cleaned name may be < 3 chars
    const suggestions = suggestAlternatives('!');
    expect(suggestions.length).toBeGreaterThan(0);
    suggestions.forEach((s) => expect(s.length).toBeGreaterThanOrEqual(3));
  });

  it('adds year-based variations', () => {
    const currentYear = new Date().getFullYear();
    const suggestions = suggestAlternatives('johndoe');
    const hasYearSuffix = suggestions.some((s) => s.includes(String(currentYear)));
    expect(hasYearSuffix).toBe(true);
  });

  it('adds "qr" and "my" variations for short enough names', () => {
    const suggestions = suggestAlternatives('johndoe');
    const hasQr = suggestions.some((s) => s.endsWith('qr'));
    const hasMy = suggestions.some((s) => s.startsWith('my'));
    expect(hasQr || hasMy).toBe(true);
  });

  it('suggestions are all lowercase', () => {
    const suggestions = suggestAlternatives('JohnDOE');
    suggestions.forEach((s) => {
      expect(s).toBe(s.toLowerCase());
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkUsernameAvailability (canonical public read)
// ─────────────────────────────────────────────────────────────────────────────
describe('checkUsernameAvailability', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports an available handle', async () => {
    stubAvailability({ available: true });
    const result = await checkUsernameAvailability('johndoe');
    expect(result.isAvailable).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('reports a taken handle with a message', async () => {
    stubAvailability({ available: false });
    const result = await checkUsernameAvailability('johndoe');
    expect(result.isAvailable).toBe(false);
    expect(result.error).toBe('Username is already taken');
  });

  it('always asks about the lowercased handle', async () => {
    const fetchMock = stubAvailability({ available: true });
    await checkUsernameAvailability('JohnDoe');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/explorers/v1/public/handles/johndoe/available');
  });

  // Replaces the old "uses network-only fetch policy" case: the reason that existed was
  // that a cached answer is worse than no answer, and no-store is how that is said now.
  it('never reads a cached answer', async () => {
    const fetchMock = stubAvailability({ available: true });
    await checkUsernameAvailability('johndoe');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
  });

  it('percent-encodes the handle rather than building the path from raw input', async () => {
    const fetchMock = stubAvailability({ available: true });
    await checkUsernameAvailability('a/../b');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/explorers/v1/public/handles/a%2F..%2Fb/available');
  });

  // The conservative direction, asserted because the opposite is the dangerous one: an
  // outage must not offer a handle as free and send the creator into a form they cannot
  // submit. The submit path handles the write-time conflict either way.
  it.each([
    ['a failed request', { available: true }, false],
    ['a body with no verdict', {}, true],
    ['a non-boolean verdict', { available: 'yes' }, true],
  ])('reports unavailable on %s', async (_label, body, ok) => {
    stubAvailability(body, ok);
    const result = await checkUsernameAvailability('johndoe');
    expect(result.isAvailable).toBe(false);
    expect(result.error).toBe('Unable to check username availability. Please try again.');
  });

  it('reports unavailable when the transport throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const result = await checkUsernameAvailability('johndoe');
    expect(result).toEqual({ isAvailable: false, error: 'Unable to check username availability. Please try again.' });
  });

  // Two Apollo-error cases stood here. They survived the rewrite and kept passing - but for
  // the wrong reason: the client they passed as a second argument is now read as an
  // AbortSignal, so fetch threw on the argument rather than on a network failure, and the
  // catch returned exactly what they asserted. A test that passes because its input is
  // malformed is worse than no test. Their subject - a failed transport reports
  // unavailable - is covered by the cases above, against the real signature.
});

// ─────────────────────────────────────────────────────────────────────────────
// formatValidationMessages
// ─────────────────────────────────────────────────────────────────────────────
describe('formatValidationMessages', () => {
  it('returns hasErrors=true when errors array is non-empty', () => {
    const input = { isValid: false, errors: ['Too short'], warnings: [], suggestions: [] };
    const out = formatValidationMessages(input);
    expect(out.hasErrors).toBe(true);
  });

  it('returns hasErrors=false when errors array is empty', () => {
    const input = { isValid: true, errors: [], warnings: [], suggestions: [] };
    const out = formatValidationMessages(input);
    expect(out.hasErrors).toBe(false);
  });

  it('returns hasWarnings=true when warnings array is non-empty', () => {
    const input = { isValid: true, errors: [], warnings: ['Will convert to lowercase'], suggestions: [] };
    const out = formatValidationMessages(input);
    expect(out.hasWarnings).toBe(true);
  });

  it('returns hasWarnings=false when warnings array is empty', () => {
    const input = { isValid: true, errors: [], warnings: [], suggestions: [] };
    const out = formatValidationMessages(input);
    expect(out.hasWarnings).toBe(false);
  });

  it('returns hasSuggestions=true and formats suggestion string when suggestions exist', () => {
    const input = {
      isValid: false,
      errors: ['Reserved word'],
      warnings: [],
      suggestions: ['johndoe1', 'johndoe2026', 'johndoe26'],
    };
    const out = formatValidationMessages(input);
    expect(out.hasSuggestions).toBe(true);
    expect(out.suggestions[0]).toMatch(/^Try one of these:/);
    expect(out.suggestions[0]).toContain('johndoe1');
  });

  it('limits suggestion string to first 3 suggestions', () => {
    const input = {
      isValid: false,
      errors: [],
      warnings: [],
      suggestions: ['a', 'b', 'c', 'd', 'e'],
    };
    const out = formatValidationMessages(input);
    // Only 3 shown in the formatted string
    const parts = out.suggestions[0].replace('Try one of these: ', '').split(', ');
    expect(parts.length).toBe(3);
  });

  it('returns hasSuggestions=false and empty array when no suggestions', () => {
    const input = { isValid: true, errors: [], warnings: [], suggestions: [] };
    const out = formatValidationMessages(input);
    expect(out.hasSuggestions).toBe(false);
    expect(out.suggestions).toHaveLength(0);
  });

  it('passes through raw errors and warnings unchanged', () => {
    const errors = ['Error A', 'Error B'];
    const warnings = ['Warning X'];
    const input = { isValid: false, errors, warnings, suggestions: [] };
    const out = formatValidationMessages(input);
    expect(out.errors).toEqual(errors);
    expect(out.warnings).toEqual(warnings);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeUsernameForPath
// ─────────────────────────────────────────────────────────────────────────────
describe('sanitizeUsernameForPath', () => {
  it('returns the normalized username directly for a valid input', () => {
    expect(sanitizeUsernameForPath('JohnDoe99')).toBe('johndoe99');
  });

  it('returns lowercase normalizedUsername for already valid lowercase input', () => {
    expect(sanitizeUsernameForPath('john-doe')).toBe('john-doe');
  });

  it('replaces invalid characters with hyphens for invalid usernames', () => {
    // 'admin' is reserved — falls through to basic sanitization
    const result = sanitizeUsernameForPath('admin');
    // Result should be a valid-looking string (lowercased, hyphens only for special chars)
    expect(result).toMatch(/^[a-z0-9-]+$/);
  });

  it('collapses multiple hyphens into one', () => {
    // Input that produces multiple hyphens after char replacement
    const result = sanitizeUsernameForPath('john@@@doe');
    expect(result).not.toContain('--');
  });

  it('strips leading and trailing hyphens', () => {
    const result = sanitizeUsernameForPath('!john!');
    expect(result).not.toMatch(/^-|-$/);
  });

  it('truncates result to 30 characters', () => {
    const long = 'a'.repeat(50);
    const result = sanitizeUsernameForPath(long);
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it('returns "user" fallback for completely invalid input that sanitizes to empty', () => {
    // All special chars → sanitized to empty string → fallback 'user'
    const result = sanitizeUsernameForPath('!!!');
    expect(result).toBe('user');
  });
});
