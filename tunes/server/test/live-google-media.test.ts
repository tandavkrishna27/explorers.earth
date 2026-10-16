import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLiveGoogleMediaStorage } from '../../scripts/live-google-media';

describe('live Google local media boundary', () => {
  it('rejects external media selection before constructing storage', () => {
    const root = join(tmpdir(), `live-google-media-${randomUUID()}`);
    for (const environment of [
      { EXPLORERS_MEDIA_ENVIRONMENT: 'qa' }, { EXPLORERS_MEDIA_ENVIRONMENT: 'prod' },
      { EXPLORERS_MEDIA_S3_BUCKET: 'existing-bucket' }, { EXPLORERS_MEDIA_S3_REGION: 'us-east-1' },
    ]) expect(() => createLiveGoogleMediaStorage(root, environment)).toThrow('External media authority');
  });

  it('pins uploads to the disposable directory and removes bytes with that directory', async () => {
    const disposable = mkdtempSync(join(tmpdir(), 'live-google-media-'));
    const storage = createLiveGoogleMediaStorage(disposable, {
      EXPLORERS_MEDIA_ENVIRONMENT: 'local', EXPLORERS_MEDIA_LOCAL_ROOT: join(tmpdir(), 'shared-not-selected'),
    });
    const key = `local/${randomUUID()}/${randomUUID()}`;
    try {
      await storage.put(key, Buffer.from('private'));
      expect((await storage.get(key)).toString()).toBe('private');
      expect(storage.environment).toBe('local');
    } finally { rmSync(disposable, { recursive: true, force: true }); }
    await expect(storage.get(key)).rejects.toThrow();
  });
});
