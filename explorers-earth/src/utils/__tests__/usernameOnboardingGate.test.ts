import { describe, expect, it, vi } from 'vitest';
import { RESERVED_HANDLES, handleRuleViolations } from '../../../../tunes/shared/explorersReservedHandles';
import { confirmHandleAvailable, suggestAlternatives } from '../usernameValidation';

const messages = { taken: 'already taken', unavailable: 'Unable to check' };

describe('confirmHandleAvailable (ONB-03)', () => {
  it('passes a free handle', async () => {
    const check = vi.fn().mockResolvedValue({ isAvailable: true });
    await expect(confirmHandleAvailable('Fresh-Name', messages, { check })).resolves.toEqual({ ok: true });
    expect(check).toHaveBeenCalledWith('fresh-name');
  });

  it('blocks a taken handle and offers usable suggestions', async () => {
    const check = vi.fn().mockResolvedValue({ isAvailable: false, error: 'Username is already taken' });
    const result = await confirmHandleAvailable('taken-one', messages, { check });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('already taken');
      expect(result.suggestions.length).toBeGreaterThan(0);
      for (const s of result.suggestions) expect(handleRuleViolations(s)).toEqual([]);
    }
  });

  it('blocks when the availability check could not run', async () => {
    const check = vi.fn().mockResolvedValue({ isAvailable: false, error: 'Unable to check username availability. Please try again.' });
    await expect(confirmHandleAvailable('maybe-free', messages, { check })).resolves.toEqual({ ok: false, error: 'Unable to check', suggestions: [] });
  });

  it('does not treat the account\'s own handle as taken', async () => {
    const check = vi.fn();
    await expect(confirmHandleAvailable('Mine-1', messages, { own: 'mine-1', check })).resolves.toEqual({ ok: true });
    expect(check).not.toHaveBeenCalled();
  });
});

describe('suggestions never include refused handles (ONB-X02)', () => {
  it.each(['music', 'onboarding', 'assets', 'about', 'settings', 'admin', 'alpha', 'ab'])('for %s', (input) => {
    const suggestions = suggestAlternatives(input);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(handleRuleViolations(s)).toEqual([]);
      expect(s).not.toBe(input);
    }
  });

  it('never suggests any reserved route', () => {
    for (const reserved of RESERVED_HANDLES) {
      for (const s of suggestAlternatives(reserved)) expect(handleRuleViolations(s)).toEqual([]);
    }
  });
});
