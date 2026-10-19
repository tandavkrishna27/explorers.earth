import { describe, expect, it } from 'vitest';
import { createUsernameValidation } from '../data';

const t = ((k: string) => k) as never;

describe('profile username schema only checks a handle being chosen', () => {
  it('lets an existing now-reserved handle save unchanged (any case)', async () => {
    await expect(createUsernameValidation(t, 'about').isValid('About')).resolves.toBe(true);
  });
  it('refuses changing to a reserved handle', async () => {
    await expect(createUsernameValidation(t, 'fine-name').isValid('about')).resolves.toBe(false);
  });
  it('accepts changing from a reserved handle to a valid one', async () => {
    await expect(createUsernameValidation(t, 'about').isValid('my-about-page')).resolves.toBe(true);
  });
  it('without a current handle (onboarding) still enforces the rules', async () => {
    await expect(createUsernameValidation(t).isValid('about')).resolves.toBe(false);
  });
});
