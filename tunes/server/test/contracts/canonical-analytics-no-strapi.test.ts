import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIngestOnlyAnalyticsDependencies } from '../../routes/explorersCanonicalAnalyticsRoutes';

const server = resolve(__dirname, '../..');

describe('analytics has no Strapi path', () => {
  afterEach(() => vi.restoreAllMocks());

  it('canonical no longer loads the legacy analytics composition', () => {
    expect(readFileSync(resolve(server, 'routes/explorersCanonicalAnalyticsRoutes.ts'), 'utf8')).not.toMatch(/import\s*\(/);
    expect(existsSync(resolve(server, 'services/explorers-analytics-composition.ts'))).toBe(false);
  });

  it('the legacy runtime refuses the owner read without calling anything', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const dependencies = createIngestOnlyAnalyticsDependencies({} as never);
    await expect(dependencies.authorizeOwner({ headers: { authorization: 'Bearer anything' } } as never, 'account-1')).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
